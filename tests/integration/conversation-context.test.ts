/**
 * Conversation Context Tests
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import {
  getConversationMessages,
  getMessagesSince,
  initDatabase,
  storeMessage,
} from '../../src/db.js';
import { formatMessages } from '../../src/router.js';

async function testFollowUpPromptIncludesRecentContext(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `conversation-context-${Date.now()}`,
  );
  fs.mkdirSync(tempRoot, { recursive: true });

  const dbPath = path.join(tempRoot, 'messages.db');
  initDatabase(dbPath);

  const chatJid = 'test-chat@s.whatsapp.net';
  const sender = 'Abhay';

  storeMessage(
    chatJid,
    'user-1',
    sender,
    '@baby who is donald trump',
    '2026-02-11T21:02:50.000Z',
    false,
  );
  storeMessage(
    chatJid,
    'assistant-1',
    'Baby',
    'Donald Trump was the 45th president of the United States.',
    '2026-02-11T21:02:54.000Z',
    true,
  );
  storeMessage(
    chatJid,
    'user-1',
    sender,
    '@baby how old is he',
    '2026-02-11T21:03:01.000Z',
    false,
  );

  const missed = getMessagesSince(chatJid, '2026-02-11T21:02:54.000Z', 'Baby');
  assert(missed.length === 1, 'Expected only one newly-triggering message');

  const contextMessages = getConversationMessages(
    chatJid,
    missed[0].timestamp,
    10,
  );
  const prompt = formatMessages(contextMessages);

  assert(
    prompt.includes('who is donald trump'),
    'Prompt should include prior user context',
  );
  assert(
    prompt.includes('45th president'),
    'Prompt should include prior assistant response',
  );
  assert(
    prompt.includes('how old is he'),
    'Prompt should include latest user question',
  );

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function runConversationContextTests(): Promise<void> {
  console.log('\n=== Conversation Context Tests ===\n');
  await testFollowUpPromptIncludesRecentContext();
  console.log('✅ Conversation context tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runConversationContextTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runConversationContextTests };
