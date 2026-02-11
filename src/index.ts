import fs from 'fs';
import path from 'path';

import {
  ASSISTANT_NAME,
  DATA_DIR,
  GROUPS_DIR,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import {
  runOllamaAgent,
  getSystemPrompt,
  OllamaOutput,
} from './ollama-runner.js';
import {
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startIpcWatcher } from './ipc.js';
import { formatMessages } from './router.js';
import { startSchedulerLoop } from './task-scheduler.js';
import { NewMessage, RegisteredGroup } from './types.js';
import { logger } from './logger.js';

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

  // Create CLAUDE.md equivalent (memory file)
  const memoryFile = path.join(groupDir, 'MEMORY.md');
  if (!fs.existsSync(memoryFile)) {
    fs.writeFileSync(
      memoryFile,
      `# ${group.name} Memory\n\nThis file stores context and memory for the ${group.name} group.\n`,
    );
  }

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup = group.folder === MAIN_GROUP_FOLDER;

  const sinceTimestamp = lastAgentTimestamp[chatJid] || '';
  const missedMessages = getMessagesSince(chatJid, sinceTimestamp, ASSISTANT_NAME);

  if (missedMessages.length === 0) return true;

  // For non-main groups, check if trigger is required and present
  if (!isMainGroup && group.requiresTrigger !== false) {
    const hasTrigger = missedMessages.some((m) =>
      TRIGGER_PATTERN.test(m.content.trim()),
    );
    if (!hasTrigger) return true;
  }

  const prompt = formatMessages(missedMessages);

  // Advance cursor
  const previousCursor = lastAgentTimestamp[chatJid] || '';
  lastAgentTimestamp[chatJid] = missedMessages[missedMessages.length - 1].timestamp;
  saveState();

  logger.info(
    { group: group.name, messageCount: missedMessages.length },
    'Processing messages',
  );

  await whatsapp.setTyping(chatJid, true);
  let hadError = false;

  const output = await runAgent(group, prompt, chatJid, async (result) => {
    if (result.result) {
      const text = result.result.trim();
      logger.info({ group: group.name }, `Agent output: ${text.slice(0, 200)}`);
      if (text) {
        await whatsapp.sendMessage(chatJid, text);
      }
    }

    if (result.status === 'error') {
      hadError = true;
    }
  });

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
  onOutput?: (output: OllamaOutput) => Promise<void>,
): Promise<'success' | 'error'> {
  const isMain = group.folder === MAIN_GROUP_FOLDER;
  const sessionId = sessions[group.folder];

  // Read memory file if exists
  const memoryFile = path.join(GROUPS_DIR, group.folder, 'MEMORY.md');
  let memoryContext = '';
  if (fs.existsSync(memoryFile)) {
    memoryContext = fs.readFileSync(memoryFile, 'utf-8');
  }

  // Build system prompt with memory
  const systemPrompt =
    getSystemPrompt(group.name, isMain) +
    (memoryContext ? `\n\nMemory/Context:\n${memoryContext}` : '');

  const wrappedOnOutput = onOutput
    ? async (output: OllamaOutput) => {
        if (output.newSessionId) {
          sessions[group.folder] = output.newSessionId;
          setSession(group.folder, output.newSessionId);
        }
        await onOutput(output);
      }
    : undefined;

  try {
    const output = await runOllamaAgent(
      group,
      {
        prompt,
        sessionId,
        groupFolder: group.folder,
        chatJid,
        isMain,
        systemPrompt,
      },
      wrappedOnOutput,
    );

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
            if (!hasTrigger) continue;
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

  // Create main group if not exists
  const mainJid = '__main__';
  if (!registeredGroups[mainJid]) {
    registerGroup(mainJid, {
      name: 'Main',
      folder: MAIN_GROUP_FOLDER,
      requiresTrigger: false,
    });
  }

  // Initialize WhatsApp
  whatsapp = new WhatsAppChannel();

  await whatsapp.connect(async (chatJid, senderJid, senderName, text) => {
    // Message is already stored by WhatsAppChannel
    logger.debug({ chatJid, senderName }, 'Message received callback');
  });

  // Wait for connection
  while (!whatsapp.isConnected()) {
    await new Promise((resolve) => setTimeout(resolve, 1000));
  }

  // Start IPC watcher
  startIpcWatcher(async (groupFolder, data) => {
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
    await runAgent(
      group,
      task.prompt,
      chatJid,
      async (result) => {
        if (result.result && chatJid !== '__main__') {
          await whatsapp.sendMessage(chatJid, result.result);
        }
      },
    );
  });

  // Start message processing loop
  startMessageLoop();
}

main().catch((error) => {
  logger.error({ error }, 'Fatal error');
  process.exit(1);
});
