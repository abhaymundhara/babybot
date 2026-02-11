/**
 * Agent Runner - Executes inside containers
 * 
 * This runs inside the container and handles:
 * - Receiving input via stdin
 * - Calling Ollama API
 * - Sending output via stdout with markers
 */

import { Ollama } from 'ollama';
import fs from 'fs';
import path from 'path';
import {
  executeToolCall,
  getToolDefinitions,
  ToolExecutionContext,
} from './ipc-tools.js';

// Sentinel markers for output parsing (must match container-runner.ts)
const OUTPUT_START_MARKER = '---BABYBOT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---BABYBOT_OUTPUT_END---';

interface AgentInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  systemPrompt?: string;
  queryLoop?: boolean;
}

interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

type SessionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

// Session storage
const sessions: Map<string, SessionMessage[]> = new Map();
const SESSION_STORE_FILE =
  process.env.BABYBOT_SESSION_STORE || '/home/node/.claude/babybot-sessions.json';

const MAX_SESSION_MESSAGES = 20;
const MESSAGES_TO_KEEP = 19;
const TOOL_LOOP_LIMIT = 8;
const IPC_BASE_DIR = process.env.BABYBOT_IPC_DIR || '/workspace/ipc';
const IPC_INPUT_DIR = path.join(IPC_BASE_DIR, 'input');
const IPC_CLOSE_SENTINEL = path.join(IPC_INPUT_DIR, '_close');

/**
 * Send output with markers for parsing
 */
function sendOutput(output: AgentOutput): void {
  const json = JSON.stringify(output);
  console.log(`${OUTPUT_START_MARKER}${json}${OUTPUT_END_MARKER}`);
}

function extractOpenRouterMessage(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    return content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter(Boolean)
      .join('\n')
      .trim();
  }

  return '';
}

function normalizeToolCalls(raw: unknown): ToolCall[] {
  if (!Array.isArray(raw)) return [];

  const calls: ToolCall[] = [];
  for (const item of raw) {
    const id =
      typeof (item as { id?: unknown }).id === 'string'
        ? ((item as { id: string }).id || `tool-${Date.now()}`)
        : `tool-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const fn = (item as { function?: unknown }).function;
    const name =
      typeof (fn as { name?: unknown })?.name === 'string'
        ? (fn as { name: string }).name
        : '';
    if (!name) continue;

    let args: Record<string, unknown> = {};
    const rawArgs = (fn as { arguments?: unknown })?.arguments;
    if (typeof rawArgs === 'string') {
      try {
        args = JSON.parse(rawArgs) as Record<string, unknown>;
      } catch {
        args = {};
      }
    } else if (typeof rawArgs === 'object' && rawArgs !== null) {
      args = rawArgs as Record<string, unknown>;
    }

    calls.push({ id, name, arguments: args });
  }
  return calls;
}

function loadEnvFromFile(filePath: string): Record<string, string> {
  if (!filePath || !fs.existsSync(filePath)) {
    return {};
  }

  const values: Record<string, string> = {};
  const content = fs.readFileSync(filePath, 'utf-8');
  for (const line of content.split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx <= 0) continue;
    const key = trimmed.slice(0, idx).trim();
    const value = trimmed.slice(idx + 1).trim();
    values[key] = value;
  }
  return values;
}

function readConfig(name: string, fileEnv: Record<string, string>, fallback = ''): string {
  return fileEnv[name] || process.env[name] || fallback;
}

function hydrateSessionsFromDisk(): void {
  try {
    if (!fs.existsSync(SESSION_STORE_FILE)) return;
    const content = fs.readFileSync(SESSION_STORE_FILE, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, SessionMessage[]>;
    for (const [sessionId, messages] of Object.entries(parsed || {})) {
      if (!Array.isArray(messages)) continue;
      sessions.set(sessionId, messages);
    }
  } catch {
    // best effort load
  }
}

function persistSessionsToDisk(): void {
  try {
    const dir = path.dirname(SESSION_STORE_FILE);
    fs.mkdirSync(dir, { recursive: true });
    const serialized: Record<string, SessionMessage[]> = {};
    for (const [sessionId, messages] of sessions.entries()) {
      serialized[sessionId] = messages;
    }
    fs.writeFileSync(SESSION_STORE_FILE, JSON.stringify(serialized, null, 2));
  } catch {
    // best effort persist
  }
}

/**
 * Main agent execution
 */
async function runAgent(input: AgentInput): Promise<AgentOutput> {
  const fileEnv = loadEnvFromFile(process.env.BABYBOT_ENV_FILE || '');
  const provider = readConfig('LLM_PROVIDER', fileEnv, 'ollama').trim().toLowerCase();
  const ollamaUrl = readConfig(
    'OLLAMA_BASE_URL',
    fileEnv,
    'http://host.docker.internal:11434',
  );
  const ollamaModel = readConfig('OLLAMA_MODEL', fileEnv, 'llama2');
  const openRouterBaseUrl = readConfig(
    'OPENROUTER_BASE_URL',
    fileEnv,
    'https://openrouter.ai/api/v1',
  ).replace(/\/$/, '');
  const openRouterModel = readConfig(
    'OPENROUTER_MODEL',
    fileEnv,
    'openai/gpt-4o-mini',
  );
  const openRouterKey = readConfig('OPENROUTER_API_KEY', fileEnv, '');
  const openRouterSiteUrl = readConfig('OPENROUTER_SITE_URL', fileEnv, '');
  const openRouterAppName = readConfig('OPENROUTER_APP_NAME', fileEnv, 'BabyBot');

  const ollama = new Ollama({ host: ollamaUrl });
  const toolContext: ToolExecutionContext = {
    chatJid: input.chatJid,
    groupFolder: input.groupFolder,
    isMain: input.isMain,
  };
  const tools = getToolDefinitions();

  try {
    // Get or create session
    const sessionKey = input.sessionId || `${input.groupFolder}-${Date.now()}`;
    let messages = sessions.get(sessionKey) || [];

    // Add system prompt if new session
    if (messages.length === 0 && input.systemPrompt) {
      messages.push({
        role: 'system',
        content: input.systemPrompt,
      });
    }

    // Add user message
    messages.push({
      role: 'user',
      content: input.prompt,
    });

    let assistantMessage = '';
    for (let i = 0; i < TOOL_LOOP_LIMIT; i++) {
      if (provider === 'openrouter') {
        if (!openRouterKey) {
          throw new Error('OPENROUTER_API_KEY is not set');
        }

        const headers: Record<string, string> = {
          Authorization: `Bearer ${openRouterKey}`,
          'Content-Type': 'application/json',
        };

        if (openRouterSiteUrl) {
          headers['HTTP-Referer'] = openRouterSiteUrl;
        }

        if (openRouterAppName) {
          headers['X-Title'] = openRouterAppName;
        }

        const response = await fetch(`${openRouterBaseUrl}/chat/completions`, {
          method: 'POST',
          headers,
          body: JSON.stringify({
            model: openRouterModel,
            messages,
            tools,
            tool_choice: 'auto',
            stream: false,
          }),
        });

        if (!response.ok) {
          const body = await response.text();
          throw new Error(
            `OpenRouter request failed (${response.status}): ${body.slice(0, 500)}`,
          );
        }

        const data = (await response.json()) as {
          choices?: Array<{
            message?: {
              role?: string;
              content?: unknown;
              tool_calls?: unknown;
            };
          }>;
        };
        const message = data.choices?.[0]?.message;
        const toolCalls = normalizeToolCalls(message?.tool_calls);
        assistantMessage = extractOpenRouterMessage(message?.content);

        if (toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: 'assistant',
          content: assistantMessage || '',
          tool_calls: toolCalls,
        });
        for (const toolCall of toolCalls) {
          const result = await executeToolCall(
            toolCall.name,
            toolCall.arguments,
            toolContext,
          );
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      } else {
        const response = await ollama.chat({
          model: ollamaModel,
          messages: messages.map((message) => {
            const role =
              message.role === 'tool' ? ('assistant' as const) : message.role;
            return { role, content: message.content || '' };
          }),
          tools: tools as unknown as undefined,
          stream: false,
        });

        const toolCalls = normalizeToolCalls(
          (response.message as { tool_calls?: unknown }).tool_calls,
        );
        assistantMessage = response.message.content || '';
        if (toolCalls.length === 0) {
          break;
        }

        messages.push({
          role: 'assistant',
          content: assistantMessage || '',
          tool_calls: toolCalls,
        });
        for (const toolCall of toolCalls) {
          const result = await executeToolCall(
            toolCall.name,
            toolCall.arguments,
            toolContext,
          );
          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: result,
          });
        }
      }
    }
    if (!assistantMessage) {
      assistantMessage = 'Done.';
    }

    // Add assistant response to session
    messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    // Trim session history
    if (messages.length > MAX_SESSION_MESSAGES) {
      const systemMsg = messages[0].role === 'system' ? [messages[0]] : [];
      messages = [...systemMsg, ...messages.slice(-MESSAGES_TO_KEEP)];
    }
    sessions.set(sessionKey, messages);
    persistSessionsToDisk();

    // Send success output
    return {
      status: 'success',
      result: assistantMessage,
      newSessionId: sessionKey,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    return {
      status: 'error',
      result: null,
      error: errorMessage,
    };
  }
}

/**
 * Read input from stdin
 */
function readStdin(): Promise<string> {
  return new Promise((resolve) => {
    let data = '';
    process.stdin.on('data', (chunk) => {
      data += chunk.toString();
    });
    process.stdin.on('end', () => {
      resolve(data);
    });
  });
}

function drainIpcInputMessages(): string[] {
  try {
    fs.mkdirSync(IPC_INPUT_DIR, { recursive: true });
    const files = fs
      .readdirSync(IPC_INPUT_DIR)
      .filter((file) => file.endsWith('.json'))
      .sort();
    const messages: string[] = [];
    for (const file of files) {
      const filePath = path.join(IPC_INPUT_DIR, file);
      try {
        const parsed = JSON.parse(fs.readFileSync(filePath, 'utf-8')) as {
          type?: string;
          text?: string;
        };
        if (parsed.type === 'message' && parsed.text) {
          messages.push(parsed.text);
        }
      } finally {
        try {
          fs.unlinkSync(filePath);
        } catch {
          // ignore
        }
      }
    }
    return messages;
  } catch {
    return [];
  }
}

function consumeCloseSentinel(): boolean {
  if (!fs.existsSync(IPC_CLOSE_SENTINEL)) return false;
  try {
    fs.unlinkSync(IPC_CLOSE_SENTINEL);
  } catch {
    // ignore
  }
  return true;
}

function waitForIpcMessageOrClose(): Promise<string | null> {
  return new Promise((resolve) => {
    const poll = () => {
      if (consumeCloseSentinel()) {
        resolve(null);
        return;
      }
      const messages = drainIpcInputMessages();
      if (messages.length > 0) {
        resolve(messages.join('\n'));
        return;
      }
      setTimeout(poll, 500);
    };
    poll();
  });
}

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    hydrateSessionsFromDisk();
    const inputStr = await readStdin();
    const input: AgentInput = JSON.parse(inputStr);
    let currentInput = { ...input };
    let output = await runAgent(currentInput);
    sendOutput(output);

    while (currentInput.queryLoop) {
      const nextMessage = await waitForIpcMessageOrClose();
      if (nextMessage === null) break;
      currentInput = {
        ...currentInput,
        prompt: nextMessage,
        sessionId: output.newSessionId || currentInput.sessionId,
      };
      output = await runAgent(currentInput);
      sendOutput(output);
      if (output.status === 'error') break;
    }
    process.exit(0);
  } catch (error) {
    sendOutput({
      status: 'error',
      result: null,
      error: error instanceof Error ? error.message : 'Failed to parse input',
    });
    process.exit(1);
  }
}

main();
