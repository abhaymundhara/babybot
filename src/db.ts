import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';

import { DATA_DIR } from './config.js';
import { logger } from './logger.js';
import { ChatMetadata, NewMessage, RegisteredGroup, Task } from './types.js';

let db: Database.Database;

export function initDatabase(customDbPath?: string): void {
  if (db) {
    try {
      db.close();
    } catch {
      // Ignore close errors when reinitializing during tests
    }
  }

  const dbPath = customDbPath || path.join(DATA_DIR, 'babybot.db');
  fs.mkdirSync(path.dirname(dbPath), { recursive: true });
  db = new Database(dbPath);

  db.exec(`
    CREATE TABLE IF NOT EXISTS messages (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      chat_jid TEXT NOT NULL,
      sender_jid TEXT NOT NULL,
      sender_name TEXT NOT NULL,
      content TEXT NOT NULL,
      timestamp TEXT NOT NULL,
      from_assistant INTEGER DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_messages_chat_timestamp ON messages(chat_jid, timestamp);
    CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);

    CREATE TABLE IF NOT EXISTS router_state (
      key TEXT PRIMARY KEY,
      value TEXT
    );

    CREATE TABLE IF NOT EXISTS registered_groups (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      folder TEXT NOT NULL UNIQUE,
      requires_trigger INTEGER DEFAULT 1
    );

    CREATE TABLE IF NOT EXISTS sessions (
      group_folder TEXT PRIMARY KEY,
      session_id TEXT
    );

    CREATE TABLE IF NOT EXISTS tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      group_folder TEXT NOT NULL,
      chat_jid TEXT,
      prompt TEXT NOT NULL,
      schedule_type TEXT NOT NULL,
      schedule_value TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      next_run TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE INDEX IF NOT EXISTS idx_tasks_status ON tasks(status);
    CREATE INDEX IF NOT EXISTS idx_tasks_next_run ON tasks(next_run);

    CREATE TABLE IF NOT EXISTS chat_metadata (
      jid TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      last_message_time TEXT NOT NULL
    );
  `);

  // Migration for existing databases.
  try {
    db.exec('ALTER TABLE tasks ADD COLUMN chat_jid TEXT');
  } catch {
    // Column already exists
  }

  logger.info({ dbPath }, 'Database initialized');
}

export function storeMessage(
  chatJid: string,
  senderJid: string,
  senderName: string,
  content: string,
  timestamp: string,
  fromAssistant: boolean,
): void {
  db.prepare(
    `INSERT INTO messages (chat_jid, sender_jid, sender_name, content, timestamp, from_assistant)
     VALUES (?, ?, ?, ?, ?, ?)`,
  ).run(
    chatJid,
    senderJid,
    senderName,
    content,
    timestamp,
    fromAssistant ? 1 : 0,
  );
}

export function getNewMessages(
  chatJids: string[],
  sinceTimestamp: string,
  assistantName: string,
): { messages: NewMessage[]; newTimestamp: string } {
  if (chatJids.length === 0) {
    return { messages: [], newTimestamp: sinceTimestamp };
  }

  const placeholders = chatJids.map(() => '?').join(',');
  const rows = db
    .prepare(
      `SELECT id, chat_jid, sender_jid, sender_name, content, timestamp, from_assistant
       FROM messages
       WHERE chat_jid IN (${placeholders})
         AND timestamp > ?
         AND from_assistant = 0
       ORDER BY timestamp ASC`,
    )
    .all(...chatJids, sinceTimestamp) as NewMessage[];

  const newTimestamp =
    rows.length > 0 ? rows[rows.length - 1].timestamp : sinceTimestamp;

  return { messages: rows, newTimestamp };
}

export function getMessagesSince(
  chatJid: string,
  sinceTimestamp: string,
  assistantName: string,
): NewMessage[] {
  return db
    .prepare(
      `SELECT id, chat_jid, sender_jid, sender_name, content, timestamp, from_assistant
       FROM messages
       WHERE chat_jid = ?
         AND timestamp > ?
         AND from_assistant = 0
       ORDER BY timestamp ASC`,
    )
    .all(chatJid, sinceTimestamp) as NewMessage[];
}

export function getConversationMessages(
  chatJid: string,
  upToTimestamp: string,
  limit: number,
): NewMessage[] {
  const safeLimit = Math.max(1, limit);

  const rows = db
    .prepare(
      `SELECT id, chat_jid, sender_jid, sender_name, content, timestamp, from_assistant
       FROM messages
       WHERE chat_jid = ?
         AND timestamp <= ?
       ORDER BY timestamp DESC
       LIMIT ?`,
    )
    .all(chatJid, upToTimestamp, safeLimit) as NewMessage[];

  return rows.reverse();
}

export function getRouterState(key: string): string | null {
  const row = db
    .prepare('SELECT value FROM router_state WHERE key = ?')
    .get(key) as { value: string } | undefined;
  return row?.value ?? null;
}

export function setRouterState(key: string, value: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO router_state (key, value) VALUES (?, ?)',
  ).run(key, value);
}

export function setRegisteredGroup(jid: string, group: RegisteredGroup): void {
  db.prepare(
    `INSERT OR REPLACE INTO registered_groups (jid, name, folder, requires_trigger)
     VALUES (?, ?, ?, ?)`,
  ).run(jid, group.name, group.folder, group.requiresTrigger === false ? 0 : 1);
}

export function deleteRegisteredGroup(jid: string): void {
  db.prepare('DELETE FROM registered_groups WHERE jid = ?').run(jid);
}

export function getAllRegisteredGroups(): Record<string, RegisteredGroup> {
  const rows = db
    .prepare(
      'SELECT jid, name, folder, requires_trigger FROM registered_groups',
    )
    .all() as Array<{
    jid: string;
    name: string;
    folder: string;
    requires_trigger: number;
  }>;

  const groups: Record<string, RegisteredGroup> = {};
  for (const row of rows) {
    groups[row.jid] = {
      name: row.name,
      folder: row.folder,
      requiresTrigger: row.requires_trigger === 1,
    };
  }
  return groups;
}

export function getAllSessions(): Record<string, string> {
  const rows = db
    .prepare('SELECT group_folder, session_id FROM sessions')
    .all() as Array<{ group_folder: string; session_id: string }>;

  const sessions: Record<string, string> = {};
  for (const row of rows) {
    if (row.session_id) {
      sessions[row.group_folder] = row.session_id;
    }
  }
  return sessions;
}

export function setSession(groupFolder: string, sessionId: string): void {
  db.prepare(
    'INSERT OR REPLACE INTO sessions (group_folder, session_id) VALUES (?, ?)',
  ).run(groupFolder, sessionId);
}

export function getAllTasks(): Task[] {
  return db
    .prepare(
      `SELECT id, group_folder, chat_jid, prompt, schedule_type, schedule_value, status, next_run, created_at, updated_at
       FROM tasks
       ORDER BY created_at DESC`,
    )
    .all() as Task[];
}

export function getTaskById(taskId: number): Task | undefined {
  return db
    .prepare(
      `SELECT id, group_folder, chat_jid, prompt, schedule_type, schedule_value, status, next_run, created_at, updated_at
       FROM tasks
       WHERE id = ?`,
    )
    .get(taskId) as Task | undefined;
}

export function createTask(task: {
  groupFolder: string;
  chatJid?: string;
  prompt: string;
  scheduleType: 'cron' | 'interval' | 'once';
  scheduleValue: string;
  nextRun: string | null;
  status?: 'active' | 'paused' | 'completed';
}): number {
  const result = db
    .prepare(
      `INSERT INTO tasks (group_folder, chat_jid, prompt, schedule_type, schedule_value, status, next_run)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    .run(
      task.groupFolder,
      task.chatJid || null,
      task.prompt,
      task.scheduleType,
      task.scheduleValue,
      task.status || 'active',
      task.nextRun,
    );

  return Number(result.lastInsertRowid);
}

export function updateTaskDefinition(
  taskId: number,
  updates: {
    prompt?: string;
    scheduleType?: 'cron' | 'interval' | 'once';
    scheduleValue?: string;
    nextRun?: string | null;
    status?: 'active' | 'paused' | 'completed';
    chatJid?: string | null;
  },
): void {
  const fields: string[] = [];
  const values: Array<string | number | null> = [];

  if (updates.prompt !== undefined) {
    fields.push('prompt = ?');
    values.push(updates.prompt);
  }
  if (updates.scheduleType !== undefined) {
    fields.push('schedule_type = ?');
    values.push(updates.scheduleType);
  }
  if (updates.scheduleValue !== undefined) {
    fields.push('schedule_value = ?');
    values.push(updates.scheduleValue);
  }
  if (updates.nextRun !== undefined) {
    fields.push('next_run = ?');
    values.push(updates.nextRun);
  }
  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }
  if (updates.chatJid !== undefined) {
    fields.push('chat_jid = ?');
    values.push(updates.chatJid);
  }

  if (fields.length === 0) return;

  values.push(taskId);
  db.prepare(
    `UPDATE tasks SET ${fields.join(', ')}, updated_at = CURRENT_TIMESTAMP WHERE id = ?`,
  ).run(...values);
}

export function storeChatMetadata(
  jid: string,
  name: string,
  lastMessageTime: string,
): void {
  db.prepare(
    'INSERT OR REPLACE INTO chat_metadata (jid, name, last_message_time) VALUES (?, ?, ?)',
  ).run(jid, name, lastMessageTime);
}

export function getAllChats(): ChatMetadata[] {
  return db
    .prepare(
      'SELECT jid, name, last_message_time FROM chat_metadata ORDER BY last_message_time DESC',
    )
    .all() as ChatMetadata[];
}

export function updateTaskNextRun(taskId: number, nextRun: string): void {
  db.prepare(
    'UPDATE tasks SET next_run = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(nextRun, taskId);
}

export function updateTaskStatus(
  taskId: number,
  status: 'active' | 'paused' | 'completed',
): void {
  db.prepare(
    'UPDATE tasks SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
  ).run(status, taskId);
}

export function deleteTask(taskId: number): void {
  db.prepare('DELETE FROM tasks WHERE id = ?').run(taskId);
}

export function deleteTasksForGroup(groupFolder: string): void {
  db.prepare('DELETE FROM tasks WHERE group_folder = ?').run(groupFolder);
}

export function markTaskCompleted(taskId: number): void {
  updateTaskStatus(taskId, 'completed');
}
