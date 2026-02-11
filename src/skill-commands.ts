import { ScheduleType } from './scheduling.js';

export type HostSkillCommand =
  | { type: 'list-skills' }
  | { type: 'list-groups' }
  | { type: 'register-group'; jid: string; folder: string; noTrigger: boolean }
  | { type: 'remove-group'; jid: string }
  | { type: 'list-tasks'; scope: 'current' | 'all' }
  | {
      type: 'schedule-task';
      scheduleType: ScheduleType;
      scheduleValue: string;
      prompt: string;
      targetJid?: string;
    }
  | {
      type: 'update-task';
      taskId: number;
      scheduleType: ScheduleType;
      scheduleValue: string;
      prompt: string;
    }
  | { type: 'pause-task'; taskId: number }
  | { type: 'resume-task'; taskId: number }
  | { type: 'cancel-task'; taskId: number };

const HOST_COMMAND_NAMES = new Set([
  'list-skills',
  'list-groups',
  'register-group',
  'remove-group',
  'list-tasks',
  'schedule-task',
  'update-task',
  'pause-task',
  'resume-task',
  'cancel-task',
]);

export function isHostCommandText(text: string): boolean {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) return false;
  const command = trimmed.slice(1).split(/\s+/)[0]?.toLowerCase() || '';
  return HOST_COMMAND_NAMES.has(command);
}

function parseTaskId(value: string): number | null {
  const id = Number.parseInt(value, 10);
  if (!Number.isFinite(id) || id <= 0) return null;
  return id;
}

function parseScheduleType(value: string): ScheduleType | null {
  if (value === 'cron' || value === 'interval' || value === 'once') {
    return value;
  }
  return null;
}

/**
 * Host-side command parser.
 * Parses commands that are intentionally handled by the host router.
 * Skill execution remains agent-driven via explicit /<skill-name> invocation.
 */
export function parseHostSkillCommand(text: string): HostSkillCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const [headRaw, ...tailParts] = trimmed.slice(1).split(/\s+/);
  const head = (headRaw || '').toLowerCase();
  const tail = tailParts.join(' ').trim();

  if (head === 'list-skills') {
    return { type: 'list-skills' };
  }

  if (head === 'list-groups') {
    return { type: 'list-groups' };
  }

  if (head === 'register-group') {
    const args = tail.split(/\s+/).filter(Boolean);
    if (args.length < 2) return null;
    return {
      type: 'register-group',
      jid: args[0],
      folder: args[1],
      noTrigger: args.includes('--no-trigger'),
    };
  }

  if (head === 'remove-group') {
    if (!tail) return null;
    return { type: 'remove-group', jid: tail };
  }

  if (head === 'list-tasks') {
    return {
      type: 'list-tasks',
      scope: tail.toLowerCase() === 'all' ? 'all' : 'current',
    };
  }

  if (head === 'schedule-task') {
    // Format: /schedule-task <type>|<value>|<prompt>|[targetJid]
    const parts = tail.split('|').map((part) => part.trim());
    if (parts.length < 3) return null;
    const scheduleType = parseScheduleType(parts[0].toLowerCase());
    if (!scheduleType) return null;
    const scheduleValue = parts[1];
    const prompt = parts[2];
    if (!scheduleValue || !prompt) return null;
    const targetJid = parts[3] || undefined;
    return {
      type: 'schedule-task',
      scheduleType,
      scheduleValue,
      prompt,
      targetJid,
    };
  }

  if (head === 'update-task') {
    // Format: /update-task <id>|<type>|<value>|<prompt>
    const parts = tail.split('|').map((part) => part.trim());
    if (parts.length < 4) return null;
    const taskId = parseTaskId(parts[0]);
    const scheduleType = parseScheduleType(parts[1].toLowerCase());
    const scheduleValue = parts[2];
    const prompt = parts[3];
    if (!taskId || !scheduleType || !scheduleValue || !prompt) return null;
    return {
      type: 'update-task',
      taskId,
      scheduleType,
      scheduleValue,
      prompt,
    };
  }

  if (head === 'pause-task' || head === 'resume-task' || head === 'cancel-task') {
    const taskId = parseTaskId(tail);
    if (!taskId) return null;
    if (head === 'pause-task') return { type: 'pause-task', taskId };
    if (head === 'resume-task') return { type: 'resume-task', taskId };
    return { type: 'cancel-task', taskId };
  }

  return null;
}

/**
 * Extract explicit skill invocations from user text.
 * Example: "/add-telegram" -> ["add-telegram"] if that skill exists.
 */
export function extractSkillInvocations(
  text: string,
  availableSkills: string[],
): string[] {
  if (!text.includes('/')) return [];

  const availableSet = new Set(availableSkills.map((s) => s.toLowerCase()));
  const found = new Set<string>();

  const matches = text.matchAll(/\/([a-z0-9][a-z0-9-_]*)/gi);
  for (const match of matches) {
    const skillName = (match[1] || '').toLowerCase();
    if (!skillName || HOST_COMMAND_NAMES.has(skillName)) continue;
    if (availableSet.has(skillName)) {
      found.add(skillName);
    }
  }

  return Array.from(found);
}

export function formatSkillsListMessage(skills: string[]): string {
  if (skills.length === 0) {
    return 'No skills are currently available.';
  }

  const commands = skills
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/${name}`)
    .join('\n');

  return `Available skills:\n${commands}\n\nUse /<skill-name> in your message and the agent will apply that skill context.`;
}
