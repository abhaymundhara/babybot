/**
 * Group queue query-loop orchestration tests.
 */

import fs from 'fs';
import path from 'path';
import { ChildProcess } from 'child_process';
import { assert, waitFor } from '../test-utils.js';
import { GroupQueue } from '../../src/group-queue.js';
import { DATA_DIR } from '../../src/config.js';

async function testActiveContainerAcceptsPipedMessages(): Promise<void> {
  const groupJid = `jid-${Date.now()}`;
  const groupFolder = `queue-pipe-${Date.now()}`;
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.rmSync(path.join(DATA_DIR, 'ipc', groupFolder), {
    recursive: true,
    force: true,
  });

  const queue = new GroupQueue();
  queue.setProcessMessagesFn(
    async () =>
      await new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 200);
      }),
  );

  queue.enqueueMessageCheck(groupJid);

  await waitFor(() => queue.getQueueStatus().running === 1, 2000, 20);
  queue.registerProcess(
    groupJid,
    { killed: false } as ChildProcess,
    'container-1',
    groupFolder,
  );

  const sent = queue.sendMessage(groupJid, 'hello active container');
  assert(sent, 'Expected message to be piped to active container');

  await waitFor(
    () =>
      fs.existsSync(inputDir) &&
      fs.readdirSync(inputDir).some((file) => file.endsWith('.json')),
    2000,
    20,
  );
  const files = fs.readdirSync(inputDir).filter((file) => file.endsWith('.json'));
  const payload = JSON.parse(
    fs.readFileSync(path.join(inputDir, files[0]), 'utf-8'),
  ) as { type: string; text: string };
  assert(payload.type === 'message', 'Expected message payload type');
  assert(
    payload.text === 'hello active container',
    'Expected piped message payload text',
  );

  fs.rmSync(path.join(DATA_DIR, 'ipc', groupFolder), {
    recursive: true,
    force: true,
  });
}

async function testIdleCloseWritesSentinel(): Promise<void> {
  const groupJid = `jid-close-${Date.now()}`;
  const groupFolder = `queue-close-${Date.now()}`;
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.rmSync(path.join(DATA_DIR, 'ipc', groupFolder), {
    recursive: true,
    force: true,
  });

  const queue = new GroupQueue();
  queue.setProcessMessagesFn(
    async () =>
      await new Promise<boolean>((resolve) => {
        setTimeout(() => resolve(true), 200);
      }),
  );

  queue.enqueueMessageCheck(groupJid);
  await waitFor(() => queue.getQueueStatus().running === 1, 2000, 20);

  queue.registerProcess(
    groupJid,
    { killed: false } as ChildProcess,
    'container-2',
    groupFolder,
  );
  queue.closeStdin(groupJid);

  await waitFor(() => fs.existsSync(path.join(inputDir, '_close')), 2000, 20);

  fs.rmSync(path.join(DATA_DIR, 'ipc', groupFolder), {
    recursive: true,
    force: true,
  });
}

async function runGroupQueueQueryLoopTests(): Promise<void> {
  console.log('\n=== Group Queue Query Loop Tests ===\n');
  await testActiveContainerAcceptsPipedMessages();
  await testIdleCloseWritesSentinel();
  console.log('✅ Group queue query-loop tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runGroupQueueQueryLoopTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runGroupQueueQueryLoopTests };
