import fs from 'fs';
import path from 'path';

import {
  getArchiveCutoffMessageId,
  getMessageCount,
  getMessagesForArchive,
  getRouterState,
  setRouterState,
} from './db.js';

export interface ConversationArchiveInput {
  chatJid: string;
  groupDir: string;
  triggerMessageCount: number;
  keepRecentMessages: number;
  cursorKey?: string;
}

export interface ConversationArchiveResult {
  archivedCount: number;
  archivePath: string;
}

function formatArchiveFilename(date: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `archive-${date.getUTCFullYear()}${pad(date.getUTCMonth() + 1)}${pad(
    date.getUTCDate(),
  )}-${pad(date.getUTCHours())}${pad(date.getUTCMinutes())}${pad(
    date.getUTCSeconds(),
  )}.md`;
}

export function maybeArchiveConversation(
  input: ConversationArchiveInput,
): ConversationArchiveResult {
  const {
    chatJid,
    groupDir,
    triggerMessageCount,
    keepRecentMessages,
    cursorKey = `archive_cursor_${chatJid}`,
  } = input;

  const totalMessages = getMessageCount(chatJid);
  if (totalMessages <= triggerMessageCount) {
    return { archivedCount: 0, archivePath: '' };
  }

  const cutoffId = getArchiveCutoffMessageId(chatJid, keepRecentMessages);
  if (!cutoffId) {
    return { archivedCount: 0, archivePath: '' };
  }

  const cursorRaw = getRouterState(cursorKey) || '0';
  const cursor = Number.parseInt(cursorRaw, 10) || 0;
  if (cutoffId <= cursor) {
    return { archivedCount: 0, archivePath: '' };
  }

  const rows = getMessagesForArchive(chatJid, cursor, cutoffId);
  if (rows.length === 0) {
    return { archivedCount: 0, archivePath: '' };
  }

  const archivesDir = path.join(groupDir, 'archives');
  fs.mkdirSync(archivesDir, { recursive: true });
  const archivePath = path.join(archivesDir, formatArchiveFilename(new Date()));

  const lines = rows.map((row) => `[${row.timestamp}] ${row.sender_name}: ${row.content}`);
  fs.writeFileSync(
    archivePath,
    [
      `# Conversation Archive`,
      ``,
      `Chat: ${chatJid}`,
      `Archived at: ${new Date().toISOString()}`,
      `Message count: ${rows.length}`,
      ``,
      ...lines,
      ``,
    ].join('\n'),
  );

  setRouterState(cursorKey, String(cutoffId));
  return { archivedCount: rows.length, archivePath };
}
