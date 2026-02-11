import 'dotenv/config';
import fs from 'fs';
import path from 'path';

import {
  AUTO_REGISTER_NEW_CHATS,
  ASSISTANT_NAME,
  CONVERSATION_CONTEXT_WINDOW,
  GROUPS_DIR,
  MAIN_CHAT_JID,
  MAIN_GROUP_FOLDER,
  POLL_INTERVAL,
  TRIGGER_PATTERN,
} from './config.js';
import { WhatsAppChannel } from './channels/whatsapp.js';
import { getSystemPrompt, OllamaOutput } from './ollama-runner.js';
import { runDirectAgent } from './direct-runner.js';
import {
  AvailableGroup,
  ContainerOutput,
  runContainerAgent,
  writeGroupsSnapshot,
  writeTasksSnapshot,
} from './container-runner.js';
import {
  ensureContainerRuntimeReady,
  getContainerConfig,
} from './container-runtime.js';
import { getRuntimeStrategy } from './runtime-strategy.js';
import {
  createTask,
  deleteRegisteredGroup,
  deleteTask,
  deleteTasksForGroup,
  getAllChats,
  getAllRegisteredGroups,
  getAllSessions,
  getAllTasks,
  getConversationMessages,
  getMessagesSince,
  getNewMessages,
  getRouterState,
  getTaskById,
  initDatabase,
  setRegisteredGroup,
  setRouterState,
  setSession,
  updateTaskDefinition,
  updateTaskStatus,
} from './db.js';
import { GroupQueue } from './group-queue.js';
import { startIpcWatcher } from './ipc.js';
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
  HostSkillCommand,
  isHostCommandText,
  parseHostSkillCommand,
} from './skill-commands.js';
import { computeNextRun } from './scheduling.js';

let lastTimestamp = '';
let sessions: Record<string, string> = {};
let registeredGroups: Record<string, RegisteredGroup> = {};
let lastAgentTimestamp: Record<string, string> = {};
let messageLoopRunning = false;
const mainChatJid = MAIN_CHAT_JID;

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

function isMainGroupByJid(chatJid: string): boolean {
  return chatJid === mainChatJid;
}

function getAvailableGroups(): AvailableGroup[] {
  const chats = getAllChats();
  const groups: AvailableGroup[] = chats.map((chat) => ({
    jid: chat.jid,
    name: chat.name,
    lastActivity: chat.last_message_time,
    isRegistered: Boolean(registeredGroups[chat.jid]),
  }));

  const seen = new Set(groups.map((group) => group.jid));
  for (const [jid, group] of Object.entries(registeredGroups)) {
    if (seen.has(jid)) continue;
    groups.push({
      jid,
      name: group.name,
      lastActivity: new Date(0).toISOString(),
      isRegistered: true,
    });
  }

  return groups.sort((a, b) => {
    const aTime = Date.parse(a.lastActivity) || 0;
    const bTime = Date.parse(b.lastActivity) || 0;
    return bTime - aTime;
  });
}

function updateIpcSnapshotsForGroup(groupFolder: string, isMain: boolean): void {
  const tasks = getAllTasks().map((task) => ({
    id: task.id,
    groupFolder: task.group_folder,
    prompt: task.prompt,
    schedule_type: task.schedule_type,
    schedule_value: task.schedule_value,
    status: task.status,
    next_run: task.next_run,
  }));

  writeTasksSnapshot(groupFolder, isMain, tasks);
  writeGroupsSnapshot(groupFolder, isMain, getAvailableGroups());
}

function updateIpcSnapshotsForAllGroups(): void {
  const folders = new Set(Object.values(registeredGroups).map((g) => g.folder));
  for (const folder of folders) {
    updateIpcSnapshotsForGroup(folder, folder === MAIN_GROUP_FOLDER);
  }
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
  updateIpcSnapshotsForGroup(group.folder, group.folder === MAIN_GROUP_FOLDER);

  logger.info(
    { jid, name: group.name, folder: group.folder },
    'Group registered',
  );
}

function unregisterGroup(jid: string): void {
  const existing = registeredGroups[jid];
  if (!existing) return;
  if (existing.folder === MAIN_GROUP_FOLDER) return;

  delete registeredGroups[jid];
  deleteRegisteredGroup(jid);
  deleteTasksForGroup(existing.folder);
  delete sessions[existing.folder];

  logger.info({ jid, folder: existing.folder }, 'Group unregistered');
}

function formatTasksMessage(tasks: ReturnType<typeof getAllTasks>): string {
  if (tasks.length === 0) {
    return 'No scheduled tasks found.';
  }

  const lines = tasks.map((task) => {
    const prompt = task.prompt.length > 60 ? `${task.prompt.slice(0, 57)}...` : task.prompt;
    return `- [${task.id}] ${prompt} (${task.schedule_type}: ${task.schedule_value}) - ${task.status}, next: ${task.next_run || 'N/A'}`;
  });
  return `Scheduled tasks:\n${lines.join('\n')}`;
}

function formatGroupsMessage(): string {
  const available = getAvailableGroups();
  if (available.length === 0) {
    return 'No groups discovered yet.';
  }

  const registeredByJid = registeredGroups;
  const lines = available.map((group) => {
    const reg = registeredByJid[group.jid];
    if (reg) {
      return `- ${group.name} (${group.jid}) [registered: folder=${reg.folder}, trigger=${reg.requiresTrigger !== false ? 'required' : 'off'}]`;
    }
    return `- ${group.name} (${group.jid}) [unregistered]`;
  });

  return `Available groups:\n${lines.join('\n')}`;
}

function findRegisteredJidByFolder(folder: string): string | null {
  for (const [jid, group] of Object.entries(registeredGroups)) {
    if (group.folder === folder) return jid;
  }
  return null;
}

function normalizeFolderName(input: string): string {
  return input.toLowerCase().replace(/[^a-z0-9_-]/g, '-');
}

async function handleHostCommand(
  chatJid: string,
  command: HostSkillCommand,
): Promise<void> {
  const currentGroup = registeredGroups[chatJid];
  const isMain = isMainGroupByJid(chatJid) || currentGroup?.folder === MAIN_GROUP_FOLDER;

  switch (command.type) {
    case 'list-skills': {
      const skills = listSkills();
      await whatsapp.sendMessage(chatJid, formatSkillsListMessage(skills));
      return;
    }
    case 'list-groups': {
      if (!isMain) {
        await whatsapp.sendMessage(chatJid, 'Only the main group can list available groups.');
        return;
      }
      await whatsapp.sendMessage(chatJid, formatGroupsMessage());
      return;
    }
    case 'register-group': {
      if (!isMain) {
        await whatsapp.sendMessage(chatJid, 'Only the main group can register groups.');
        return;
      }

      if (registeredGroups[command.jid]) {
        await whatsapp.sendMessage(chatJid, `Group is already registered: ${command.jid}`);
        return;
      }

      const folder = normalizeFolderName(command.folder);
      if (!folder || folder === MAIN_GROUP_FOLDER) {
        await whatsapp.sendMessage(chatJid, 'Invalid folder name for group registration.');
        return;
      }

      const existingFolderOwner = findRegisteredJidByFolder(folder);
      if (existingFolderOwner) {
        await whatsapp.sendMessage(chatJid, `Folder "${folder}" is already used by ${existingFolderOwner}.`);
        return;
      }

      const knownChats = new Map(getAllChats().map((c) => [c.jid, c.name]));
      const groupName = knownChats.get(command.jid) || command.jid;
      registerGroup(command.jid, {
        name: groupName,
        folder,
        requiresTrigger: !command.noTrigger,
      });
      updateIpcSnapshotsForAllGroups();
      await whatsapp.sendMessage(
        chatJid,
        `Registered group: ${groupName} (${command.jid}) -> folder "${folder}"`,
      );
      return;
    }
    case 'remove-group': {
      if (!isMain) {
        await whatsapp.sendMessage(chatJid, 'Only the main group can remove groups.');
        return;
      }
      const group = registeredGroups[command.jid];
      if (!group) {
        await whatsapp.sendMessage(chatJid, `Group is not registered: ${command.jid}`);
        return;
      }
      if (group.folder === MAIN_GROUP_FOLDER) {
        await whatsapp.sendMessage(chatJid, 'Cannot remove the main group.');
        return;
      }
      unregisterGroup(command.jid);
      updateIpcSnapshotsForAllGroups();
      await whatsapp.sendMessage(chatJid, `Removed group ${command.jid}.`);
      return;
    }
    case 'list-tasks': {
      if (!currentGroup) {
        await whatsapp.sendMessage(chatJid, 'Current chat is not registered.');
        return;
      }
      const tasks = getAllTasks().filter((task) => {
        if (isMain && command.scope === 'all') return true;
        return task.group_folder === currentGroup.folder;
      });
      await whatsapp.sendMessage(chatJid, formatTasksMessage(tasks));
      return;
    }
    case 'schedule-task': {
      if (!currentGroup) {
        await whatsapp.sendMessage(chatJid, 'Current chat is not registered.');
        return;
      }

      const targetJid = command.targetJid || chatJid;
      if (!isMain && targetJid !== chatJid) {
        await whatsapp.sendMessage(chatJid, 'Only the main group can schedule tasks for other groups.');
        return;
      }

      const targetGroup = registeredGroups[targetJid];
      if (!targetGroup) {
        await whatsapp.sendMessage(chatJid, `Target group is not registered: ${targetJid}`);
        return;
      }

      const nextRun = computeNextRun(command.scheduleType, command.scheduleValue);
      if (!nextRun) {
        await whatsapp.sendMessage(
          chatJid,
          `Invalid schedule value for ${command.scheduleType}: ${command.scheduleValue}`,
        );
        return;
      }

      const taskId = createTask({
        groupFolder: targetGroup.folder,
        chatJid: targetJid,
        prompt: command.prompt,
        scheduleType: command.scheduleType,
        scheduleValue: command.scheduleValue,
        nextRun,
        status: 'active',
      });
      updateIpcSnapshotsForAllGroups();
      await whatsapp.sendMessage(
        chatJid,
        `Task ${taskId} scheduled for ${targetGroup.name} (${command.scheduleType}: ${command.scheduleValue}).`,
      );
      return;
    }
    case 'update-task': {
      if (!currentGroup) {
        await whatsapp.sendMessage(chatJid, 'Current chat is not registered.');
        return;
      }

      const task = getTaskById(command.taskId);
      if (!task) {
        await whatsapp.sendMessage(chatJid, `Task not found: ${command.taskId}`);
        return;
      }
      if (!isMain && task.group_folder !== currentGroup.folder) {
        await whatsapp.sendMessage(chatJid, 'You can only update tasks in this group.');
        return;
      }

      const nextRun = computeNextRun(command.scheduleType, command.scheduleValue);
      if (!nextRun) {
        await whatsapp.sendMessage(
          chatJid,
          `Invalid schedule value for ${command.scheduleType}: ${command.scheduleValue}`,
        );
        return;
      }

      updateTaskDefinition(command.taskId, {
        prompt: command.prompt,
        scheduleType: command.scheduleType,
        scheduleValue: command.scheduleValue,
        nextRun,
        status: 'active',
      });
      updateIpcSnapshotsForAllGroups();
      await whatsapp.sendMessage(chatJid, `Task ${command.taskId} updated.`);
      return;
    }
    case 'pause-task':
    case 'resume-task':
    case 'cancel-task': {
      if (!currentGroup) {
        await whatsapp.sendMessage(chatJid, 'Current chat is not registered.');
        return;
      }

      const task = getTaskById(command.taskId);
      if (!task) {
        await whatsapp.sendMessage(chatJid, `Task not found: ${command.taskId}`);
        return;
      }

      if (!isMain && task.group_folder !== currentGroup.folder) {
        await whatsapp.sendMessage(chatJid, 'You can only modify tasks in this group.');
        return;
      }

      if (command.type === 'pause-task') {
        updateTaskStatus(command.taskId, 'paused');
      } else if (command.type === 'resume-task') {
        updateTaskStatus(command.taskId, 'active');
      } else {
        deleteTask(command.taskId);
      }
      updateIpcSnapshotsForAllGroups();
      const action =
        command.type === 'pause-task'
          ? 'paused'
          : command.type === 'resume-task'
            ? 'resumed'
            : 'cancelled';
      await whatsapp.sendMessage(chatJid, `Task ${command.taskId} ${action}.`);
      return;
    }
  }
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

    lastAgentTimestamp[chatJid] = messages[messages.length - 1].timestamp;
    saveState();
    await handleHostCommand(chatJid, command);
    return true;
  }

  for (let i = messages.length - 1; i >= 0; i--) {
    if (!isHostCommandText(messages[i].content)) continue;
    lastAgentTimestamp[chatJid] = messages[messages.length - 1].timestamp;
    saveState();
    await whatsapp.sendMessage(
      chatJid,
      'Invalid host command format. Use /list-skills for skills or supported admin/task commands.',
    );
    return true;
  }

  return false;
}

async function processGroupMessages(chatJid: string): Promise<boolean> {
  const group = registeredGroups[chatJid];
  if (!group) return true;

  const isMainGroup =
    group.folder === MAIN_GROUP_FOLDER || isMainGroupByJid(chatJid);

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
  updateIpcSnapshotsForGroup(group.folder, isMain);

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
            const hasHostCommand = groupMessages.some((m) =>
              isHostCommandText(m.content),
            );
            if (!hasTrigger && !hasSkillInvocation && !hasHostCommand) continue;
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

  // Match NanoClaw behavior: ensure runtime is ready before entering loops.
  ensureContainerRuntimeReady();

  // Initialize database
  initDatabase();
  loadState();
  ensureGlobalMemoryFiles(GROUPS_DIR, ASSISTANT_NAME);

  // Create main group if not exists
  if (!registeredGroups[mainChatJid]) {
    registerGroup(mainChatJid, {
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
    updateIpcSnapshotsForGroup(
      group.folder,
      group.folder === MAIN_GROUP_FOLDER,
    );
  }
  syncSkillsToAllGroups(groupFolders);
  logger.info({ skillCount: skills.length }, 'Available skills loaded');

  // Initialize WhatsApp
  whatsapp = new WhatsAppChannel();

  await whatsapp.connect(
    async (chatJid, senderJid, senderName, text, chatName) => {
      if (chatJid === mainChatJid && !registeredGroups[chatJid]) {
        registerGroup(chatJid, {
          name: 'Main',
          folder: MAIN_GROUP_FOLDER,
          requiresTrigger: false,
        });
        return;
      }

      // Auto-register new chats/groups only when explicitly enabled.
      if (!registeredGroups[chatJid]) {
        if (!AUTO_REGISTER_NEW_CHATS) {
          logger.info(
            { chatJid },
            'Ignoring message from unregistered chat (AUTO_REGISTER_NEW_CHATS=false)',
          );
          return;
        }

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

  // Start IPC watcher for task/message/group commands from containers.
  startIpcWatcher({
    sendMessage: async (jid, text) => {
      await whatsapp.sendMessage(jid, text);
    },
    registeredGroups: () => registeredGroups,
    registerGroup,
    unregisterGroup,
    syncGroupMetadata: async (force: boolean) => {
      await whatsapp.syncGroupMetadata(force);
      for (const group of Object.values(registeredGroups)) {
        updateIpcSnapshotsForGroup(
          group.folder,
          group.folder === MAIN_GROUP_FOLDER,
        );
      }
    },
    getAvailableGroups,
    writeGroupsSnapshot,
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

    // Resolve chat JID for this group
    const chatJid =
      task.chatJid ||
      Object.keys(registeredGroups).find(
        (jid) => registeredGroups[jid].folder === task.groupFolder,
      );
    if (!chatJid) {
      logger.warn({ task }, 'Chat JID not found for scheduled task');
      return;
    }

    // Run the task
    await runAgent(group, task.prompt, chatJid, [], async (result) => {
      if (result.result && !isMainGroupByJid(chatJid)) {
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
