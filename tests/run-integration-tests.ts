/**
 * Integration Test Runner
 */

import { runContainerTests } from './integration/container-runtime.test.js';
import { runSkillsTests } from './integration/skills.test.js';
import { runRuntimeStrategyTests } from './integration/runtime-strategy.test.js';
import { runSkillCommandTests } from './integration/skill-commands.test.js';
import { runMountSecurityTests } from './integration/mount-security.test.js';
import { runLlmProviderTests } from './integration/llm-provider.test.js';
import { runAgentSwarmTests } from './integration/agent-swarm.test.js';
import { runMemoryContextTests } from './integration/memory-context.test.js';
import { runConversationContextTests } from './integration/conversation-context.test.js';
import { runIpcTests } from './integration/ipc.test.js';
import { runMissingParityTests } from './integration/missing-parity.test.js';
import { runAgentRunnerToolTests } from './integration/agent-runner-tools.test.js';
import { runGroupQueueQueryLoopTests } from './integration/group-queue-query-loop.test.js';
import { runMcpStdioTests } from './integration/mcp-stdio.test.js';

async function runAllTests(): Promise<void> {
  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║   BabyBot Integration Test Suite          ║');
  console.log('╚════════════════════════════════════════════╝\n');

  const startTime = Date.now();
  let passed = 0;
  let failed = 0;

  const tests = [
    { name: 'Container Runtime', fn: runContainerTests },
    { name: 'Skills System', fn: runSkillsTests },
    { name: 'Runtime Strategy', fn: runRuntimeStrategyTests },
    { name: 'LLM Provider', fn: runLlmProviderTests },
    { name: 'Skill Commands', fn: runSkillCommandTests },
    { name: 'Mount Security', fn: runMountSecurityTests },
    { name: 'Memory Context', fn: runMemoryContextTests },
    { name: 'Conversation Context', fn: runConversationContextTests },
    { name: 'IPC', fn: runIpcTests },
    { name: 'Missing Parity', fn: runMissingParityTests },
    { name: 'Agent Runner Tool Bridge', fn: runAgentRunnerToolTests },
    { name: 'MCP Stdio Parity', fn: runMcpStdioTests },
    { name: 'Group Queue Query Loop', fn: runGroupQueueQueryLoopTests },
    { name: 'Agent Swarms', fn: runAgentSwarmTests },
  ];

  for (const test of tests) {
    try {
      await test.fn();
      passed++;
    } catch (error) {
      failed++;
      console.error(`\n❌ ${test.name} tests failed\n`);
    }
  }

  const duration = ((Date.now() - startTime) / 1000).toFixed(2);

  console.log('\n╔════════════════════════════════════════════╗');
  console.log('║          Test Results Summary              ║');
  console.log('╚════════════════════════════════════════════╝\n');
  console.log(`  Passed: ${passed}/${tests.length}`);
  console.log(`  Failed: ${failed}/${tests.length}`);
  console.log(`  Duration: ${duration}s\n`);

  if (failed > 0) {
    console.log('❌ Some tests failed\n');
    process.exit(1);
  } else {
    console.log('✅ All tests passed!\n');
    process.exit(0);
  }
}

runAllTests().catch((error) => {
  console.error('Fatal error running tests:', error);
  process.exit(1);
});
