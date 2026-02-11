/**
 * Mount Security Tests
 */

import fs from 'fs';
import os from 'os';
import path from 'path';
import { assert, assertEqual } from '../test-utils.js';
import {
  getDefaultAllowlist,
  loadMountAllowlist,
  isPathAllowed,
} from '../../src/mount-security.js';

async function testDefaultAllowlist(): Promise<void> {
  const defaults = getDefaultAllowlist('/repo', '/repo/groups');
  assertEqual(defaults.length, 2, 'Default allowlist should include project and groups paths');
  assert(defaults.includes('/repo'), 'Should include project root');
  assert(defaults.includes('/repo/groups'), 'Should include groups directory');
}

async function testLoadAllowlistFromFile(): Promise<void> {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'babybot-allowlist-'));
  const allowlistPath = path.join(tempDir, 'allowlist.json');

  fs.writeFileSync(allowlistPath, JSON.stringify({ paths: ['/safe/path', '/safe/path2'] }));

  const loaded = loadMountAllowlist(allowlistPath, ['/fallback']);
  assertEqual(loaded.length, 2, 'Should load entries from file');
  assert(loaded.includes('/safe/path'), 'Should include configured path');
}

async function testFallbackAllowlistWhenMissing(): Promise<void> {
  const loaded = loadMountAllowlist('/does/not/exist.json', ['/fallback']);
  assertEqual(loaded.length, 1, 'Missing file should fallback to defaults');
  assertEqual(loaded[0], '/fallback', 'Fallback path should be returned');
}

async function testPathAllowed(): Promise<void> {
  const allowlist = ['/repo', '/repo/groups'];
  assert(isPathAllowed('/repo/src', allowlist), 'Child path should be allowed');
  assert(isPathAllowed('/repo/groups/main', allowlist), 'Group path should be allowed');
  assert(!isPathAllowed('/etc/passwd', allowlist), 'Outside path should be blocked');
}

export async function runMountSecurityTests(): Promise<void> {
  console.log('\n=== Mount Security Tests ===\n');

  await testDefaultAllowlist();
  await testLoadAllowlistFromFile();
  await testFallbackAllowlistWhenMissing();
  await testPathAllowed();

  console.log('✅ Mount security tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMountSecurityTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

