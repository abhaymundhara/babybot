/**
 * Container Runner for BabyBot
 * 
 * Executes AI agents in isolated containers (Apple Container or Docker)
 * with Ollama integration instead of Anthropic Agent SDK.
 */

import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { DATA_DIR, GROUPS_DIR, MOUNT_ALLOWLIST_PATH } from './config.js';
import { ContainerRuntime, getContainerConfig } from './container-runtime.js';
import { logger } from './logger.js';
import { RegisteredGroup } from './types.js';
import {
  getDefaultAllowlist,
  isPathAllowed,
  loadMountAllowlist,
} from './mount-security.js';

// Sentinel markers for output parsing
const OUTPUT_START_MARKER = '---BABYBOT_OUTPUT_START---';
const OUTPUT_END_MARKER = '---BABYBOT_OUTPUT_END---';

export interface ContainerInput {
  prompt: string;
  sessionId?: string;
  groupFolder: string;
  chatJid: string;
  isMain: boolean;
  systemPrompt?: string;
  queryLoop?: boolean;
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

export interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

export interface ContainerEnvVar {
  key: string;
  value: string;
}

export interface PreparedContainerExecution {
  mounts: VolumeMount[];
  envVars: ContainerEnvVar[];
}

export interface TaskSnapshot {
  id: number;
  groupFolder: string;
  prompt: string;
  schedule_type: string;
  schedule_value: string;
  status: string;
  next_run: string | null;
}

export interface AvailableGroup {
  jid: string;
  name: string;
  lastActivity: string;
  isRegistered: boolean;
}

/**
 * Build volume mounts for container
 */
function buildVolumeMounts(group: RegisteredGroup, isMain: boolean): VolumeMount[] {
  const mounts: VolumeMount[] = [];
  const projectRoot = process.cwd();

  if (isMain) {
    // Main group gets project root access
    mounts.push({
      hostPath: projectRoot,
      containerPath: '/workspace/project',
      readonly: false,
    });
  }

  // All groups get their own folder
  const groupDir = path.join(GROUPS_DIR, group.folder);
  fs.mkdirSync(groupDir, { recursive: true });
  
  mounts.push({
    hostPath: groupDir,
    containerPath: '/workspace/group',
    readonly: false,
  });

  // Global memory (read-only for non-main)
  const globalDir = path.join(GROUPS_DIR, 'global');
  if (fs.existsSync(globalDir)) {
    mounts.push({
      hostPath: globalDir,
      containerPath: '/workspace/global',
      readonly: !isMain,
    });
  }

  // Per-group IPC namespace for message/task tool contracts.
  const groupIpcDir = path.join(DATA_DIR, 'ipc', group.folder);
  fs.mkdirSync(path.join(groupIpcDir, 'messages'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'tasks'), { recursive: true });
  fs.mkdirSync(path.join(groupIpcDir, 'input'), { recursive: true });
  mounts.push({
    hostPath: groupIpcDir,
    containerPath: '/workspace/ipc',
    readonly: false,
  });

  // Per-group persisted Claude-style session directory.
  const sessionDir = path.join(DATA_DIR, 'sessions', group.folder, '.claude');
  fs.mkdirSync(sessionDir, { recursive: true });
  const settingsPath = path.join(sessionDir, 'settings.json');
  if (!fs.existsSync(settingsPath)) {
    fs.writeFileSync(
      settingsPath,
      JSON.stringify(
        {
          env: {
            OLLAMA_EXPERIMENTAL_AGENT_TEAMS: '1',
            OLLAMA_ADDITIONAL_DIRECTORIES_MEMORY: '1',
          },
        },
        null,
        2,
      ) + '\n',
    );
  }
  mounts.push({
    hostPath: sessionDir,
    containerPath: '/home/node/.claude',
    readonly: false,
  });

  const envDir = ensureFilteredEnvDir(group.folder);
  if (envDir) {
    mounts.push({
      hostPath: envDir,
      containerPath: '/workspace/env-dir',
      readonly: true,
    });
  }

  const allowlist = loadMountAllowlist(
    MOUNT_ALLOWLIST_PATH,
    getDefaultAllowlist(projectRoot, GROUPS_DIR),
  );

  for (const mount of mounts) {
    if (!isPathAllowed(mount.hostPath, allowlist)) {
      throw new Error(`Mount path is not allowlisted: ${mount.hostPath}`);
    }
  }

  return mounts;
}

function ensureFilteredEnvDir(groupFolder: string): string | null {
  const allowedKeys = [
    'LLM_PROVIDER',
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'OPENROUTER_BASE_URL',
    'OPENROUTER_MODEL',
    'OPENROUTER_API_KEY',
    'OPENROUTER_SITE_URL',
    'OPENROUTER_APP_NAME',
  ] as const;

  const lines: string[] = [];
  for (const key of allowedKeys) {
    const value = process.env[key];
    if (!value) continue;
    lines.push(`${key}=${value}`);
  }

  if (lines.length === 0) {
    return null;
  }

  const envDir = path.join(DATA_DIR, 'env', groupFolder);
  fs.mkdirSync(envDir, { recursive: true });
  fs.writeFileSync(path.join(envDir, 'env'), `${lines.join('\n')}\n`);
  return envDir;
}

function buildExecutionEnvVars(mounts: VolumeMount[]): ContainerEnvVar[] {
  const envVars: ContainerEnvVar[] = [];
  if (mounts.some((mount) => mount.containerPath === '/workspace/env-dir')) {
    envVars.push({
      key: 'BABYBOT_ENV_FILE',
      value: '/workspace/env-dir/env',
    });
  }
  return envVars;
}

export function prepareContainerExecution(
  group: RegisteredGroup,
  isMain: boolean,
): PreparedContainerExecution {
  const mounts = buildVolumeMounts(group, isMain);
  const envVars = buildExecutionEnvVars(mounts);
  return { mounts, envVars };
}

/**
 * Build container arguments for Apple Container
 */
function buildAppleContainerArgs(
  mounts: VolumeMount[],
  envVars: ContainerEnvVar[],
  containerName: string,
  imageName: string,
): string[] {
  const args: string[] = ['run', '-i', '--rm', '--name', containerName];

  for (const envVar of envVars) {
    args.push('--env', `${envVar.key}=${envVar.value}`);
  }

  for (const mount of mounts) {
    if (mount.readonly) {
      args.push(
        '--mount',
        `type=bind,source=${mount.hostPath},target=${mount.containerPath},readonly`,
      );
    } else {
      args.push('-v', `${mount.hostPath}:${mount.containerPath}`);
    }
  }

  args.push(imageName);
  return args;
}

/**
 * Build container arguments for Docker
 */
function buildDockerArgs(
  mounts: VolumeMount[],
  envVars: ContainerEnvVar[],
  containerName: string,
  imageName: string,
): string[] {
  const args: string[] = [
    'run',
    '-i',
    '--rm',
    '--name',
    containerName,
  ];

  for (const envVar of envVars) {
    args.push('-e', `${envVar.key}=${envVar.value}`);
  }

  for (const mount of mounts) {
    const mode = mount.readonly ? 'ro' : 'rw';
    args.push('-v', `${mount.hostPath}:${mount.containerPath}:${mode}`);
  }

  // Network configuration for Ollama access
  args.push('--add-host', 'host.docker.internal:host-gateway');

  args.push(imageName);
  return args;
}

/**
 * Run agent in container
 */
export async function runContainerAgent(
  group: RegisteredGroup,
  input: ContainerInput,
  onProcess?: (proc: ChildProcess, containerName: string) => void,
  onOutput?: (output: ContainerOutput) => Promise<void>,
): Promise<ContainerOutput> {
  const config = getContainerConfig();

  // If no container runtime, fall back to direct execution
  if (config.runtime === ContainerRuntime.NONE) {
    logger.warn({ group: group.name }, 'No container runtime available, skipping sandboxed execution');
    return {
      status: 'error',
      result: null,
      error: 'Container runtime not available',
    };
  }

  const prepared = prepareContainerExecution(group, input.isMain);
  const mounts = prepared.mounts;
  const envVars = prepared.envVars;

  const safeFolder = group.folder.replace(/[^a-zA-Z0-9-]/g, '-');
  const containerName = `babybot-${safeFolder}-${Date.now()}`;

  const command = config.runtime === ContainerRuntime.APPLE_CONTAINER ? 'container' : 'docker';
  const args = config.runtime === ContainerRuntime.APPLE_CONTAINER
    ? buildAppleContainerArgs(mounts, envVars, containerName, config.imageName)
    : buildDockerArgs(mounts, envVars, containerName, config.imageName);

  logger.info(
    {
      group: group.name,
      runtime: config.runtime,
      containerName,
      mountCount: mounts.length,
    },
    'Spawning container agent',
  );

  return new Promise((resolve) => {
    const container = spawn(command, args, {
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    if (onProcess) {
      onProcess(container, containerName);
    }

    let stdout = '';
    let stderr = '';
    let stdoutTruncated = false;
    let parseBuffer = '';
    let outputChain = Promise.resolve();
    let latestSessionId: string | undefined;
    let hadStreamingOutput = false;
    let timedOut = false;

    const timeoutMs = config.timeout;
    let timeout: ReturnType<typeof setTimeout> | null = null;
    const stopForTimeout = () => {
      timedOut = true;
      container.kill();
      logger.warn({ group: group.name }, 'Container timeout, killing process');
    };
    const resetTimeout = () => {
      if (timeout) clearTimeout(timeout);
      timeout = setTimeout(stopForTimeout, timeoutMs);
    };
    resetTimeout();

    // Write input and close stdin
    container.stdin.write(JSON.stringify(input));
    container.stdin.end();

    // Collect stdout
    container.stdout.on('data', (data) => {
      const chunk = data.toString();
      if (!stdoutTruncated && stdout.length < config.maxOutputSize) {
        const remaining = config.maxOutputSize - stdout.length;
        if (chunk.length > remaining) {
          stdout += chunk.slice(0, remaining);
          stdoutTruncated = true;
        } else {
          stdout += chunk;
        }
      }

      if (!onOutput) {
        return;
      }

      parseBuffer += chunk;
      let startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER);
      while (startIdx !== -1) {
        const endIdx = parseBuffer.indexOf(
          OUTPUT_END_MARKER,
          startIdx + OUTPUT_START_MARKER.length,
        );
        if (endIdx === -1) {
          break;
        }

        const jsonStr = parseBuffer
          .slice(startIdx + OUTPUT_START_MARKER.length, endIdx)
          .trim();
        parseBuffer = parseBuffer.slice(endIdx + OUTPUT_END_MARKER.length);
        startIdx = parseBuffer.indexOf(OUTPUT_START_MARKER);

        try {
          const parsed = JSON.parse(jsonStr) as ContainerOutput;
          hadStreamingOutput = true;
          if (parsed.newSessionId) {
            latestSessionId = parsed.newSessionId;
          }
          resetTimeout();
          outputChain = outputChain.then(() => onOutput(parsed));
        } catch (err) {
          logger.warn({ err }, 'Failed to parse streaming output');
        }
      }
    });

    // Collect stderr
    container.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    container.on('close', (code) => {
      if (timeout) {
        clearTimeout(timeout);
      }
      if (timedOut && hadStreamingOutput) {
        outputChain
          .catch((err) => {
            logger.error({ err }, 'Error in onOutput callback chain');
          })
          .finally(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId: latestSessionId,
            });
          });
        return;
      }

      if (timedOut) {
        resolve({
          status: 'error',
          result: null,
          error: 'Container execution timeout',
        });
        return;
      }

      if (code !== 0) {
        logger.error(
          { group: group.name, code, stderr: stderr.slice(0, 500) },
          'Container exited with error',
        );
        resolve({
          status: 'error',
          result: null,
          error: `Container exited with code ${code}: ${stderr}`,
        });
        return;
      }

      if (onOutput) {
        outputChain
          .catch((err) => {
            logger.error({ err }, 'Error in onOutput callback chain');
          })
          .finally(() => {
            resolve({
              status: 'success',
              result: null,
              newSessionId: latestSessionId,
            });
          });
        return;
      }

      // Parse final output
      const output = parseContainerOutput(stdout);
      resolve(output);
    });
  });
}

/**
 * Parse final container output
 */
function parseContainerOutput(stdout: string): ContainerOutput {
  try {
    // Look for the last complete output block
    const startIdx = stdout.lastIndexOf(OUTPUT_START_MARKER);
    const endIdx = stdout.lastIndexOf(OUTPUT_END_MARKER);

    if (startIdx !== -1 && endIdx !== -1 && endIdx > startIdx) {
      const jsonStr = stdout.slice(
        startIdx + OUTPUT_START_MARKER.length,
        endIdx,
      );
      return JSON.parse(jsonStr) as ContainerOutput;
    }

    // Fallback: treat entire stdout as result
    return {
      status: 'success',
      result: stdout.trim(),
    };
  } catch (err) {
    logger.error({ err }, 'Failed to parse container output');
    return {
      status: 'error',
      result: null,
      error: 'Failed to parse container output',
    };
  }
}

export function writeTasksSnapshot(
  groupFolder: string,
  isMain: boolean,
  tasks: TaskSnapshot[],
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const visibleTasks = isMain
    ? tasks
    : tasks.filter((task) => task.groupFolder === groupFolder);
  const outputPath = path.join(groupIpcDir, 'current_tasks.json');
  fs.writeFileSync(outputPath, JSON.stringify(visibleTasks, null, 2));
}

export function writeGroupsSnapshot(
  groupFolder: string,
  isMain: boolean,
  groups: AvailableGroup[],
): void {
  const groupIpcDir = path.join(DATA_DIR, 'ipc', groupFolder);
  fs.mkdirSync(groupIpcDir, { recursive: true });

  const visibleGroups = isMain ? groups : [];
  const outputPath = path.join(groupIpcDir, 'available_groups.json');
  fs.writeFileSync(
    outputPath,
    JSON.stringify(
      {
        groups: visibleGroups,
        lastSync: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
}

export function enqueueContainerInput(
  groupFolder: string,
  text: string,
): void {
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.mkdirSync(inputDir, { recursive: true });
  const filePath = path.join(
    inputDir,
    `${Date.now()}-${Math.random().toString(36).slice(2, 8)}.json`,
  );
  const tempPath = `${filePath}.tmp`;
  fs.writeFileSync(
    tempPath,
    JSON.stringify(
      {
        type: 'message',
        text,
        timestamp: new Date().toISOString(),
      },
      null,
      2,
    ),
  );
  fs.renameSync(tempPath, filePath);
}

export function closeContainerInput(groupFolder: string): void {
  const inputDir = path.join(DATA_DIR, 'ipc', groupFolder, 'input');
  fs.mkdirSync(inputDir, { recursive: true });
  fs.writeFileSync(path.join(inputDir, '_close'), '');
}
