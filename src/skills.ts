/**
 * Skills System
 *
 * Loads and syncs skills from container/skills/ to group contexts.
 */

import fs from 'fs';
import path from 'path';
import { GROUPS_DIR } from './config.js';
import { logger } from './logger.js';

const SKILLS_SOURCE_DIR = path.join(process.cwd(), 'container', 'skills');
const CLAUDE_SKILLS_RELATIVE_DIR = path.join('.claude', 'skills');
const LEGACY_SKILLS_RELATIVE_DIR = '.skills';

function copyDirectoryRecursive(
  sourceDir: string,
  destinationDir: string,
): void {
  fs.mkdirSync(destinationDir, { recursive: true });

  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const destinationPath = path.join(destinationDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectoryRecursive(sourcePath, destinationPath);
      continue;
    }

    if (entry.isFile()) {
      fs.copyFileSync(sourcePath, destinationPath);
    }
  }
}

/**
 * Sync skills to a group's context
 */
export function syncSkillsToGroup(groupFolder: string): void {
  if (!fs.existsSync(SKILLS_SOURCE_DIR)) {
    logger.warn(
      { source: SKILLS_SOURCE_DIR },
      'Skills source directory not found',
    );
    return;
  }

  const groupDir = path.join(GROUPS_DIR, groupFolder);
  const claudeSkillsDestDir = path.join(groupDir, CLAUDE_SKILLS_RELATIVE_DIR);
  const legacySkillsDestDir = path.join(groupDir, LEGACY_SKILLS_RELATIVE_DIR);

  // NanoClaw-compatible skills path
  fs.mkdirSync(claudeSkillsDestDir, { recursive: true });
  // Backward-compatible mirror path for existing setups
  fs.mkdirSync(legacySkillsDestDir, { recursive: true });

  // Read all skills
  const skillDirs = fs.readdirSync(SKILLS_SOURCE_DIR).filter((name) => {
    const skillPath = path.join(SKILLS_SOURCE_DIR, name);
    return fs.statSync(skillPath).isDirectory() && name !== '.claude';
  });

  logger.debug(
    { groupFolder, skillCount: skillDirs.length },
    'Syncing skills to group',
  );

  // Copy each skill
  for (const skillDir of skillDirs) {
    const sourcePath = path.join(SKILLS_SOURCE_DIR, skillDir);
    const claudeDestination = path.join(claudeSkillsDestDir, skillDir);
    const legacyDestination = path.join(legacySkillsDestDir, skillDir);
    copyDirectoryRecursive(sourcePath, claudeDestination);
    copyDirectoryRecursive(sourcePath, legacyDestination);
  }

  logger.info(
    { groupFolder, skillCount: skillDirs.length },
    'Skills synced to group',
  );
}

/**
 * List available skills
 */
export function listSkills(): string[] {
  if (!fs.existsSync(SKILLS_SOURCE_DIR)) {
    return [];
  }

  return fs.readdirSync(SKILLS_SOURCE_DIR).filter((name) => {
    const skillPath = path.join(SKILLS_SOURCE_DIR, name);
    return (
      fs.statSync(skillPath).isDirectory() &&
      name !== '.claude' &&
      fs.existsSync(path.join(skillPath, 'SKILL.md'))
    );
  });
}

/**
 * Get skill content
 */
export function getSkillContent(skillName: string): string | null {
  const skillPath = path.join(SKILLS_SOURCE_DIR, skillName, 'SKILL.md');

  if (!fs.existsSync(skillPath)) {
    return null;
  }

  return fs.readFileSync(skillPath, 'utf-8');
}

/**
 * Sync skills to all registered groups
 */
export function syncSkillsToAllGroups(groupFolders: string[]): void {
  logger.info(
    { groupCount: groupFolders.length },
    'Syncing skills to all groups',
  );

  for (const groupFolder of groupFolders) {
    try {
      syncSkillsToGroup(groupFolder);
    } catch (error) {
      logger.error({ groupFolder, error }, 'Failed to sync skills to group');
    }
  }
}
