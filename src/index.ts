import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  CONVERSATION_CONTEXT_WINDOW,
  GROUPS_DIR,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { getSystemPrompt, OllamaOutput } from './ollama-runner.js';
import { runDirectAgent } from './direct-runner.js';
import { runContainerAgent, ContainerOutput } from './container-runner.js';
import { getContainerConfig } from './container-runtime.js';
import { getRuntimeStrategy } from './runtime-strategy.js';
import {
  getAllRegisteredGroups,
  getAllSessions,
  getConversationMessages,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startEnhancedIPC } from './ipc-enhanced.js';
import { formatMessages } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';
import {
  ensureGlobalMemoryFiles,
  ensureGroupMemoryFiles,
  loadMemoryContext,
} from './memory-context.js';
import {
  syncSkillsToGroup,
  listSkills,
  syncSkillsToAllGroups,
} from './skills.js';
import {
  formatSkillsListMessage,
  extractSkillInvocations,
  parseHostSkillCommand,
} from './skill-commands.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;

let whatsapp: WhatsAppChannel;
const queue = new GroupQueue();

function loadState(): void {
  lastTimestamp = getRouterState('last_timestamp') || '';
  const agentTs = getRouterState('last_agent_timestamp');
  try {
    lastAgentTimestamp = agentTs ? JSON.parse(agentTs) : {};
  } catch {
    logger.warn('Corrupted last_agent_timestamp in DB, resetting');
    lastAgentTimestamp = {};
  }
  sessions = getAllSessions();
  registeredGroups = getAllRegisteredGroups();
  logger.info(
    { groupCount: Object.keys(registeredGroups).length },
    'State loaded',
  );
}

function saveState(): void {
  setRouterState('last_timestamp', lastTimestamp);
  setRouterState('last_agent_timestamp', JSON.stringify(lastAgentTimestamp));
}

function registerGroup(jid: string, group: RegisteredGroup): void {
  registeredGroups[jid] = group;
  setRegisteredGroup(jid, group);

  // Create group folder
  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(path.join(groupDir, 'logs'), { recursive: true });

  // Create CLAUDE.md + legacy MEMORY.md defaults
  ensureGroupMemoryFiles(groupDir, ASSISTANT_NAME, group.name);

  // Sync skills to this group
  syncSkillsToGroup(group.folder);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

async function handleHostSkillCommand(chatJid: string): Promise<void> {
  const skills = listSkills();
  await whatsapp.sendMessage(chatJid, formatSkillsListMessage(skills));
}

function getRequestedSkillsFromMessages(messages: NewMessage[]): string[] {
  const availableSkills = listSkills();
  if (availableSkills.length === 0) return [];

  const requested = new Set<string>();
  for (const message of messages) {
    const invocations = extractSkillInvocations(
      message.content,
      availableSkills,
    );
    for (const skillName of invocations) {
      requested.add(skillName);
    }
  }

  return Array.from(requested);
}

function buildSkillContextPrompt(requestedSkills: string[]): string {
  if (requestedSkills.length === 0) return '';

  const maxSkills = 2;
  const maxCharsPerSkill = 8000;
  const sections: string[] = [];

  for (const skillName of requestedSkills.slice(0, maxSkills)) {
    const skillFile = path.join(
      process.cwd(),
      'container',
      'skills',
      skillName,
      'SKILL.md',
    );

    if (!fs.existsSync(skillFile)) continue;
    const raw = fs.readFileSync(skillFile, 'utf-8');
    const content =
      raw.length > maxCharsPerSkill
        ? `${raw.slice(0, maxCharsPerSkill)}\n\n[truncated by BabyBot]`
        : raw;
    sections.push(`## Skill /${skillName}\n${content}`);
  }

  if (sections.length === 0) return '';

  return [
    'Skill Context:',
    'If user intent matches these skills, follow them as implementation instructions.',
    ...sections,
  ].join('\n\n');
}

async function maybeHandleHostSkillCommand(
  chatJid: string,
  messages: NewMessage[],
): Promise<boolean> {
  for (let i = messages.length - 1; i >= 0; i--) {
    const command = parseHostSkillCommand(messages[i].content);
    if (!command) continue;

    if (command.type === 'list-skills') {
      lastAgentTimestamp[chatJid] = messages[messages.length - 1].timestamp;
      saveState();
      await handleHostSkillCommand(chatJid);
      return true;
    }
  }

  return false;
}

async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(
    chatJid,
    sinceTimestamp,
    ASSISTANT_NAME,
  );

  if (missedMessages.length === 0) return true;

  if (await maybeHandleHostSkillCommand(chatJid, missedMessages)) {
    return true;
  }

  const requestedSkills = getRequestedSkillsFromMessages(missedMessages);
  const hasSkillInvocation = requestedSkills.length > 0;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false && !hasSkillInvocation) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const latestMessageTimestamp =
    missedMessages[missedMessages.length - 1].timestamp;
  const promptMessages = getConversationMessages(
    chatJid,
    latestMessageTimestamp,
    CONVERSATION_CONTEXT_WINDOW,
  );
  const prompt = formatMessages(
    promptMessages.length > 0 ? promptMessages : missedMessages,
  );

  // Advance cursor
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] = latestMessageTimestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length, requestedSkills },
    'Processing messages',
  );

  await whatsapp.setTyping(chatJid, true);
  let hadError = false;

  const output = await runAgent(
    group,
    prompt,
    chatJid,
    requestedSkills,
    async (result) => {
      if (result.result) {
        const text = result.result.trim();
        logger.info(
          { group: group.name },
          `Agent output: ${text.slice(0, 200)}`,
        );
        if (text) {
          await whatsapp.sendMessage(chatJid, text);
        }
      }

      if (result.status === 'error') {
        hadError = true;
      }
    },
  );

  await whatsapp.setTyping(chatJid, false);

  if (output === 'error' || hadError) {
    lastAgentTimestamp[chatJid] = previousCursor;
    saveState();
    logger.warn(
      { group: group.name },
      'Agent error, rolled back message cursor for retry',
    );
    return false;
  }

  return true;
}

async function runAgent(
  group: RegisteredGroup,
  prompt: string,
  chatJid: string,
  requestedSkills: string[] = [],
  onOutput?: (output: OllamaOutput | ContainerOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  const memoryContext = loadMemoryContext(GROUPS_DIR, group.folder);

  // Build system prompt with memory
  const skillContext = buildSkillContextPrompt(requestedSkills);
  const systemPrompt =
    getSystemPrompt(group.name, isMain) +
    (memoryContext ? `\n\nMemory/Context:\n${memoryContext}` : '') +
    (skillContext ? `\n\n${skillContext}` : '');

  const wrappedOnOutput = onOutput
    ? async (output: OllamaOutput | ContainerOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const input = {
      prompt,
      sessionId,
      groupFolder: group.folder,
      chatJid,
      isMain,
      systemPrompt,
    };

    const runtimeConfig = getContainerConfig();
    const strategy = getRuntimeStrategy(
      process.env.CONTAINER_RUNTIME,
      runtimeConfig.runtime,
    );

    let output: OllamaOutput | ContainerOutput;

    if (strategy.useContainer) {
      output = await runContainerAgent(
        group,
        input,
        undefined,
        wrappedOnOutput,
      );
      if (output.status === 'error' && strategy.allowFallbackToDirect) {
        logger.warn(
          { group: group.name, error: output.error },
          'Container execution failed in auto mode, falling back to direct provider execution',
        );
        output = await runDirectAgent(group, input, wrappedOnOutput);
      }
    } else {
      output = await runDirectAgent(group, input, wrappedOnOutput);
    }

    if (output.newSessionId) {
      sessions[group.folder] = output.newSessionId;
      setSession(group.folder, output.newSessionId);
    }

    if (output.status === 'error') {
      logger.error({ group: group.name, error: output.error }, 'Agent error');
      return 'error';
    }

    return 'success';
  } catch (err) {
    logger.error({ group: group.name, err }, 'Agent error');
    return 'error';
  }
}

async function startMessageLoop(): Promise<void> {
  if (messageLoopRunning) {
    logger.debug('Message loop already running, skipping duplicate start');
    return;
  }
  messageLoopRunning = true;

  logger.info(`BabyBot running (trigger: @${ASSISTANT_NAME})`);

  while (true) {
    try {
      const jids = Object.keys(registeredGroups);
      const { messages, newTimestamp } = getNewMessages(
        jids,
        lastTimestamp,
        ASSISTANT_NAME,
      );

      if (messages.length > 0) {
        logger.info({ count: messages.length }, 'New messages');

        lastTimestamp = newTimestamp;
        saveState();

        // Group messages by chat
        const messagesByGroup = new Map<string, NewMessage[]>();
        for (const msg of messages) {
          const existing = messagesByGroup.get(msg.chat_jid);
          if (existing) {
            existing.push(msg);
          } else {
            messagesByGroup.set(msg.chat_jid, [msg]);
          }
        }

        for (const [chatJid, groupMessages] of messagesByGroup) {
          const group = registeredGroups[chatJid];
          if (!group) continue;

          const isMainGroup = group.folder === MAIN_GROUP_FOLDER;
          const needsTrigger = !isMainGroup && group.requiresTrigger !== false;

          if (needsTrigger) {
            const hasTrigger = groupMessages.some((m) =>
              TRIGGER_PATTERN.test(m.content.trim()),
            );
            const availableSkills = listSkills();
            const hasSkillInvocation = groupMessages.some(
              (m) =>
                extractSkillInvocations(m.content, availableSkills).length > 0,
            );
            if (!hasTrigger && !hasSkillInvocation) continue;
          }

          // Enqueue processing
          queue.enqueue(chatJid, () => processGroupMessages(chatJid));
        }
      }

      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    } catch (error) {
      logger.error({ error }, 'Error in message loop');
      await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL));
    }
  }
}

async function main(): Promise<void> {
  logger.info('BabyBot starting...');

  // Initialize database
  initDatabase();
  loadState();
  ensureGlobalMemoryFiles(GROUPS_DIR, ASSISTANT_NAME);

  // Create main group if not exists
  const mainJid = '__main__';
  if (!registeredGroups[mainJid]) {
    registerGroup(mainJid, {
      name: 'Main',
      folder: MAIN_GROUP_FOLDER,
      requiresTrigger: false,
    });
  }

  // Sync skills to all existing groups
  const skills = listSkills();
  const groupFolders = [
    ...new Set(Object.values(registeredGroups).map((g) => g.folder)),
  ];
  for (const group of Object.values(registeredGroups)) {
    ensureGroupMemoryFiles(
      path.join(GROUPS_DIR, group.folder),
      ASSISTANT_NAME,
      group.name,
    );
  }
  syncSkillsToAllGroups(groupFolders);
  logger.info({ skillCount: skills.length }, 'Available skills loaded');

  // Initialize WhatsApp
  whatsapp = new WhatsAppChannel();

  await whatsapp.connect(
    async (chatJid, senderJid, senderName, text, chatName) => {
      // Auto-register new chats/groups on first inbound message
      if (!registeredGroups[chatJid]) {
        // Derive a filesystem-safe folder name from the chat JID
        const safeFolder = chatJid.replace(/[^a-zA-Z0-9_\-]/g, '_');

        // Use the actual chat name from WhatsApp, or fallback to sender name for DMs
        const groupName = chatJid.endsWith('@g.us')
          ? chatName
          : `Chat with ${senderName}`;

        logger.info(
          { chatJid, groupName, folder: safeFolder },
          'Auto-registering new chat/group',
        );

        registerGroup(chatJid, {
          name: groupName,
          folder: safeFolder,
          // Require trigger word for auto-created groups to avoid unsolicited responses
          requiresTrigger: true,
        });
      }
    },
  );

  // Wait for connection
  while (!whatsapp.isConnected()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Start Enhanced IPC watcher
  startEnhancedIPC(async (groupFolder, data) => {
    logger.info({ groupFolder, data }, 'Received IPC message');
    // Handle IPC messages (e.g., tasks, admin commands)
  });

  // Start task scheduler
  startSchedulerLoop(async (task) => {
    logger.info({ task }, 'Executing scheduled task');
    // Find group for this task
    const group = Object.values(registeredGroups).find(
      (g) => g.folder === task.groupFolder,
    );
    if (!group) {
      logger.warn({ task }, 'Group not found for scheduled task');
      return;
    }

    // Find chat JID for this group
    const chatJid = Object.keys(registeredGroups).find(
      (jid) => registeredGroups[jid].folder === task.groupFolder,
    );
    if (!chatJid) {
      logger.warn({ task }, 'Chat JID not found for scheduled task');
      return;
    }

    // Run the task
    await runAgent(group, task.prompt, chatJid, [], async (result) => {
      if (result.result && chatJid !== '__main__') {
        await whatsapp.sendMessage(chatJid, result.result);
      }
    });
  });

  // Start message processing loop
  startMessageLoop();
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
