/**
 * Agent Runner - Executes inside containers
 * 
 * This runs inside the container and handles:
 * - Receiving input via stdin
 * - Calling Ollama API
 * - Sending output via stdout with markers
 */

import { Ollama } from 'ollama';

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
}

interface AgentOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

type SessionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

// Session storage
const sessions: Map<string, SessionMessage[]> = new Map();

const MAX_SESSION_MESSAGES = 20;
const MESSAGES_TO_KEEP = 19;

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

/**
 * Main agent execution
 */
async function runAgent(input: AgentInput): Promise<void> {
  const provider = (process.env.LLM_PROVIDER || 'ollama').trim().toLowerCase();
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
  const ollamaModel = process.env.OLLAMA_MODEL || 'llama2';
  const openRouterBaseUrl = (process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  const openRouterModel = process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
  const openRouterKey = process.env.OPENROUTER_API_KEY || '';
  const openRouterSiteUrl = process.env.OPENROUTER_SITE_URL || '';
  const openRouterAppName = process.env.OPENROUTER_APP_NAME || 'BabyBot';

  const ollama = new Ollama({ host: ollamaUrl });

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
          stream: false,
        }),
      });

      if (!response.ok) {
        const body = await response.text();
        throw new Error(`OpenRouter request failed (${response.status}): ${body.slice(0, 500)}`);
      }

      const data = (await response.json()) as {
        choices?: Array<{ message?: { content?: unknown } }>;
      };

      assistantMessage = extractOpenRouterMessage(data.choices?.[0]?.message?.content);
      if (!assistantMessage) {
        throw new Error('OpenRouter returned empty content');
      }
    } else {
      // Default to Ollama
      const response = await ollama.chat({
        model: ollamaModel,
        messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
        stream: false,
      });

      assistantMessage = response.message.content;
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

    // Send success output
    sendOutput({
      status: 'success',
      result: assistantMessage,
      newSessionId: sessionKey,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    sendOutput({
      status: 'error',
      result: null,
      error: errorMessage,
    });
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

/**
 * Main entry point
 */
async function main(): Promise<void> {
  try {
    const inputStr = await readStdin();
    const input: AgentInput = JSON.parse(inputStr);
    await runAgent(input);
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
