import path from 'path';
import os from 'os';

export const ASSISTANT_NAME = process.env.ASSISTANT_NAME || 'Baby';
export const POLL_INTERVAL = 2000;
export const SCHEDULER_POLL_INTERVAL = 60000;
export const CONVERSATION_CONTEXT_WINDOW = Math.max(
  1,
  parseInt(process.env.CONVERSATION_CONTEXT_WINDOW || '12', 10) || 12,
);

// Absolute paths
const PROJECT_ROOT = process.cwd();

export const STORE_DIR = path.resolve(PROJECT_ROOT, 'store');
export const GROUPS_DIR = path.resolve(PROJECT_ROOT, 'groups');
export const DATA_DIR = path.resolve(PROJECT_ROOT, 'data');
export const MAIN_GROUP_FOLDER = 'main';

// Ollama configuration
export const OLLAMA_BASE_URL =
  process.env.OLLAMA_BASE_URL || 'http://localhost:11434';
export const OLLAMA_MODEL = process.env.OLLAMA_MODEL || 'llama2';

// LLM provider configuration
// Options: ollama, openrouter
export const LLM_PROVIDER = process.env.LLM_PROVIDER || 'ollama';
export const OPENROUTER_BASE_URL =
  process.env.OPENROUTER_BASE_URL || 'https://openrouter.ai/api/v1';
export const OPENROUTER_MODEL =
  process.env.OPENROUTER_MODEL || 'openai/gpt-4o-mini';
export const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';
export const OPENROUTER_SITE_URL = process.env.OPENROUTER_SITE_URL || '';
export const OPENROUTER_APP_NAME = process.env.OPENROUTER_APP_NAME || 'BabyBot';

// Container configuration
export const CONTAINER_RUNTIME = process.env.CONTAINER_RUNTIME || 'auto'; // auto, apple-container, docker, none
export const CONTAINER_IMAGE =
  process.env.CONTAINER_IMAGE || 'babybot-agent:latest';
export const CONTAINER_TIMEOUT = parseInt(
  process.env.CONTAINER_TIMEOUT || '1800000',
  10,
);
export const CONTAINER_MAX_OUTPUT_SIZE = parseInt(
  process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
  10,
);
export const MOUNT_ALLOWLIST_PATH =
  process.env.MOUNT_ALLOWLIST_PATH ||
  path.join(os.homedir(), '.config', 'babybot', 'mount-allowlist.json');

export const IPC_POLL_INTERVAL = 1000;
export const IDLE_TIMEOUT = parseInt(process.env.IDLE_TIMEOUT || '1800000', 10); // 30min default
export const MAX_CONCURRENT_CONTAINERS = Math.max(
  1,
  parseInt(process.env.MAX_CONCURRENT_CONTAINERS || '5', 10) || 5,
);

// Agent Swarm configuration
export const ENABLE_AGENT_SWARMS =
  process.env.ENABLE_AGENT_SWARMS === 'true' || false;
export const MAX_SWARM_SIZE = parseInt(process.env.MAX_SWARM_SIZE || '10', 10);
export const OLLAMA_EXPERIMENTAL_AGENT_TEAMS =
  process.env.OLLAMA_EXPERIMENTAL_AGENT_TEAMS === '1';
export const OLLAMA_ADDITIONAL_DIRECTORIES_MEMORY =
  process.env.OLLAMA_ADDITIONAL_DIRECTORIES_MEMORY === '1';
export const OLLAMA_DISABLE_AUTO_MEMORY =
  process.env.OLLAMA_DISABLE_AUTO_MEMORY === '1';

function escapeRegex(str: string): string {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export const TRIGGER_PATTERN = new RegExp(
  `^@${escapeRegex(ASSISTANT_NAME)}\\b`,
  'i',
);

// Timezone for scheduled tasks
export const TIMEZONE =
  process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
