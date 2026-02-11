/**
 * Container Runtime Integration Tests
 */

import {
  setupTestEnv,
  cleanupTestEnv,
  assert,
  assertEqual,
  isDockerAvailable,
  isAppleContainerAvailable,
} from '../test-utils.js';
import {
  detectContainerRuntime,
  ContainerRuntime,
} from '../../src/container-runtime.js';

async function testContainerRuntimeDetection(): Promise<void> {
  console.log('Testing container runtime detection...');
  
  const runtime = detectContainerRuntime();
  
  assert(
    runtime === ContainerRuntime.APPLE_CONTAINER ||
    runtime === ContainerRuntime.DOCKER ||
    runtime === ContainerRuntime.NONE,
    `Runtime should be one of the valid types, got: ${runtime}`
  );
  
  console.log(`✅ Container runtime detected: ${runtime}`);
}

async function testForcedRuntime(): Promise<void> {
  console.log('Testing forced runtime selection...');
  
  const originalRuntime = process.env.CONTAINER_RUNTIME;
  
  try {
    process.env.CONTAINER_RUNTIME = 'none';
    const runtime1 = detectContainerRuntime();
    assertEqual(runtime1, ContainerRuntime.NONE, 'Should force to NONE');
    
    console.log('✅ Forced runtime selection works');
  } finally {
    if (originalRuntime) {
      process.env.CONTAINER_RUNTIME = originalRuntime;
    } else {
      delete process.env.CONTAINER_RUNTIME;
    }
  }
}

async function runContainerTests(): Promise<void> {
  console.log('\n=== Container Runtime Integration Tests ===\n');
  
  try {
    await testContainerRuntimeDetection();
    await testForcedRuntime();
    
    console.log('\n✅ All container runtime tests passed!\n');
  } catch (error) {
    console.error('\n❌ Container runtime tests failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runContainerTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runContainerTests };
