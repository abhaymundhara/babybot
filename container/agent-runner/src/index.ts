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

// Session storage
const sessions: Map<string, Array<{ role: string; content: string }>> = new Map();

const MAX_SESSION_MESSAGES = 20;
const MESSAGES_TO_KEEP = 19;

/**
 * Send output with markers for parsing
 */
function sendOutput(output: AgentOutput): void {
  const json = JSON.stringify(output);
  console.log(`${OUTPUT_START_MARKER}${json}${OUTPUT_END_MARKER}`);
}

/**
 * Main agent execution
 */
async function runAgent(input: AgentInput): Promise<void> {
  const ollamaUrl = process.env.OLLAMA_BASE_URL || 'http://host.docker.internal:11434';
  const model = process.env.OLLAMA_MODEL || 'llama2';

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

    // Call Ollama
    const response = await ollama.chat({
      model,
      messages: messages.map((m) => ({ role: m.role as any, content: m.content })),
      stream: false,
    });

    const assistantMessage = response.message.content;

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
async function main(): void {
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
