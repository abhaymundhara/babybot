/**
 * Agent runner tool bridge tests
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import {
  executeToolCall,
  getToolDefinitions,
} from '../../container/agent-runner/src/ipc-tools.js';

async function testToolDefinitionsIncludeCoreTools(): Promise<void> {
  const tools = getToolDefinitions();
  const names = new Set(tools.map((tool) => tool.function.name));
  assert(
    names.has('mcp__nanoclaw__send_message'),
    'Expected mcp__nanoclaw__send_message tool',
  );
  assert(
    names.has('mcp__nanoclaw__schedule_task'),
    'Expected mcp__nanoclaw__schedule_task tool',
  );
  assert(
    names.has('mcp__nanoclaw__list_tasks'),
    'Expected mcp__nanoclaw__list_tasks tool',
  );
  assert(names.has('agent_browser'), 'Expected agent_browser tool');
}

async function testSendMessageWritesIpcFile(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `agent-tools-${Date.now()}`,
  );
  const ipcDir = path.join(tempRoot, 'ipc');
  fs.mkdirSync(ipcDir, { recursive: true });
  const previousIpcDir = process.env.BABYBOT_IPC_DIR;
  process.env.BABYBOT_IPC_DIR = ipcDir;

  const result = await executeToolCall(
    'mcp__nanoclaw__send_message',
    { text: 'hello from tool' },
    { chatJid: 'jid-1', groupFolder: 'group-1', isMain: false },
  );
  assert(result.includes('Message queued'), 'Expected queued confirmation');

  const messagesDir = path.join(ipcDir, 'messages');
  const files = fs.readdirSync(messagesDir).filter((file) => file.endsWith('.json'));
  assert(files.length === 1, 'Expected one IPC message file');

  const payload = JSON.parse(
    fs.readFileSync(path.join(messagesDir, files[0]), 'utf-8'),
  ) as { type: string; text: string; chatJid: string };
  assert(payload.type === 'message', 'Expected message payload type');
  assert(payload.text === 'hello from tool', 'Expected message payload text');
  assert(payload.chatJid === 'jid-1', 'Expected message payload chatJid');

  process.env.BABYBOT_IPC_DIR = previousIpcDir;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function testListTasksHonorsGroupVisibility(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `agent-tools-list-${Date.now()}`,
  );
  const ipcDir = path.join(tempRoot, 'ipc');
  fs.mkdirSync(ipcDir, { recursive: true });
  const previousIpcDir = process.env.BABYBOT_IPC_DIR;
  process.env.BABYBOT_IPC_DIR = ipcDir;

  fs.writeFileSync(
    path.join(ipcDir, 'current_tasks.json'),
    JSON.stringify(
      [
        { id: 1, groupFolder: 'group-a', prompt: 'A' },
        { id: 2, groupFolder: 'group-b', prompt: 'B' },
      ],
      null,
      2,
    ),
  );

  const mainView = await executeToolCall(
    'mcp__nanoclaw__list_tasks',
    {},
    { chatJid: 'main', groupFolder: 'main', isMain: true },
  );
  assert(mainView.includes('"id": 1'), 'Main should see task 1');
  assert(mainView.includes('"id": 2'), 'Main should see task 2');

  const groupView = await executeToolCall(
    'mcp__nanoclaw__list_tasks',
    {},
    { chatJid: 'group-a-jid', groupFolder: 'group-a', isMain: false },
  );
  assert(groupView.includes('"id": 1'), 'Group should see own task');
  assert(!groupView.includes('"id": 2'), 'Group should not see other group task');

  process.env.BABYBOT_IPC_DIR = previousIpcDir;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function testAgentBrowserToolExecutesCommand(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `agent-browser-tool-${Date.now()}`,
  );
  const binDir = path.join(tempRoot, 'bin');
  fs.mkdirSync(binDir, { recursive: true });

  const mockBrowserPath = path.join(binDir, 'agent-browser');
  fs.writeFileSync(
    mockBrowserPath,
    '#!/usr/bin/env sh\necho "agent-browser:$@"\n',
  );
  fs.chmodSync(mockBrowserPath, 0o755);

  const previousPath = process.env.PATH;
  process.env.PATH = `${binDir}:${previousPath}`;

  const result = await executeToolCall(
    'agent_browser',
    { args: ['get', 'title'] },
    { chatJid: 'jid-1', groupFolder: 'group-1', isMain: false },
  );
  assert(
    result.includes('agent-browser:get title'),
    'Expected mocked agent-browser output',
  );

  process.env.PATH = previousPath;
  fs.rmSync(tempRoot, { recursive: true, force: true });
}

async function runAgentRunnerToolTests(): Promise<void> {
  console.log('\n=== Agent Runner Tool Bridge Tests ===\n');
  await testToolDefinitionsIncludeCoreTools();
  await testSendMessageWritesIpcFile();
  await testListTasksHonorsGroupVisibility();
  await testAgentBrowserToolExecutesCommand();
  console.log('✅ Agent runner tool bridge tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runAgentRunnerToolTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runAgentRunnerToolTests };
