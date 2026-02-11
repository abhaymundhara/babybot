/**
 * Skills System Integration Tests
 */

import fs from 'fs';
import path from 'path';
import { assert } from '../test-utils.js';
import {
  listSkills,
  getSkillContent,
  syncSkillsToGroup,
} from '../../src/skills.js';

async function testListSkills(): Promise<void> {
  console.log('Testing list skills...');

  const skills = listSkills();

  assert(Array.isArray(skills), 'Skills should be an array');
  assert(skills.length > 0, 'Should have at least one skill');
  assert(skills.includes('example-skill'), 'Should include example-skill');

  console.log(`✅ Found ${skills.length} skills: ${skills.join(', ')}`);
}

async function testGetSkillContent(): Promise<void> {
  console.log('Testing get skill content...');

  const content = getSkillContent('example-skill');

  assert(content !== null, 'Should get skill content');
  assert(content!.includes('Skill'), 'Content should include skill header');
  assert(content!.length > 100, 'Content should be substantial');

  console.log('✅ Skill content retrieval works');
}

async function testSkillFilesExist(): Promise<void> {
  console.log('Testing skill files exist...');

  const skillsDir = path.join(process.cwd(), 'container', 'skills');
  assert(fs.existsSync(skillsDir), 'Skills directory should exist');

  const skills = listSkills();
  for (const skill of skills) {
    const skillFile = path.join(skillsDir, skill, 'SKILL.md');
    assert(fs.existsSync(skillFile), `${skill}/SKILL.md should exist`);
  }

  console.log('✅ All skill files exist');
}

async function testSkillsSyncedToClaudePath(): Promise<void> {
  console.log('Testing skills sync path...');

  const tempGroupFolder = `test-skills-${Date.now()}`;
  const groupDir = path.join(process.cwd(), 'groups', tempGroupFolder);
  const claudeSkillsDir = path.join(groupDir, '.claude', 'skills');
  const legacySkillsDir = path.join(groupDir, '.skills');

  syncSkillsToGroup(tempGroupFolder);

  assert(fs.existsSync(claudeSkillsDir), '.claude/skills should exist');
  assert(fs.existsSync(legacySkillsDir), '.skills legacy mirror should exist');
  assert(
    fs.existsSync(path.join(claudeSkillsDir, 'example-skill', 'SKILL.md')),
    'example-skill should sync into .claude/skills',
  );

  fs.rmSync(groupDir, { recursive: true, force: true });

  console.log('✅ Skills sync path works');
}

async function runSkillsTests(): Promise<void> {
  console.log('\n=== Skills System Integration Tests ===\n');

  try {
    await testListSkills();
    await testGetSkillContent();
    await testSkillFilesExist();
    await testSkillsSyncedToClaudePath();

    console.log('\n✅ All skills tests passed!\n');
  } catch (error) {
    console.error('\n❌ Skills tests failed:', error);
    throw error;
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runSkillsTests().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

export { runSkillsTests };
