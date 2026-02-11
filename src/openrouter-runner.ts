import {
  OPENROUTER_API_KEY,
  OPENROUTER_APP_NAME,
  OPENROUTER_BASE_URL,
  OPENROUTER_MODEL,
  OPENROUTER_SITE_URL,
} from './config.js';
import { logger } from './logger.js';
import { OllamaInput, OllamaOutput } from './ollama-runner.js';
import { RegisteredGroup } from './types.js';

type SessionMessage = {
  role: 'system' | 'user' | 'assistant';
  content: string;
};

const MAX_SESSION_MESSAGES = 20;
const MESSAGES_TO_KEEP = 19;

const sessions: Map<string, SessionMessage[]> = new Map();

function extractAssistantMessage(content: unknown): string {
  if (typeof content === 'string') {
    return content;
  }

  if (Array.isArray(content)) {
    const textParts = content
      .map((part) => {
        if (typeof part === 'string') return part;
        if (typeof part === 'object' && part !== null && 'text' in part) {
          const text = (part as { text?: unknown }).text;
          return typeof text === 'string' ? text : '';
        }
        return '';
      })
      .filter(Boolean);

    return textParts.join('\n').trim();
  }

  return '';
}

export async function runOpenRouterAgent(
  group: RegisteredGroup,
  input: OllamaInput,
  onOutput?: (output: OllamaOutput) => Promise<void>,
): Promise<OllamaOutput> {
  if (!OPENROUTER_API_KEY) {
    const output: OllamaOutput = {
      status: 'error',
      result: null,
      error: 'OPENROUTER_API_KEY is not set',
    };

    if (onOutput) {
      await onOutput(output);
    }

    return output;
  }

  try {
    const sessionKey = input.sessionId || `${input.groupFolder}-${Date.now()}`;
    let messages = sessions.get(sessionKey) || [];

    if (messages.length === 0 && input.systemPrompt) {
      messages.push({
        role: 'system',
        content: input.systemPrompt,
      });
    }

    messages.push({
      role: 'user',
      content: input.prompt,
    });

    const baseUrl = OPENROUTER_BASE_URL.replace(/\/$/, '');
    const headers: Record<string, string> = {
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      'Content-Type': 'application/json',
    };

    if (OPENROUTER_SITE_URL) {
      headers['HTTP-Referer'] = OPENROUTER_SITE_URL;
    }

    if (OPENROUTER_APP_NAME) {
      headers['X-Title'] = OPENROUTER_APP_NAME;
    }

    logger.info(
      {
        group: group.name,
        provider: 'openrouter',
        model: OPENROUTER_MODEL,
        messageCount: messages.length,
      },
      'Calling OpenRouter',
    );

    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        model: OPENROUTER_MODEL,
        messages,
        stream: false,
      }),
    });

    if (!response.ok) {
      const bodyText = await response.text();
      throw new Error(
        `OpenRouter request failed (${response.status}): ${bodyText.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as {
      choices?: Array<{ message?: { content?: unknown } }>;
    };

    const assistantMessage = extractAssistantMessage(
      data.choices?.[0]?.message?.content,
    );

    if (!assistantMessage) {
      throw new Error('OpenRouter returned an empty response');
    }

    messages.push({
      role: 'assistant',
      content: assistantMessage,
    });

    if (messages.length > MAX_SESSION_MESSAGES) {
      const systemMsg = messages[0].role === 'system' ? [messages[0]] : [];
      messages = [...systemMsg, ...messages.slice(-MESSAGES_TO_KEEP)];
    }

    sessions.set(sessionKey, messages);

    const output: OllamaOutput = {
      status: 'success',
      result: assistantMessage,
      newSessionId: sessionKey,
    };

    if (onOutput) {
      await onOutput(output);
    }

    return output;
  } catch (error) {
    const errorMessage =
      error instanceof Error ? error.message : 'Unknown OpenRouter error';

    logger.error(
      { group: group.name, provider: 'openrouter', error: errorMessage },
      'OpenRouter error',
    );

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
