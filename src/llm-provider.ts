export type LlmProvider = 'ollama' | 'openrouter';

export function getConfiguredProvider(providerValue: string | undefined): LlmProvider {
  const normalized = (providerValue || 'ollama').trim().toLowerCase();

  if (normalized === 'openrouter') {
    return 'openrouter';
  }

  return 'ollama';
}
