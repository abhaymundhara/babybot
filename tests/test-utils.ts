/**
 * Test Utilities
 */

import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const TEST_DIR = path.join(process.cwd(), 'tests', '.test-data');

export function setupTestEnv(): string {
  const testId = `test-${Date.now()}-${Math.random().toString(36).substring(7)}`;
  const testDataDir = path.join(TEST_DIR, testId);
  
  fs.mkdirSync(testDataDir, { recursive: true });
  fs.mkdirSync(path.join(testDataDir, 'groups'), { recursive: true });
  fs.mkdirSync(path.join(testDataDir, 'data'), { recursive: true });
  
  return testDataDir;
}

export function cleanupTestEnv(testDataDir: string): void {
  if (fs.existsSync(testDataDir)) {
    fs.rmSync(testDataDir, { recursive: true, force: true });
  }
}

export function createMockGroup(testDataDir: string, groupName: string): string {
  const groupDir = path.join(testDataDir, 'groups', groupName);
  fs.mkdirSync(groupDir, { recursive: true });
  
  fs.writeFileSync(
    path.join(groupDir, 'MEMORY.md'),
    `# ${groupName} Memory\n\nTest memory file\n`
  );
  
  return groupDir;
}

export async function waitFor(
  condition: () => boolean | Promise<boolean>,
  timeout = 5000,
  interval = 100
): Promise<void> {
  const startTime = Date.now();
  
  while (Date.now() - startTime < timeout) {
    if (await condition()) {
      return;
    }
    await new Promise(resolve => setTimeout(resolve, interval));
  }
  
  throw new Error(`Timeout waiting for condition after ${timeout}ms`);
}

export function isDockerAvailable(): boolean {
  try {
    execSync('docker ps', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function isAppleContainerAvailable(): boolean {
  try {
    execSync('container --version', { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

export function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

export function assertEqual<T>(actual: T, expected: T, message?: string): void {
  if (actual !== expected) {
    const msg = message || `Expected ${expected}, got ${actual}`;
    throw new Error(`Assertion failed: ${msg}`);
  }
}
