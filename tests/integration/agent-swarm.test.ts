/**
 * Integration Tests for Agent Swarms
 */

import { AgentSwarm, AgentRole, TaskPriority } from '../../src/agent-swarm';
import { logger } from '../../src/logger';

// Test configuration
const TEST_GROUP_FOLDER = 'test-group';
const TEST_TIMEOUT = 10000;

export async function runAgentSwarmTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   Agent Swarm Integration Tests            ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const tests = [
    testSwarmCreation,
    testAgentRegistration,
    testTaskSubmission,
    testTaskPriority,
    testLoadBalancing,
    testSwarmStats,
    testGracefulShutdown,
  ];

  let passed = 0;
  let failed = 0;

  for (const test of tests) {
    try {
      await test();
      passed++;
      console.log(`✅ ${test.name}`);
    } catch (error) {
      failed++;
      console.log(`❌ ${test.name}`);
      console.error(`   Error: ${error.message}`);
    }
  }

  console.log(`\n${'='.repeat(44)}`);
  console.log(`Results: ${passed}/${tests.length} passed, ${failed}/${tests.length} failed`);
  console.log('='.repeat(44) + '\n');

  if (failed > 0) {
    throw new Error(`${failed} test(s) failed`);
  }
}

async function testSwarmCreation(): Promise<void> {
  const swarm = new AgentSwarm(5);
  const stats = swarm.getStats();

  if (stats.totalAgents !== 0) {
    throw new Error('New swarm should have 0 agents');
  }

  if (stats.pendingTasks !== 0) {
    throw new Error('New swarm should have 0 pending tasks');
  }
}

async function testAgentRegistration(): Promise<void> {
  const swarm = new AgentSwarm(5);

  swarm.registerAgent('agent-1', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('agent-2', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('agent-3', AgentRole.SPECIALIST, TEST_GROUP_FOLDER);

  const stats = swarm.getStats();

  if (stats.totalAgents !== 3) {
    throw new Error(`Expected 3 agents, got ${stats.totalAgents}`);
  }

  if (stats.idleAgents !== 3) {
    throw new Error(`Expected 3 idle agents, got ${stats.idleAgents}`);
  }

  // Test deregistration
  swarm.deregisterAgent('agent-2');
  const statsAfter = swarm.getStats();

  if (statsAfter.totalAgents !== 2) {
    throw new Error(`Expected 2 agents after deregistration, got ${statsAfter.totalAgents}`);
  }
}

async function testTaskSubmission(): Promise<void> {
  // Note: This test requires ENABLE_AGENT_SWARMS=true in environment
  // For testing purposes, we'll catch the error if swarms are disabled
  
  const swarm = new AgentSwarm(5);

  try {
    const taskId = swarm.submitTask('Test task', TaskPriority.NORMAL);

    if (!taskId || typeof taskId !== 'string') {
      throw new Error('Task ID should be a string');
    }

    if (!taskId.startsWith('task-')) {
      throw new Error('Task ID should start with "task-"');
    }

    const task = swarm.getTaskStatus(taskId);

    if (!task) {
      throw new Error('Task should exist after submission');
    }

    if (task.status !== 'pending') {
      throw new Error(`Task status should be 'pending', got '${task.status}'`);
    }

    if (task.description !== 'Test task') {
      throw new Error(`Task description mismatch`);
    }

    if (task.priority !== TaskPriority.NORMAL) {
      throw new Error(`Task priority mismatch`);
    }
  } catch (error) {
    if (error.message.includes('disabled')) {
      // Swarms are disabled, which is acceptable for testing
      console.log('   (Skipped - swarms disabled)');
      return;
    }
    throw error;
  }
}

async function testTaskPriority(): Promise<void> {
  const swarm = new AgentSwarm(5);

  try {
    // Submit tasks with different priorities
    const lowId = swarm.submitTask('Low priority', TaskPriority.LOW);
    const normalId = swarm.submitTask('Normal priority', TaskPriority.NORMAL);
    const highId = swarm.submitTask('High priority', TaskPriority.HIGH);
    const criticalId = swarm.submitTask('Critical priority', TaskPriority.CRITICAL);

    const stats = swarm.getStats();

    if (stats.pendingTasks !== 4) {
      throw new Error(`Expected 4 pending tasks, got ${stats.pendingTasks}`);
    }

    // Note: Actual priority ordering validation would require exposing the internal queue
    // For now, we verify that all tasks were submitted successfully
  } catch (error) {
    if (error.message.includes('disabled')) {
      console.log('   (Skipped - swarms disabled)');
      return;
    }
    throw error;
  }
}

async function testLoadBalancing(): Promise<void> {
  const swarm = new AgentSwarm(5);

  swarm.registerAgent('worker-1', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('worker-2', AgentRole.WORKER, TEST_GROUP_FOLDER);

  const agent = swarm.getLoadBalancedAgent();

  if (!agent) {
    throw new Error('Should return a load-balanced agent');
  }

  if (agent.status !== 'idle') {
    throw new Error(`Agent should be idle, got '${agent.status}'`);
  }

  if (agent.role !== AgentRole.WORKER) {
    throw new Error(`Agent should be a worker, got '${agent.role}'`);
  }
}

async function testSwarmStats(): Promise<void> {
  const swarm = new AgentSwarm(10);

  swarm.registerAgent('agent-1', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('agent-2', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('agent-3', AgentRole.SPECIALIST, TEST_GROUP_FOLDER);

  const stats = swarm.getStats();

  // Verify all stats fields are present and valid
  if (typeof stats.totalAgents !== 'number') {
    throw new Error('totalAgents should be a number');
  }

  if (typeof stats.idleAgents !== 'number') {
    throw new Error('idleAgents should be a number');
  }

  if (typeof stats.busyAgents !== 'number') {
    throw new Error('busyAgents should be a number');
  }

  if (typeof stats.pendingTasks !== 'number') {
    throw new Error('pendingTasks should be a number');
  }

  if (typeof stats.completedTasks !== 'number') {
    throw new Error('completedTasks should be a number');
  }

  if (typeof stats.failedTasks !== 'number') {
    throw new Error('failedTasks should be a number');
  }

  // Verify totals
  if (stats.totalAgents !== stats.idleAgents + stats.busyAgents) {
    throw new Error('Total agents should equal idle + busy agents');
  }
}

async function testGracefulShutdown(): Promise<void> {
  const swarm = new AgentSwarm(5);

  swarm.registerAgent('agent-1', AgentRole.WORKER, TEST_GROUP_FOLDER);
  swarm.registerAgent('agent-2', AgentRole.WORKER, TEST_GROUP_FOLDER);

  await swarm.shutdown();

  const stats = swarm.getStats();

  if (stats.totalAgents !== 0) {
    throw new Error(`All agents should be deregistered after shutdown, got ${stats.totalAgents}`);
  }
}

// Run tests if this file is executed directly
if (require.main === module) {
  runAgentSwarmTests()
    .then(() => {
      console.log('✅ All agent swarm tests passed!\n');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Agent swarm tests failed:', error.message);
      process.exit(1);
    });
}
