/**
 * Memory Context Tests
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import {
  ensureGlobalMemoryFiles,
  ensureGroupMemoryFiles,
  loadMemoryContext,
} from '../../src/memory-context.js';

async function testEnsureMemoryFiles(): Promise<void> {
  const root = process.cwd();
  const groupFolder = `memory-test-${Date.now()}`;
  const groupDir = path.join(root, 'groups', groupFolder);
  const globalDir = path.join(root, 'groups', 'global');

  ensureGlobalMemoryFiles(path.join(root, 'groups'), 'Baby');
  ensureGroupMemoryFiles(groupDir, 'Baby', 'Memory Test');

  assert(
    fs.existsSync(path.join(globalDir, 'CLAUDE.md')),
    'Expected global CLAUDE.md to exist',
  );
  assert(
    fs.existsSync(path.join(groupDir, 'CLAUDE.md')),
    'Expected group CLAUDE.md to exist',
  );
  assert(
    fs.existsSync(path.join(groupDir, 'MEMORY.md')),
    'Expected legacy MEMORY.md to exist',
  );

  fs.rmSync(groupDir, { recursive: true, force: true });
}

async function testLoadMemoryContextPrefersClaude(): Promise<void> {
  const root = process.cwd();
  const groupsDir = path.join(root, 'groups');
  const groupFolder = `memory-test-pref-${Date.now()}`;
  const groupDir = path.join(groupsDir, groupFolder);
  const globalDir = path.join(groupsDir, 'global');

  fs.mkdirSync(groupDir, { recursive: true });
  fs.mkdirSync(globalDir, { recursive: true });

  fs.writeFileSync(path.join(groupDir, 'CLAUDE.md'), '# Group Claude');
  fs.writeFileSync(path.join(groupDir, 'MEMORY.md'), '# Group Legacy');
  fs.writeFileSync(path.join(globalDir, 'CLAUDE.md'), '# Global Claude');

  const context = loadMemoryContext(groupsDir, groupFolder);
  assert(
    context.includes('# Global Claude'),
    'Expected global CLAUDE in context',
  );
  assert(
    context.includes('# Group Claude'),
    'Expected group CLAUDE in context',
  );
  assert(
    !context.includes('# Group Legacy'),
    'Expected legacy memory not to be used when CLAUDE exists',
  );

  fs.rmSync(groupDir, { recursive: true, force: true });
}

async function runMemoryContextTests(): Promise<void> {
  console.log('\n=== Memory Context Tests ===\n');
  await testEnsureMemoryFiles();
  await testLoadMemoryContextPrefersClaude();
  console.log('✅ Memory context tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runMemoryContextTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runMemoryContextTests };
