/**
 * LLM Provider Selection Tests
 */

import { assertEqual } from '../test-utils.js';
import { getConfiguredProvider } from '../../src/llm-provider.js';

async function testDefaultProvider(): Promise<void> {
  assertEqual(
    getConfiguredProvider(undefined),
    'ollama',
    'Default provider should be ollama',
  );
}

async function testOpenRouterProvider(): Promise<void> {
  assertEqual(
    getConfiguredProvider('openrouter'),
    'openrouter',
    'openrouter provider should be accepted',
  );
}

async function testInvalidProviderFallback(): Promise<void> {
  assertEqual(
    getConfiguredProvider('something-else'),
    'ollama',
    'Invalid provider should fallback to ollama',
  );
}

export async function runLlmProviderTests(): Promise<void> {
  console.log('\n=== LLM Provider Tests ===\n');

  await testDefaultProvider();
  await testOpenRouterProvider();
  await testInvalidProviderFallback();

  console.log('✅ LLM provider tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runLlmProviderTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
