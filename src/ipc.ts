import fs from 'fs';
import path from 'path';

import { ASSISTANT_NAME, DATA_DIR, IPC_POLL_INTERVAL, MAIN_GROUP_FOLDER } from './config.js';
import { AvailableGroup } from './container-runner.js';
import {
  createTask,
  deleteTask,
  getTaskById,
  updateTaskDefinition,
  updateTaskStatus,
} from './db.js';
import { logger } from './logger.js';
import { computeNextRun } from './scheduling.js';
import { RegisteredGroup } from './types.js';

export interface IpcDeps {
  sendMessage: (jid: string, text: string) => Promise<void>;
  registeredGroups: () => Record<string, RegisteredGroup>;
  registerGroup: (jid: string, group: RegisteredGroup) => void;
  unregisterGroup: (jid: string) => void;
  syncGroupMetadata: (force: boolean) => Promise<void>;
  getAvailableGroups: () => AvailableGroup[];
  writeGroupsSnapshot: (
    groupFolder: string,
    isMain: boolean,
    groups: AvailableGroup[],
  ) => void;
}

let ipcWatcherRunning = false;

export function startIpcWatcher(deps: IpcDeps): void {
  if (ipcWatcherRunning) {
    logger.debug('IPC watcher already running, skipping duplicate start');
    return;
  }
  ipcWatcherRunning = true;

  const ipcBaseDir = path.join(DATA_DIR, 'ipc');
  fs.mkdirSync(ipcBaseDir, { recursive: true });

  const processIpcFiles = async () => {
    let groupFolders: string[];
    try {
      groupFolders = fs.readdirSync(ipcBaseDir).filter((name) => {
        const fullPath = path.join(ipcBaseDir, name);
        return fs.statSync(fullPath).isDirectory() && name !== 'errors';
      });
    } catch (error) {
      logger.error({ error }, 'Failed to read IPC directory');
      setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
      return;
    }

    for (const sourceGroup of groupFolders) {
      const isMain = sourceGroup === MAIN_GROUP_FOLDER;
      const messagesDir = path.join(ipcBaseDir, sourceGroup, 'messages');
      const tasksDir = path.join(ipcBaseDir, sourceGroup, 'tasks');

      await processMessageFiles(messagesDir, sourceGroup, isMain, deps);
      await processTaskFiles(tasksDir, sourceGroup, isMain, deps);
    }

    setTimeout(processIpcFiles, IPC_POLL_INTERVAL);
  };

  processIpcFiles().catch((error) => {
    logger.error({ error }, 'IPC watcher loop failed');
  });
  logger.info('IPC watcher started (group namespaces)');
}

async function processMessageFiles(
  messagesDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  if (!fs.existsSync(messagesDir)) return;

  const files = fs.readdirSync(messagesDir).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(messagesDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
        type?: string;
        chatJid?: string;
        text?: string;
      };

      if (data.type === 'message' && data.chatJid && data.text) {
        const groups = deps.registeredGroups();
        const targetGroup = groups[data.chatJid];
        const authorized = isMain || (targetGroup && targetGroup.folder === sourceGroup);

        if (authorized) {
          await deps.sendMessage(data.chatJid, `${ASSISTANT_NAME}: ${data.text}`);
          logger.info({ sourceGroup, chatJid: data.chatJid }, 'IPC message sent');
        } else {
          logger.warn(
            { sourceGroup, chatJid: data.chatJid },
            'Blocked unauthorized IPC message send',
          );
        }
      }

      fs.unlinkSync(filePath);
    } catch (error) {
      logger.error({ sourceGroup, file, error }, 'Failed to process IPC message file');
      moveToErrorDir(filePath, sourceGroup, file);
    }
  }
}

async function processTaskFiles(
  tasksDir: string,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  if (!fs.existsSync(tasksDir)) return;

  const files = fs.readdirSync(tasksDir).filter((name) => name.endsWith('.json'));
  for (const file of files) {
    const filePath = path.join(tasksDir, file);
    try {
      const data = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as TaskIPCRequest;
      await processTaskIpc(data, sourceGroup, isMain, deps);
      fs.unlinkSync(filePath);
    } catch (error) {
      logger.error({ sourceGroup, file, error }, 'Failed to process IPC task file');
      moveToErrorDir(filePath, sourceGroup, file);
    }
  }
}

type TaskIPCRequest = {
  type: string;
  taskId?: string;
  prompt?: string;
  schedule_type?: string;
  schedule_value?: string;
  targetJid?: string;
  requiresTrigger?: boolean;
  jid?: string;
  name?: string;
  folder?: string;
  trigger?: string;
};

export async function processTaskIpc(
  data: TaskIPCRequest,
  sourceGroup: string,
  isMain: boolean,
  deps: IpcDeps,
): Promise<void> {
  const registeredGroups = deps.registeredGroups();

  switch (data.type) {
    case 'schedule_task': {
      if (!data.prompt || !data.schedule_type || !data.schedule_value) {
        logger.warn({ data, sourceGroup }, 'Invalid schedule_task payload');
        break;
      }

      const targetJid = data.targetJid || findJidByGroupFolder(registeredGroups, sourceGroup);
      if (!targetJid) {
        logger.warn({ sourceGroup }, 'Unable to resolve target JID for schedule_task');
        break;
      }

      const targetGroup = registeredGroups[targetJid];
      if (!targetGroup) {
        logger.warn({ targetJid }, 'Cannot schedule task: target group not registered');
        break;
      }

      if (!isMain && targetGroup.folder !== sourceGroup) {
        logger.warn(
          { sourceGroup, targetGroup: targetGroup.folder },
          'Blocked unauthorized schedule_task request',
        );
        break;
      }

      const scheduleType = data.schedule_type as 'cron' | 'interval' | 'once';
      const nextRun = computeNextRun(scheduleType, data.schedule_value);
      if (!nextRun) {
        logger.warn(
          { scheduleType, scheduleValue: data.schedule_value },
          'Invalid schedule value for schedule_task',
        );
        break;
      }

      const taskId = createTask({
        groupFolder: targetGroup.folder,
        chatJid: targetJid,
        prompt: data.prompt,
        scheduleType,
        scheduleValue: data.schedule_value,
        nextRun,
        status: 'active',
      });

      logger.info(
        { taskId, sourceGroup, targetJid, targetGroup: targetGroup.folder },
        'Task created via IPC',
      );
      break;
    }

    case 'pause_task':
    case 'resume_task':
    case 'cancel_task':
    case 'update_task': {
      if (!data.taskId) {
        logger.warn({ data, sourceGroup }, 'Task operation missing taskId');
        break;
      }

      const taskId = Number.parseInt(data.taskId, 10);
      if (!Number.isFinite(taskId)) {
        logger.warn({ taskId: data.taskId, sourceGroup }, 'Invalid taskId');
        break;
      }

      const task = getTaskById(taskId);
      if (!task) {
        logger.warn({ taskId, sourceGroup }, 'Task not found');
        break;
      }

      if (!isMain && task.group_folder !== sourceGroup) {
        logger.warn({ sourceGroup, taskId }, 'Blocked unauthorized task mutation');
        break;
      }

      if (data.type === 'pause_task') {
        updateTaskStatus(taskId, 'paused');
      } else if (data.type === 'resume_task') {
        updateTaskStatus(taskId, 'active');
      } else if (data.type === 'update_task') {
        if (!data.prompt || !data.schedule_type || !data.schedule_value) {
          logger.warn({ sourceGroup, taskId }, 'Invalid update_task payload');
          break;
        }
        const nextRun = computeNextRun(
          data.schedule_type as 'cron' | 'interval' | 'once',
          data.schedule_value,
        );
        if (!nextRun) {
          logger.warn({ sourceGroup, taskId }, 'Invalid schedule for update_task');
          break;
        }
        updateTaskDefinition(taskId, {
          prompt: data.prompt,
          scheduleType: data.schedule_type as 'cron' | 'interval' | 'once',
          scheduleValue: data.schedule_value,
          nextRun,
          status: 'active',
        });
      } else {
        deleteTask(taskId);
      }

      logger.info({ taskId, sourceGroup, type: data.type }, 'Task updated via IPC');
      break;
    }

    case 'refresh_groups':
      if (!isMain) {
        logger.warn({ sourceGroup }, 'Blocked unauthorized refresh_groups request');
        break;
      }

      await deps.syncGroupMetadata(true);
      deps.writeGroupsSnapshot(sourceGroup, true, deps.getAvailableGroups());
      logger.info({ sourceGroup }, 'Group metadata refreshed via IPC');
      break;

    case 'register_group':
      if (!isMain) {
        logger.warn({ sourceGroup }, 'Blocked unauthorized register_group request');
        break;
      }

      if (!data.jid || !data.name || !data.folder) {
        logger.warn({ data }, 'Invalid register_group payload');
        break;
      }

      deps.registerGroup(data.jid, {
        name: data.name,
        folder: data.folder,
        requiresTrigger: data.requiresTrigger ?? true,
      });
      logger.info({ sourceGroup, jid: data.jid, folder: data.folder }, 'Group registered via IPC');
      break;

    case 'remove_group':
      if (!isMain) {
        logger.warn({ sourceGroup }, 'Blocked unauthorized remove_group request');
        break;
      }
      if (!data.jid) {
        logger.warn({ data }, 'Invalid remove_group payload');
        break;
      }
      deps.unregisterGroup(data.jid);
      logger.info({ sourceGroup, jid: data.jid }, 'Group removed via IPC');
      break;

    default:
      logger.warn({ type: data.type }, 'Unknown IPC task type');
  }
}

function findJidByGroupFolder(
  groups: Record<string, RegisteredGroup>,
  groupFolder: string,
): string | null {
  for (const [jid, group] of Object.entries(groups)) {
    if (group.folder === groupFolder) {
      return jid;
    }
  }
  return null;
}

function moveToErrorDir(filePath: string, sourceGroup: string, file: string): void {
  try {
    const errorDir = path.join(DATA_DIR, 'ipc', 'errors');
    fs.mkdirSync(errorDir, { recursive: true });
    fs.renameSync(filePath, path.join(errorDir, `${sourceGroup}-${file}`));
  } catch (moveError) {
    logger.error({ moveError, sourceGroup, filePath }, 'Failed to move IPC file to errors');
  }
}
