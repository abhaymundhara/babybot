/**
 * Skill Command Tests
 */

import { assert, assertEqual } from '../test-utils.js';
import {
  extractSkillInvocations,
  formatSkillsListMessage,
  parseHostSkillCommand,
} from '../../src/skill-commands.js';

async function testParseListSkillsCommand(): Promise<void> {
  const parsed = parseHostSkillCommand('/list-skills');
  assert(parsed !== null, 'Expected /list-skills to parse as host command');
  assertEqual(parsed?.type, 'list-skills', 'Expected list-skills host command');
}

async function testIgnoreSkillSlashCommandAtHostLevel(): Promise<void> {
  const parsed = parseHostSkillCommand('/add-telegram');
  assertEqual(parsed, null, 'Expected /add-telegram to bypass host parser');
}

async function testExtractSkillInvocations(): Promise<void> {
  const available = ['add-telegram', 'setup', 'add-gmail'];
  const skills = extractSkillInvocations(
    '@Baby please run /add-telegram and then /setup',
    available,
  );

  assertEqual(skills.length, 2, 'Expected two extracted skills');
  assert(
    skills.includes('add-telegram'),
    'Expected add-telegram to be extracted',
  );
  assert(skills.includes('setup'), 'Expected setup to be extracted');
}

async function testIgnoreUnknownSkillInvocations(): Promise<void> {
  const available = ['add-telegram', 'setup'];
  const skills = extractSkillInvocations('/not-a-real-skill /setup', available);
  assertEqual(skills.length, 1, 'Expected only known skills to be extracted');
  assertEqual(skills[0], 'setup', 'Expected setup to be extracted');
}

async function testFormatSkillsListMessage(): Promise<void> {
  const msg = formatSkillsListMessage(['setup', 'add-telegram']);
  assert(
    msg.includes('/add-telegram'),
    'Should include slash-prefixed skill command',
  );
  assert(msg.includes('/setup'), 'Should include slash-prefixed skill command');
  assert(
    msg.includes('apply that skill context'),
    'Should describe agent-driven behavior',
  );
}

async function runSkillCommandTests(): Promise<void> {
  console.log('\n=== Skill Command Tests ===\n');

  await testParseListSkillsCommand();
  await testIgnoreSkillSlashCommandAtHostLevel();
  await testExtractSkillInvocations();
  await testIgnoreUnknownSkillInvocations();
  await testFormatSkillsListMessage();

  console.log('✅ Skill command tests passed');
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSkillCommandTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runSkillCommandTests };
