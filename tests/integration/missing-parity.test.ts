/**
 * Missing parity feature tests:
 * - Per-group .claude session mount + filtered env file artifacts
 * - Task run history log model
 * - Conversation archival hook
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import {
  createTask,
  getTaskRunLogs,
  initDatabase,
  logTaskRun,
  setRouterState,
  storeMessage,
} from '../../src/db.js';
import { maybeArchiveConversation } from '../../src/conversation-archive.js';
import { prepareContainerExecution } from '../../src/container-runner.js';

async function testContainerArtifacts(): Promise<void> {
  const groupFolder = `parity-artifacts-${Date.now()}`;
  const group = { name: 'Parity Group', folder: groupFolder, requiresTrigger: true };

  process.env.LLM_PROVIDER = 'openrouter';
  process.env.OPENROUTER_API_KEY = 'test-key';
  process.env.OPENROUTER_MODEL = 'openai/gpt-4o-mini';

  const prepared = prepareContainerExecution(group, false);
  const mountTargets = new Set(prepared.mounts.map((mount) => mount.containerPath));
  assert(
    mountTargets.has('/home/node/.claude'),
    'Expected per-group .claude mount to be present',
  );
  assert(
    prepared.envVars.some((v) => v.key === 'BABYBOT_ENV_FILE'),
    'Expected env file pointer variable',
  );
  assert(
    !prepared.envVars.some((v) => v.key === 'OPENROUTER_API_KEY'),
    'Sensitive vars should not be passed directly',
  );

  const envFileVar = prepared.envVars.find((v) => v.key === 'BABYBOT_ENV_FILE');
  assert(Boolean(envFileVar), 'Expected BABYBOT_ENV_FILE to exist');
  const hostEnvMount = prepared.mounts.find(
    (mount) => mount.containerPath === '/workspace/env-dir',
  );
  assert(Boolean(hostEnvMount), 'Expected env dir mount');
  const envFileHostPath = path.join(hostEnvMount!.hostPath, 'env');
  assert(fs.existsSync(envFileHostPath), 'Expected filtered env file on host');

  const content = fs.readFileSync(envFileHostPath, 'utf-8');
  assert(content.includes('OPENROUTER_API_KEY=test-key'), 'Expected filtered key in env file');
}

async function testTaskRunLogs(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `task-run-history-${Date.now()}`,
  );
  fs.mkdirSync(tempRoot, { recursive: true });
  initDatabase(path.join(tempRoot, 'messages.db'));

  const taskId = createTask({
    groupFolder: 'group-a',
    chatJid: 'jid-a',
    prompt: 'Do something',
    scheduleType: 'once',
    scheduleValue: new Date().toISOString(),
    nextRun: new Date().toISOString(),
    status: 'active',
  });

  logTaskRun({
    task_id: taskId,
    run_at: new Date().toISOString(),
    duration_ms: 42,
    status: 'success',
    result: 'ok',
    error: null,
  });

  const runs = getTaskRunLogs(taskId);
  assert(runs.length === 1, 'Expected one task run log');
  assert(runs[0].duration_ms === 42, 'Expected duration to be persisted');

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function testConversationArchiveHook(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `conversation-archive-${Date.now()}`,
  );
  fs.mkdirSync(tempRoot, { recursive: true });
  initDatabase(path.join(tempRoot, 'messages.db'));

  const chatJid = 'archive-test@s.whatsapp.net';
  for (let i = 0; i < 8; i++) {
    storeMessage(
      chatJid,
      `user-${i}`,
      `User ${i}`,
      `Message ${i}`,
      new Date(Date.now() + i * 1000).toISOString(),
      false,
    );
  }

  setRouterState(`archive_cursor_${chatJid}`, '0');

  const groupDir = path.join(tempRoot, 'groups', 'archive-group');
  fs.mkdirSync(groupDir, { recursive: true });
  const archived = maybeArchiveConversation({
    chatJid,
    groupDir,
    triggerMessageCount: 5,
    keepRecentMessages: 3,
    cursorKey: `archive_cursor_${chatJid}`,
  });

  assert(archived.archivedCount > 0, 'Expected conversation archive to write entries');
  assert(fs.existsSync(archived.archivePath), 'Expected archive file to be created');

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function runMissingParityTests(): Promise<void> {
  console.log('\n=== Missing Parity Tests ===\n');
  await testContainerArtifacts();
  await testTaskRunLogs();
  await testConversationArchiveHook();
  console.log('✅ Missing parity tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMissingParityTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runMissingParityTests };
