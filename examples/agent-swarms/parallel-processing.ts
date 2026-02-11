/**
 * Example: Parallel Processing with Agent Swarms
 * 
 * This example demonstrates how to process multiple items
 * in parallel using agent swarms.
 */

import { AgentSwarm, AgentRole, TaskPriority } from '../../src/agent-swarm';

async function parallelProcessing() {
  console.log('=== Parallel Processing Example ===\n');
  
  // Create a swarm with 5 agents
  const swarm = new AgentSwarm(5);
  
  // Register worker agents
  for (let i = 1; i <= 3; i++) {
    swarm.registerAgent(`worker-${i}`, AgentRole.WORKER, 'main');
    console.log(`✅ Registered worker-${i}`);
  }
  
  console.log('\n📋 Processing 10 items in parallel...\n');
  
  // Items to process
  const items = Array.from({ length: 10 }, (_, i) => `Item ${i + 1}`);
  
  // Submit all items as tasks
  const taskIds = items.map(item =>
    swarm.submitTask(`Process ${item}`, TaskPriority.NORMAL)
  );
  
  console.log(`📤 Submitted ${taskIds.length} tasks\n`);
  
  // Wait for all tasks to complete
  const results = await Promise.all(
    taskIds.map(async (taskId, index) => {
      try {
        const task = await swarm.waitForTask(taskId, 60000);
        console.log(`✅ ${items[index]} completed`);
        return task.result;
      } catch (error) {
        console.error(`❌ ${items[index]} failed:`, error.message);
        return null;
      }
    })
  );
  
  // Show statistics
  const stats = swarm.getStats();
  console.log('\n📊 Swarm Statistics:');
  console.log(`   Total Agents: ${stats.totalAgents}`);
  console.log(`   Completed Tasks: ${stats.completedTasks}`);
  console.log(`   Failed Tasks: ${stats.failedTasks}`);
  
  // Shutdown swarm
  await swarm.shutdown();
  console.log('\n✅ Swarm shutdown complete\n');
  
  return results.filter(r => r !== null);
}

// Run if executed directly
if (require.main === module) {
  // Set environment for testing
  process.env.ENABLE_AGENT_SWARMS = 'true';
  process.env.CONTAINER_RUNTIME = 'none'; // Use direct execution for demo
  
  parallelProcessing()
    .then(results => {
      console.log('Results:', results.length, 'items processed successfully');
    })
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

export { parallelProcessing };
