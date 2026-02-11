/**
 * MCP stdio server parity tests.
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { assert, waitFor } from '../test-utils.js';

interface JsonRpcMessage {
  jsonrpc: '2.0';
  id?: number;
  method?: string;
  params?: Record<string, unknown>;
  result?: Record<string, unknown>;
  error?: { code: number; message: string };
}

async function runMcpExchange(): Promise<void> {
  const tempRoot = path.join(
    process.cwd(),
    'tests',
    '.test-data',
    `mcp-stdio-${Date.now()}`,
  );
  const ipcDir = path.join(tempRoot, 'ipc');
  fs.mkdirSync(ipcDir, { recursive: true });

  const child = spawn(
    'npx',
    ['tsx', 'container/agent-runner/src/ipc-mcp-stdio.ts'],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        BABYBOT_IPC_DIR: ipcDir,
        NANOCLAW_CHAT_JID: 'jid-stdio',
        NANOCLAW_GROUP_FOLDER: 'group-stdio',
        NANOCLAW_IS_MAIN: '0',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
    },
  );

  const responses: JsonRpcMessage[] = [];
  let stdoutBuffer = '';
  child.stdout.on('data', (chunk: Buffer) => {
    stdoutBuffer += chunk.toString('utf-8');
    while (true) {
      const newlineIdx = stdoutBuffer.indexOf('\n');
      if (newlineIdx === -1) break;
      const line = stdoutBuffer.slice(0, newlineIdx).trim();
      stdoutBuffer = stdoutBuffer.slice(newlineIdx + 1);
      if (!line) continue;
      responses.push(JSON.parse(line) as JsonRpcMessage);
    }
  });

  const stderrChunks: string[] = [];
  child.stderr.on('data', (chunk: Buffer) => {
    stderrChunks.push(chunk.toString('utf-8'));
  });

  const send = (message: object) => {
    child.stdin.write(`${JSON.stringify(message)}\n`);
  };

  send({
    jsonrpc: '2.0',
    id: 1,
    method: 'initialize',
    params: {
      protocolVersion: '2025-06-18',
      clientInfo: { name: 'babybot-test', version: '1.0.0' },
      capabilities: {},
    },
  });

  await waitFor(
    () => responses.some((resp) => resp.id === 1 && Boolean(resp.result)),
    5000,
    25,
  );

  send({
    jsonrpc: '2.0',
    method: 'notifications/initialized',
    params: {},
  });

  send({
    jsonrpc: '2.0',
    id: 2,
    method: 'tools/list',
    params: {},
  });

  await waitFor(
    () => responses.some((resp) => resp.id === 2 && Boolean(resp.result)),
    5000,
    25,
  );
  const listResponse = responses.find((resp) => resp.id === 2);
  const tools = (listResponse?.result?.tools as Array<{ name: string }>) || [];
  assert(
    tools.some((tool) => tool.name === 'send_message'),
    'Expected send_message tool in MCP tools/list response',
  );

  send({
    jsonrpc: '2.0',
    id: 3,
    method: 'tools/call',
    params: {
      name: 'send_message',
      arguments: {
        text: 'hello via mcp stdio',
      },
    },
  });

  await waitFor(
    () => responses.some((resp) => resp.id === 3 && Boolean(resp.result)),
    5000,
    25,
  );

  const messagesDir = path.join(ipcDir, 'messages');
  await waitFor(
    () =>
      fs.existsSync(messagesDir) &&
      fs.readdirSync(messagesDir).some((f) => f.endsWith('.json')),
    5000,
    25,
  );

  const files = fs.readdirSync(messagesDir).filter((f) => f.endsWith('.json'));
  const payload = JSON.parse(
    fs.readFileSync(path.join(messagesDir, files[0]), 'utf-8'),
  ) as { type: string; text: string; chatJid: string };
  assert(payload.type === 'message', 'Expected message payload type');
  assert(payload.text === 'hello via mcp stdio', 'Expected message text');
  assert(payload.chatJid === 'jid-stdio', 'Expected chat JID from MCP context');

  child.kill('SIGTERM');
  await waitFor(() => child.killed, 3000, 25).catch(() => undefined);
  fs.rmSync(tempRoot, { recursive: true, force: true });

  const stderr = stderrChunks.join('');
  assert(!stderr.includes('Error:'), 'MCP stdio server should not crash');
}

async function runMcpStdioTests(): Promise<void> {
  console.log('\n=== MCP Stdio Parity Tests ===\n');
  await runMcpExchange();
  console.log('✅ MCP stdio parity tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMcpStdioTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runMcpStdioTests };
