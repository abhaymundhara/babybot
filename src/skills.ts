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

/**
 * Sync skills to a group's context
 */
export function syncSkillsToGroup(groupFolder: string): void {
  if (!fs.existsSync(SKILLS_SOURCE_DIR)) {
    logger.warn({ source: SKILLS_SOURCE_DIR }, 'Skills source directory not found');
    return;
  }

  const groupDir = path.join(GROUPS_DIR, groupFolder);
  const skillsDestDir = path.join(groupDir, '.skills');

  // Create skills directory
  fs.mkdirSync(skillsDestDir, { recursive: true });

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
    const destPath = path.join(skillsDestDir, skillDir);

    // Create destination directory
    fs.mkdirSync(destPath, { recursive: true });

    // Copy SKILL.md file
    const skillFile = path.join(sourcePath, 'SKILL.md');
    if (fs.existsSync(skillFile)) {
      const destFile = path.join(destPath, 'SKILL.md');
      fs.copyFileSync(skillFile, destFile);
    }

    // Copy any other files
    const files = fs.readdirSync(sourcePath);
    for (const file of files) {
      if (file === 'SKILL.md') continue; // Already copied
      
      const srcFile = path.join(sourcePath, file);
      const dstFile = path.join(destPath, file);
      
      if (fs.statSync(srcFile).isFile()) {
        fs.copyFileSync(srcFile, dstFile);
      }
    }
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
  logger.info({ groupCount: groupFolders.length }, 'Syncing skills to all groups');
  
  for (const groupFolder of groupFolders) {
    try {
      syncSkillsToGroup(groupFolder);
    } catch (error) {
      logger.error(
        { groupFolder, error },
        'Failed to sync skills to group',
      );
    }
  }
}
