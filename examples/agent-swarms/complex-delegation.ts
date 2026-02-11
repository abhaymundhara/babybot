/**
 * Example: Complex Task Delegation with Agent Swarms
 * 
 * This example demonstrates how to break down a complex task
 * into subtasks and delegate them to multiple agents.
 */

import { getGlobalSwarm, shutdownGlobalSwarm } from '../../src/agent-swarm';

async function complexDelegation() {
  console.log('=== Complex Task Delegation Example ===\n');
  
  const swarm = getGlobalSwarm();
  
  console.log('📋 Building a complete web application...\n');
  
  // Define the complex task and its subtasks
  const mainTask = 'Build a complete e-commerce web application';
  const subtasks = [
    'Create React frontend with product catalog',
    'Build Node.js backend API with authentication',
    'Setup PostgreSQL database schema',
    'Implement payment processing with Stripe',
    'Write comprehensive unit tests',
    'Create deployment configuration for AWS',
  ];
  
  console.log(`Main Task: ${mainTask}`);
  console.log(`Subtasks: ${subtasks.length}\n`);
  
  subtasks.forEach((task, i) => {
    console.log(`  ${i + 1}. ${task}`);
  });
  
  console.log('\n🚀 Delegating to agents...\n');
  
  try {
    // Delegate the complex task
    const results = await swarm.delegateTask(mainTask, subtasks, 'main');
    
    console.log('\n✅ All subtasks completed!\n');
    
    // Display results
    results.forEach((result, i) => {
      console.log(`Subtask ${i + 1} result:`);
      console.log(`  ${result ? result.substring(0, 100) + '...' : 'No result'}\n`);
    });
    
    // Show statistics
    const stats = swarm.getStats();
    console.log('📊 Swarm Statistics:');
    console.log(`   Completed Tasks: ${stats.completedTasks}`);
    console.log(`   Failed Tasks: ${stats.failedTasks}`);
    
  } catch (error) {
    console.error('\n❌ Delegation failed:', error.message);
    throw error;
  } finally {
    await shutdownGlobalSwarm();
    console.log('\n✅ Swarm shutdown complete\n');
  }
}

// Run if executed directly
if (require.main === module) {
  // Set environment for testing
  process.env.ENABLE_AGENT_SWARMS = 'true';
  process.env.CONTAINER_RUNTIME = 'none'; // Use direct execution for demo
  
  complexDelegation()
    .catch(error => {
      console.error('Error:', error.message);
      process.exit(1);
    });
}

export { complexDelegation };
