/**
 * Stdio MCP server bridge for BabyBot.
 *
 * This mirrors NanoClaw's standalone MCP stdio process so tools can be exposed
 * through MCP protocol in addition to direct function-calling.
 */

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { z } from 'zod';
import { executeToolCall, ToolExecutionContext } from './ipc-tools.js';

function readContextFromEnv(): ToolExecutionContext {
  const chatJid =
    process.env.NANOCLAW_CHAT_JID || process.env.BABYBOT_CHAT_JID || '';
  const groupFolder =
    process.env.NANOCLAW_GROUP_FOLDER || process.env.BABYBOT_GROUP_FOLDER || '';
  const isMainRaw =
    process.env.NANOCLAW_IS_MAIN || process.env.BABYBOT_IS_MAIN || '0';

  return {
    chatJid,
    groupFolder,
    isMain: isMainRaw === '1' || isMainRaw.toLowerCase() === 'true',
  };
}

function toToolResult(text: string): {
  content: Array<{ type: 'text'; text: string }>;
  isError?: boolean;
} {
  if (text.startsWith('Error:')) {
    return {
      content: [{ type: 'text', text }],
      isError: true,
    };
  }
  return { content: [{ type: 'text', text }] };
}

async function main(): Promise<void> {
  const ctx = readContextFromEnv();
  const server = new McpServer({
    name: 'nanoclaw',
    version: '1.0.0',
  });

  server.tool(
    'send_message',
    'Send a message to the current chat immediately.',
    {
      text: z.string().describe('Message text to send'),
    },
    async (args) => {
      const text = await executeToolCall('mcp__nanoclaw__send_message', args, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'schedule_task',
    'Schedule a recurring or one-time task.',
    {
      prompt: z.string(),
      schedule_type: z.enum(['cron', 'interval', 'once']),
      schedule_value: z.string(),
      target_group_jid: z.string().optional(),
    },
    async (args) => {
      const text = await executeToolCall(
        'mcp__nanoclaw__schedule_task',
        args,
        ctx,
      );
      return toToolResult(text);
    },
  );

  server.tool(
    'list_tasks',
    'List scheduled tasks visible in this context.',
    {},
    async () => {
      const text = await executeToolCall('mcp__nanoclaw__list_tasks', {}, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'pause_task',
    'Pause a scheduled task by ID.',
    { task_id: z.union([z.number(), z.string()]) },
    async (args) => {
      const text = await executeToolCall('mcp__nanoclaw__pause_task', args, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'resume_task',
    'Resume a paused task by ID.',
    { task_id: z.union([z.number(), z.string()]) },
    async (args) => {
      const text = await executeToolCall('mcp__nanoclaw__resume_task', args, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'cancel_task',
    'Cancel and delete a scheduled task by ID.',
    { task_id: z.union([z.number(), z.string()]) },
    async (args) => {
      const text = await executeToolCall('mcp__nanoclaw__cancel_task', args, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'list_groups',
    'List available groups (main group only).',
    {},
    async () => {
      const text = await executeToolCall('mcp__nanoclaw__list_groups', {}, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'refresh_groups',
    'Refresh available groups metadata (main group only).',
    {},
    async () => {
      const text = await executeToolCall('mcp__nanoclaw__refresh_groups', {}, ctx);
      return toToolResult(text);
    },
  );

  server.tool(
    'register_group',
    'Register a new group (main group only).',
    {
      jid: z.string(),
      name: z.string(),
      folder: z.string(),
      requires_trigger: z.boolean().optional(),
      trigger: z.string().optional(),
    },
    async (args) => {
      const text = await executeToolCall(
        'mcp__nanoclaw__register_group',
        args,
        ctx,
      );
      return toToolResult(text);
    },
  );

  server.tool(
    'remove_group',
    'Remove a registered group (main group only).',
    {
      jid: z.string(),
    },
    async (args) => {
      const text = await executeToolCall('mcp__nanoclaw__remove_group', args, ctx);
      return toToolResult(text);
    },
  );

  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  // stderr is the expected place for fatal process errors in stdio servers.
  process.stderr.write(`[ipc-mcp-stdio] ${message}\n`);
  process.exit(1);
});
