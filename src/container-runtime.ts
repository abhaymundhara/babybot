/**
 * Container Runtime Detection and Management
 *
 * Detects available container runtimes (Apple Container, Docker) and provides
 * utilities for container-based agent execution.
 */

import { execSync } from 'child_process';
import os from 'os';
import { logger } from './logger.js';

export enum ContainerRuntime {
  APPLE_CONTAINER = 'apple-container',
  DOCKER = 'docker',
  NONE = 'none',
}

/**
 * Detect available container runtime on the system
 */
export function detectContainerRuntime(): ContainerRuntime {
  const platform = os.platform();
  const forcedRuntime = process.env.CONTAINER_RUNTIME;

  // Check for forced runtime
  if (forcedRuntime) {
    if (
      forcedRuntime === 'apple-container' ||
      forcedRuntime === 'docker' ||
      forcedRuntime === 'none'
    ) {
      logger.info(
        { runtime: forcedRuntime },
        'Using forced container runtime from environment',
      );
      return forcedRuntime as ContainerRuntime;
    }
    logger.warn(
      { forcedRuntime },
      'Invalid CONTAINER_RUNTIME value, auto-detecting',
    );
  }

  // Auto-detect based on platform and available tools
  if (platform === 'darwin') {
    // macOS: Check for Apple Container first, then Docker
    if (isAppleContainerAvailable()) {
      logger.info('Apple Container detected');
      return ContainerRuntime.APPLE_CONTAINER;
    }
    if (isDockerAvailable()) {
      logger.info('Docker detected on macOS');
      return ContainerRuntime.DOCKER;
    }
  } else if (platform === 'linux') {
    // Linux: Check for Docker
    if (isDockerAvailable()) {
      logger.info('Docker detected on Linux');
      return ContainerRuntime.DOCKER;
    }
  }

  logger.warn('No container runtime detected, using direct execution');
  return ContainerRuntime.NONE;
}

/**
 * Check if Apple Container is available
 */
function isAppleContainerAvailable(): boolean {
  try {
    execSync('which container', { stdio: 'pipe' });
    // Verify it's actually executable
    execSync('container --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Check if Docker is available
 */
function isDockerAvailable(): boolean {
  try {
    execSync('which docker', { stdio: 'pipe' });
    // Verify docker daemon is running
    execSync('docker ps', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Get container runtime configuration
 */
export interface ContainerConfig {
  runtime: ContainerRuntime;
  imageName: string;
  timeout: number;
  maxOutputSize: number;
}

export function getContainerConfig(): ContainerConfig {
  const runtime = detectContainerRuntime();

  return {
    runtime,
    imageName: process.env.CONTAINER_IMAGE || 'babybot-agent:latest',
    timeout: parseInt(process.env.CONTAINER_TIMEOUT || '1800000', 10),
    maxOutputSize: parseInt(
      process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760',
      10,
    ),
  };
}

function parseContainerListJson(
  output: string,
): Array<{ name: string; status: string }> {
  const trimmed = output.trim();
  if (!trimmed) return [];

  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => {
          const name = item?.configuration?.id || item?.name || item?.id || '';
          const status = item?.status || item?.state?.status || '';
          return { name, status };
        })
        .filter((item) => item.name);
    }
  } catch {
    // Fallback to line-delimited JSON output
  }

  const rows: Array<{ name: string; status: string }> = [];
  for (const line of trimmed.split('\n')) {
    const row = line.trim();
    if (!row) continue;
    try {
      const parsed = JSON.parse(row);
      const name =
        parsed?.configuration?.id || parsed?.name || parsed?.id || '';
      const status = parsed?.status || parsed?.state?.status || '';
      if (name) rows.push({ name, status });
    } catch {
      // ignore malformed lines
    }
  }
  return rows;
}

function ensureAppleContainerSystemRunning(): void {
  try {
    execSync('container system status', { stdio: 'pipe' });
    logger.debug('Apple Container system already running');
  } catch {
    logger.info('Starting Apple Container system...');
    execSync('container system start', { stdio: 'pipe', timeout: 30000 });
    logger.info('Apple Container system started');
  }
}

function cleanupOrphanAppleContainers(prefix = 'babybot-'): void {
  try {
    const output = execSync('container ls --format json', {
      stdio: ['pipe', 'pipe', 'pipe'],
      encoding: 'utf-8',
    });

    const containers = parseContainerListJson(output);
    const orphanNames = containers
      .filter((c) => c.name.startsWith(prefix) && c.status === 'running')
      .map((c) => c.name);

    for (const name of orphanNames) {
      try {
        execSync(`container stop ${name}`, { stdio: 'pipe', timeout: 15000 });
      } catch {
        // best effort stop
      }
    }

    if (orphanNames.length > 0) {
      logger.info(
        { count: orphanNames.length, names: orphanNames },
        'Stopped orphaned Apple Container instances',
      );
    }
  } catch (error) {
    logger.warn(
      { error },
      'Failed to clean up orphan Apple Container instances',
    );
  }
}

/**
 * Ensure the selected runtime is ready before processing messages.
 */
export function ensureContainerRuntimeReady(runtime?: ContainerRuntime): void {
  const selectedRuntime = runtime || detectContainerRuntime();

  if (selectedRuntime !== ContainerRuntime.APPLE_CONTAINER) {
    return;
  }

  ensureAppleContainerSystemRunning();
  cleanupOrphanAppleContainers();
}
