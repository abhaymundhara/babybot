import { LLM_PROVIDER } from './config.js';
import { getConfiguredProvider } from './llm-provider.js';
import { logger } from './logger.js';
import { OllamaInput, OllamaOutput, runOllamaAgent } from './ollama-runner.js';
import { runOpenRouterAgent } from './openrouter-runner.js';
import { RegisteredGroup } from './types.js';

export async function runDirectAgent(
  group: RegisteredGroup,
  input: OllamaInput,
  onOutput?: (output: OllamaOutput) => Promise<void>,
): Promise<OllamaOutput> {
  const provider = getConfiguredProvider(LLM_PROVIDER);

  logger.debug({ provider }, 'Selected direct LLM provider');

  if (provider === 'openrouter') {
    return runOpenRouterAgent(group, input, onOutput);
  }

  return runOllamaAgent(group, input, onOutput);
}
