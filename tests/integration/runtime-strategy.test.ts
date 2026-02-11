/**
 * Runtime Strategy Tests
 */

import { assertEqual } from '../test-utils.js';
import { ContainerRuntime } from '../../src/container-runtime.js';
import { getRuntimeStrategy } from '../../src/runtime-strategy.js';

async function testAutoWithContainer(): Promise<void> {
  const strategy = getRuntimeStrategy('auto', ContainerRuntime.DOCKER);
  assertEqual(strategy.useContainer, true, 'auto + docker should use container');
  assertEqual(strategy.allowFallbackToDirect, true, 'auto should allow direct fallback');
}

async function testAutoWithoutContainer(): Promise<void> {
  const strategy = getRuntimeStrategy('auto', ContainerRuntime.NONE);
  assertEqual(strategy.useContainer, false, 'auto + none should use direct execution');
  assertEqual(strategy.allowFallbackToDirect, false, 'direct path does not need fallback');
}

async function testForcedDocker(): Promise<void> {
  const strategy = getRuntimeStrategy('docker', ContainerRuntime.DOCKER);
  assertEqual(strategy.useContainer, true, 'forced docker should use container');
  assertEqual(strategy.allowFallbackToDirect, false, 'forced runtime should not fallback automatically');
}

async function testForcedNone(): Promise<void> {
  const strategy = getRuntimeStrategy('none', ContainerRuntime.DOCKER);
  assertEqual(strategy.useContainer, false, 'none should force direct execution');
  assertEqual(strategy.allowFallbackToDirect, false, 'none should not fallback');
}

export async function runRuntimeStrategyTests(): Promise<void> {
  console.log('\n=== Runtime Strategy Tests ===\n');

  await testAutoWithContainer();
  await testAutoWithoutContainer();
  await testForcedDocker();
  await testForcedNone();

  console.log('✅ Runtime strategy tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runRuntimeStrategyTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
