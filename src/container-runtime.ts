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
    if (forcedRuntime === 'apple-container' || forcedRuntime === 'docker' || forcedRuntime === 'none') {
      logger.info({ runtime: forcedRuntime }, 'Using forced container runtime from environment');
      return forcedRuntime as ContainerRuntime;
    }
    logger.warn({ forcedRuntime }, 'Invalid CONTAINER_RUNTIME value, auto-detecting');
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
    maxOutputSize: parseInt(process.env.CONTAINER_MAX_OUTPUT_SIZE || '10485760', 10),
  };
}
