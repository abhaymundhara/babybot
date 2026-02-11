/**
 * Container Runner for BabyBot
 * 
 * Executes AI agents in isolated containers (Apple Container or Docker)
 * with Ollama integration instead of Anthropic Agent SDK.
 */

import { ChildProcess, spawn } from 'child_process';
import fs from 'fs';
import path from 'path';
import { GROUPS_DIR, MOUNT_ALLOWLIST_PATH } from './config.js';
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
}

export interface ContainerOutput {
  status: 'success' | 'error';
  result: string | null;
  newSessionId?: string;
  error?: string;
}

interface VolumeMount {
  hostPath: string;
  containerPath: string;
  readonly: boolean;
}

interface ContainerEnvVar {
  key: string;
  value: string;
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

  const mounts = buildVolumeMounts(group, input.isMain);
  const passthroughEnvKeys = [
    'LLM_PROVIDER',
    'OLLAMA_BASE_URL',
    'OLLAMA_MODEL',
    'OPENROUTER_BASE_URL',
    'OPENROUTER_MODEL',
    'OPENROUTER_API_KEY',
    'OPENROUTER_SITE_URL',
    'OPENROUTER_APP_NAME',
  ] as const;
  const envVars: ContainerEnvVar[] = [];
  for (const key of passthroughEnvKeys) {
    const value = process.env[key];
    if (value) {
      envVars.push({ key, value });
    }
  }

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

      // Parse streaming output
      if (onOutput) {
        parseStreamingOutput(chunk, onOutput);
      }
    });

    // Collect stderr
    container.stderr.on('data', (data) => {
      stderr += data.toString();
    });

    // Handle completion
    container.on('close', (code) => {
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

      // Parse final output
      const output = parseContainerOutput(stdout);
      resolve(output);
    });

    // Timeout
    setTimeout(() => {
      container.kill();
      logger.warn({ group: group.name }, 'Container timeout, killing process');
      resolve({
        status: 'error',
        result: null,
        error: 'Container execution timeout',
      });
    }, config.timeout);
  });
}

/**
 * Parse streaming output from container
 */
function parseStreamingOutput(
  chunk: string,
  onOutput: (output: ContainerOutput) => Promise<void>,
): void {
  // Look for output markers
  const lines = chunk.split('\n');
  for (const line of lines) {
    if (line.includes(OUTPUT_START_MARKER)) {
      // Extract JSON between markers
      const startIdx = line.indexOf(OUTPUT_START_MARKER) + OUTPUT_START_MARKER.length;
      const endIdx = line.indexOf(OUTPUT_END_MARKER);
      if (endIdx !== -1) {
        try {
          const jsonStr = line.slice(startIdx, endIdx);
          const output = JSON.parse(jsonStr) as ContainerOutput;
          onOutput(output).catch((err) => {
            logger.error({ err }, 'Error in onOutput callback');
          });
        } catch (err) {
          logger.warn({ err, line }, 'Failed to parse streaming output');
        }
      }
    }
  }
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
