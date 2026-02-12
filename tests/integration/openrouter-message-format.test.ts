/**
 * OpenRouter message serialization tests.
 */

import { assert } from '../test-utils.js';
import { toOpenRouterMessages } from '../../container/agent-runner/src/openrouter-format.js';

async function testToolCallsHaveRequiredOpenAIShape(): Promise<void> {
  const messages = toOpenRouterMessages([
    { role: 'system', content: 'sys' },
    { role: 'user', content: 'hello' },
    {
      role: 'assistant',
      content: '',
      tool_calls: [
        {
          id: 'call_1',
          name: 'mcp__nanoclaw__send_message',
          arguments: { text: 'ping' },
        },
      ],
    },
    {
      role: 'tool',
      tool_call_id: 'call_1',
      content: 'Message queued',
    },
  ]);

  const assistant = messages.find((m) => m.role === 'assistant');
  assert(Boolean(assistant), 'Expected assistant message');
  assert(
    Array.isArray(assistant?.tool_calls) &&
      assistant?.tool_calls[0]?.id === 'call_1',
    'Expected tool call id',
  );
  assert(
    assistant?.tool_calls?.[0]?.type === 'function',
    'Expected tool call type=function',
  );
  assert(
    typeof assistant?.tool_calls?.[0]?.function?.arguments === 'string',
    'Expected tool call arguments serialized to string',
  );

  const tool = messages.find((m) => m.role === 'tool');
  assert(tool?.tool_call_id === 'call_1', 'Expected tool_call_id on tool message');
}

async function runOpenRouterFormatTests(): Promise<void> {
  console.log('\n=== OpenRouter Message Format Tests ===\n');
  await testToolCallsHaveRequiredOpenAIShape();
  console.log('✅ OpenRouter message format tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runOpenRouterFormatTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runOpenRouterFormatTests };
