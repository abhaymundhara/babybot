type ToolCall = {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
};

type SessionMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content?: string;
  tool_call_id?: string;
  tool_calls?: ToolCall[];
};

interface OpenRouterToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string;
  };
}

type OpenRouterMessage = {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: OpenRouterToolCall[];
  tool_call_id?: string;
};

export function toOpenRouterMessages(
  messages: SessionMessage[],
): OpenRouterMessage[] {
  return messages.map((message) => {
    if (message.role === 'assistant' && Array.isArray(message.tool_calls)) {
      return {
        role: 'assistant',
        content: message.content || '',
        tool_calls: message.tool_calls.map((toolCall) => ({
          id: toolCall.id,
          type: 'function',
          function: {
            name: toolCall.name,
            arguments: JSON.stringify(toolCall.arguments || {}),
          },
        })),
      };
    }

    if (message.role === 'tool') {
      return {
        role: 'tool',
        content: message.content || '',
        tool_call_id: message.tool_call_id,
      };
    }

    return {
      role: message.role,
      content: message.content || '',
    };
  });
}
