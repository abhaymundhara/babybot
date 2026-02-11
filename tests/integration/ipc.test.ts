/**
 * IPC Task/Group Contract Tests
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import { getAllTasks, getTaskById, initDatabase } from '../../src/db.js';
import { processTaskIpc } from '../../src/ipc.js';
import { RegisteredGroup } from '../../src/types.js';

async function testTaskIpcLifecycle(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `ipc-${Date.now()}`,
  );
  fs.mkdirSync(tempRoot, { recursive: true });

  const dbPath = path.join(tempRoot, 'messages.db');
  initDatabase(dbPath);

  const groups: Record<string, RegisteredGroup> = {
    '__main__': { name: 'Main', folder: 'main', requiresTrigger: false },
    'jid-1': { name: 'Group One', folder: 'group-one', requiresTrigger: true },
    'jid-2': { name: 'Group Two', folder: 'group-two', requiresTrigger: true },
  };

  let refreshed = 0;
  let snapshotWrites = 0;
  const deps = {
    sendMessage: async (_jid: string, _text: string) => undefined,
    registeredGroups: () => groups,
    registerGroup: (jid: string, group: RegisteredGroup) => {
      groups[jid] = group;
    },
    syncGroupMetadata: async (_force: boolean) => {
      refreshed += 1;
    },
    getAvailableGroups: () => [],
    writeGroupsSnapshot: (
      _groupFolder: string,
      _isMain: boolean,
      _groups: Array<{ jid: string }>,
    ) => {
      snapshotWrites += 1;
    },
  };

  await processTaskIpc(
    {
      type: 'schedule_task',
      prompt: 'Ping hourly',
      schedule_type: 'interval',
      schedule_value: '3600000',
      targetJid: 'jid-1',
    },
    'group-one',
    false,
    deps,
  );

  const firstTasks = getAllTasks();
  assert(firstTasks.length === 1, 'Expected one scheduled task');
  assert(firstTasks[0].schedule_type === 'interval', 'Expected interval schedule type');
  assert(firstTasks[0].group_folder === 'group-one', 'Expected task scoped to source group');

  await processTaskIpc(
    {
      type: 'schedule_task',
      prompt: 'Unauthorized',
      schedule_type: 'interval',
      schedule_value: '3600000',
      targetJid: 'jid-2',
    },
    'group-one',
    false,
    deps,
  );

  assert(getAllTasks().length === 1, 'Unauthorized cross-group task should be blocked');

  const taskId = firstTasks[0].id.toString();

  await processTaskIpc(
    { type: 'pause_task', taskId },
    'group-one',
    false,
    deps,
  );
  assert(
    getTaskById(firstTasks[0].id)?.status === 'paused',
    'Task should be paused',
  );

  await processTaskIpc(
    { type: 'resume_task', taskId },
    'group-one',
    false,
    deps,
  );
  assert(
    getTaskById(firstTasks[0].id)?.status === 'active',
    'Task should be active after resume',
  );

  await processTaskIpc(
    { type: 'cancel_task', taskId },
    'group-one',
    false,
    deps,
  );
  assert(getAllTasks().length === 0, 'Task should be deleted on cancel');

  await processTaskIpc(
    {
      type: 'register_group',
      jid: 'jid-3',
      name: 'Group Three',
      folder: 'group-three',
      trigger: '@Baby',
    },
    'main',
    true,
    deps,
  );
  assert(Boolean(groups['jid-3']), 'register_group should add new group');

  await processTaskIpc(
    { type: 'refresh_groups' },
    'main',
    true,
    deps,
  );
  assert(refreshed === 1, 'refresh_groups should request metadata sync');
  assert(snapshotWrites === 1, 'refresh_groups should write group snapshot');

  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function runIpcTests(): Promise<void> {
  console.log('\n=== IPC Tests ===\n');
  await testTaskIpcLifecycle();
  console.log('✅ IPC tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runIpcTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runIpcTests };
