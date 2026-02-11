import { spawnSync } from 'child_process';
import fs from 'fs';
import path from 'path';

function getIpcDir(): string {
  return process.env.BABYBOT_IPC_DIR || '/workspace/ipc';
}

function getMessagesDir(): string {
  return path.join(getIpcDir(), 'messages');
}

function getTasksDir(): string {
  return path.join(getIpcDir(), 'tasks');
}

function getTasksSnapshotPath(): string {
  return path.join(getIpcDir(), 'current_tasks.json');
}

function getGroupsSnapshotPath(): string {
  return path.join(getIpcDir(), 'available_groups.json');
}

const TOOL_NAMES = {
  sendMessage: 'mcp__nanoclaw__send_message',
  scheduleTask: 'mcp__nanoclaw__schedule_task',
  listTasks: 'mcp__nanoclaw__list_tasks',
  pauseTask: 'mcp__nanoclaw__pause_task',
  resumeTask: 'mcp__nanoclaw__resume_task',
  cancelTask: 'mcp__nanoclaw__cancel_task',
  listGroups: 'mcp__nanoclaw__list_groups',
  refreshGroups: 'mcp__nanoclaw__refresh_groups',
  registerGroup: 'mcp__nanoclaw__register_group',
  removeGroup: 'mcp__nanoclaw__remove_group',
  agentBrowser: 'agent_browser',
} as const;

const TOOL_NAME_ALIASES: Record<string, string> = {
  send_message: TOOL_NAMES.sendMessage,
  schedule_task: TOOL_NAMES.scheduleTask,
  list_tasks: TOOL_NAMES.listTasks,
  pause_task: TOOL_NAMES.pauseTask,
  resume_task: TOOL_NAMES.resumeTask,
  cancel_task: TOOL_NAMES.cancelTask,
  list_groups: TOOL_NAMES.listGroups,
  refresh_groups: TOOL_NAMES.refreshGroups,
  register_group: TOOL_NAMES.registerGroup,
  remove_group: TOOL_NAMES.removeGroup,
  mcp__nanoclaw__send_message: TOOL_NAMES.sendMessage,
  mcp__nanoclaw__schedule_task: TOOL_NAMES.scheduleTask,
  mcp__nanoclaw__list_tasks: TOOL_NAMES.listTasks,
  mcp__nanoclaw__pause_task: TOOL_NAMES.pauseTask,
  mcp__nanoclaw__resume_task: TOOL_NAMES.resumeTask,
  mcp__nanoclaw__cancel_task: TOOL_NAMES.cancelTask,
  mcp__nanoclaw__list_groups: TOOL_NAMES.listGroups,
  mcp__nanoclaw__refresh_groups: TOOL_NAMES.refreshGroups,
  mcp__nanoclaw__register_group: TOOL_NAMES.registerGroup,
  mcp__nanoclaw__remove_group: TOOL_NAMES.removeGroup,
  agent_browser: TOOL_NAMES.agentBrowser,
};

export interface ToolExecutionContext {
  chatJid: string;
  groupFolder: string;
  isMain: boolean;
}

interface ToolSchema {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: Record<string, unknown>;
  };
}

function writeIpcFile(dir: string, data: object): string {
  fs.mkdirSync(dir, { recursive: true });

  const filename = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`;
  const filePath = path.join(dir, filename);
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(tempPath, JSON.stringify(data, null, 2));
  fs.renameSync(tempPath, filePath);
  return filename;
}

function readJsonFile<T>(filePath: string, fallback: T): T {
  if (!fs.existsSync(filePath)) return fallback;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf-8')) as T;
  } catch {
    return fallback;
  }
}

export function getToolDefinitions(): ToolSchema[] {
  return [
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.sendMessage,
        description:
          'Send a message to the user or group immediately while the agent is still running.',
        parameters: {
          type: 'object',
          properties: {
            text: { type: 'string', description: 'Message text to send' },
          },
          required: ['text'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.scheduleTask,
        description:
          'Schedule a task. Main can target another group; other groups can target themselves only.',
        parameters: {
          type: 'object',
          properties: {
            prompt: { type: 'string' },
            schedule_type: {
              type: 'string',
              enum: ['cron', 'interval', 'once'],
            },
            schedule_value: { type: 'string' },
            target_group_jid: { type: 'string' },
          },
          required: ['prompt', 'schedule_type', 'schedule_value'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.listTasks,
        description: 'List scheduled tasks visible to this group context.',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.pauseTask,
        description: 'Pause a scheduled task by ID.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.resumeTask,
        description: 'Resume a paused task by ID.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.cancelTask,
        description: 'Cancel and delete a task by ID.',
        parameters: {
          type: 'object',
          properties: {
            task_id: { type: 'number' },
          },
          required: ['task_id'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.listGroups,
        description: 'List available groups from snapshot data (main group only).',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.refreshGroups,
        description: 'Refresh group metadata and available group snapshot (main group only).',
        parameters: {
          type: 'object',
          properties: {},
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.registerGroup,
        description: 'Register a group from main context.',
        parameters: {
          type: 'object',
          properties: {
            jid: { type: 'string' },
            name: { type: 'string' },
            folder: { type: 'string' },
            requires_trigger: { type: 'boolean' },
            trigger: { type: 'string' },
          },
          required: ['jid', 'name', 'folder'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.removeGroup,
        description: 'Remove a registered group from main context.',
        parameters: {
          type: 'object',
          properties: {
            jid: { type: 'string' },
          },
          required: ['jid'],
          additionalProperties: false,
        },
      },
    },
    {
      type: 'function',
      function: {
        name: TOOL_NAMES.agentBrowser,
        description:
          'Run an agent-browser command in the container for web automation tasks.',
        parameters: {
          type: 'object',
          properties: {
            args: {
              type: 'array',
              items: { type: 'string' },
              description: 'CLI arguments, for example: ["open", "https://example.com"]',
            },
            timeout_ms: {
              type: 'number',
              description: 'Optional timeout in milliseconds (default 60000).',
            },
          },
          required: ['args'],
          additionalProperties: false,
        },
      },
    },
  ];
}

function asNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number.parseInt(value, 10);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter((item) => item.length > 0);
}

function normalizeToolName(name: string): string {
  return TOOL_NAME_ALIASES[name] || name;
}

function executeAgentBrowser(args: Record<string, unknown>): string {
  const browserArgs = asStringArray(args.args);
  if (browserArgs.length === 0) {
    return 'Error: args must be a non-empty array of strings';
  }

  const requestedTimeout = asNumber(args.timeout_ms);
  const timeoutMs =
    requestedTimeout && requestedTimeout > 0 ? requestedTimeout : 60_000;

  const result = spawnSync('agent-browser', browserArgs, {
    encoding: 'utf-8',
    timeout: timeoutMs,
    maxBuffer: 2 * 1024 * 1024,
  });

  if (result.error) {
    return `Error: ${result.error.message}`;
  }

  const stdout = (result.stdout || '').trim();
  const stderr = (result.stderr || '').trim();

  if (typeof result.status === 'number' && result.status !== 0) {
    const message = stderr || stdout || `Exit code ${result.status}`;
    return `Error: agent-browser failed (${message})`;
  }

  const output = [stdout, stderr].filter(Boolean).join('\n').trim();
  return output || 'agent-browser command completed.';
}

export async function executeToolCall(
  name: string,
  args: Record<string, unknown>,
  ctx: ToolExecutionContext,
): Promise<string> {
  const normalizedName = normalizeToolName(name);

  switch (normalizedName) {
    case TOOL_NAMES.sendMessage: {
      const text = asString(args.text).trim();
      if (!text) return 'Error: text is required';

      const filename = writeIpcFile(getMessagesDir(), {
        type: 'message',
        chatJid: ctx.chatJid,
        text,
        timestamp: new Date().toISOString(),
      });
      return `Message queued (${filename}).`;
    }

    case TOOL_NAMES.scheduleTask: {
      const prompt = asString(args.prompt).trim();
      const scheduleType = asString(args.schedule_type).trim();
      const scheduleValue = asString(args.schedule_value).trim();
      if (!prompt || !scheduleType || !scheduleValue) {
        return 'Error: prompt, schedule_type, schedule_value are required';
      }

      const targetJid =
        ctx.isMain && asString(args.target_group_jid).trim()
          ? asString(args.target_group_jid).trim()
          : ctx.chatJid;

      const filename = writeIpcFile(getTasksDir(), {
        type: 'schedule_task',
        prompt,
        schedule_type: scheduleType,
        schedule_value: scheduleValue,
        targetJid,
        timestamp: new Date().toISOString(),
      });
      return `Task queued (${filename}).`;
    }

    case TOOL_NAMES.listTasks: {
      const tasks = readJsonFile<Array<Record<string, unknown>>>(
        getTasksSnapshotPath(),
        [],
      );
      const visible = ctx.isMain
        ? tasks
        : tasks.filter((task) => task.groupFolder === ctx.groupFolder);
      if (visible.length === 0) return 'No scheduled tasks found.';
      return JSON.stringify(visible, null, 2);
    }

    case TOOL_NAMES.pauseTask:
    case TOOL_NAMES.resumeTask:
    case TOOL_NAMES.cancelTask: {
      const taskId = asNumber(args.task_id);
      if (!taskId || taskId <= 0) {
        return 'Error: task_id must be a positive integer';
      }

      const type =
        normalizedName === TOOL_NAMES.pauseTask
          ? 'pause_task'
          : normalizedName === TOOL_NAMES.resumeTask
            ? 'resume_task'
            : 'cancel_task';
      const filename = writeIpcFile(getTasksDir(), {
        type,
        taskId: String(taskId),
        timestamp: new Date().toISOString(),
      });
      return `Task mutation queued (${filename}).`;
    }

    case TOOL_NAMES.listGroups: {
      if (!ctx.isMain) {
        return 'Only the main group can list groups.';
      }
      const snapshot = readJsonFile<{ groups?: unknown[] }>(
        getGroupsSnapshotPath(),
        { groups: [] },
      );
      const groups = Array.isArray(snapshot.groups) ? snapshot.groups : [];
      if (groups.length === 0) return 'No groups available.';
      return JSON.stringify(groups, null, 2);
    }

    case TOOL_NAMES.refreshGroups: {
      if (!ctx.isMain) {
        return 'Only the main group can refresh groups.';
      }
      const filename = writeIpcFile(getTasksDir(), {
        type: 'refresh_groups',
        timestamp: new Date().toISOString(),
      });
      return `Group refresh queued (${filename}).`;
    }

    case TOOL_NAMES.registerGroup: {
      if (!ctx.isMain) {
        return 'Only the main group can register groups.';
      }
      const jid = asString(args.jid).trim();
      const nameArg = asString(args.name).trim();
      const folder = asString(args.folder).trim();
      if (!jid || !nameArg || !folder) {
        return 'Error: jid, name, folder are required';
      }
      let requiresTrigger = true;
      if (typeof args.requires_trigger === 'boolean') {
        requiresTrigger = args.requires_trigger;
      } else {
        const trigger = asString(args.trigger).trim().toLowerCase();
        if (trigger === 'off' || trigger === 'false' || trigger === 'none') {
          requiresTrigger = false;
        }
      }
      const filename = writeIpcFile(getTasksDir(), {
        type: 'register_group',
        jid,
        name: nameArg,
        folder,
        requiresTrigger,
        timestamp: new Date().toISOString(),
      });
      return `Group registration queued (${filename}).`;
    }

    case TOOL_NAMES.removeGroup: {
      if (!ctx.isMain) {
        return 'Only the main group can remove groups.';
      }
      const jid = asString(args.jid).trim();
      if (!jid) {
        return 'Error: jid is required';
      }
      const filename = writeIpcFile(getTasksDir(), {
        type: 'remove_group',
        jid,
        timestamp: new Date().toISOString(),
      });
      return `Group removal queued (${filename}).`;
    }

    case TOOL_NAMES.agentBrowser:
      return executeAgentBrowser(args);

    default:
      return `Unknown tool: ${name}`;
  }
}
