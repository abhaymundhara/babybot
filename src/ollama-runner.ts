import { Ollama } from 'ollama';
import { OLLAMA_BASE_URL, OLLAMA_MODEL } from './config.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';

export interface OllamaInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  systemPrompt?: string;
}

export interface OllamaOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

// Configuration constants
const MAX_SESSION_MESSAGES = 20;
const MESSAGES_TO_KEEP = 19;

// Simple session storage (in-memory for now)
const sessions: Map<string, Array<{ role: string; content: string }>> = new Map();

export async function runOllamaAgent(
  group: RegisteredGroup,
  input: OllamaInput,
  onOutput?: (output: OllamaOutput) => Promise<void>,
): Promise<OllamaOutput> {
  const ollama = new Ollama({ host: OLLAMA_BASE_URL });

  try {
    // Get or create session
    const sessionKey = input.sessionId || `${input.groupFolder}-${Date.now()}`;
    let messages = sessions.get(sessionKey) || [];

    // Add system prompt if this is a new session
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

    logger.info(
      {
        group: group.name,
        model: OLLAMA_MODEL,
        messageCount: messages.length,
      },
      'Calling Ollama',
    );

    // Call Ollama with streaming
    const response = await ollama.chat({
      model: OLLAMA_MODEL,
      messages: messages,
      stream: false, // For simplicity, we'll use non-streaming initially
    });

    const assistantMessage = response.message.content;

    // Add assistant response to session
    messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    // Save session (keep only last N messages to avoid memory issues)
    if (messages.length > MAX_SESSION_MESSAGES) {
      const systemMsg = messages[0].role === 'system' ? [messages[0]] : [];
      messages = [...systemMsg, ...messages.slice(-MESSAGES_TO_KEEP)];
    }
    sessions.set(sessionKey, messages);

    logger.info(
      { group: group.name, responseLength: assistantMessage.length },
      'Ollama response received',
    );

    // Call output callback if provided
    if (onOutput) {
      await onOutput({
        status: 'success',
        result: assistantMessage,
        newSessionId: sessionKey,
      });
    }

    return {
      status: 'success',
      result: assistantMessage,
      newSessionId: sessionKey,
    };
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown error';
    logger.error({ group: group.name, error: errorMessage }, 'Ollama error');

    const output: OllamaOutput = {
      status: 'error',
      result: null,
      error: errorMessage,
    };

    if (onOutput) {
      await onOutput(output);
    }

    return output;
  }
}

// Clear a session (for testing or explicit reset)
export function clearSession(sessionId: string): void {
  sessions.delete(sessionId);
}

// Get default system prompt
export function getSystemPrompt(groupName: string, isMain: boolean): string {
  if (isMain) {
    return `You are a helpful AI assistant. You can help manage tasks, schedule jobs, and interact with various groups. Your name is Baby. Be concise and helpful.`;
  }
  return `You are a helpful AI assistant in the ${groupName} group. Your name is Baby. Be concise and helpful in your responses.`;
}
