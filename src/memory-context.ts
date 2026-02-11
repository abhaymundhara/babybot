import fs from 'fs';
import path from 'path';

const LEGACY_MEMORY_FILE = 'MEMORY.md';
const CLAUDE_MEMORY_FILE = 'CLAUDE.md';
const GLOBAL_GROUP_FOLDER = 'global';

function readFileIfExists(filePath: string): string {
  if (!fs.existsSync(filePath)) return '';
  return fs.readFileSync(filePath, 'utf-8').trim();
}

function readPreferredMemory(groupDir: string): string {
  const claudeMemory = readFileIfExists(
    path.join(groupDir, CLAUDE_MEMORY_FILE),
  );
  if (claudeMemory) return claudeMemory;
  return readFileIfExists(path.join(groupDir, LEGACY_MEMORY_FILE));
}

export function buildDefaultGroupClaudeMemory(
  assistantName: string,
  groupName: string,
): string {
  return `# ${assistantName}

You are ${assistantName}, a personal assistant helping in "${groupName}".

## Communication

- Keep responses concise and useful.
- Ask clarifying questions when intent is ambiguous.
- Use WhatsApp-friendly formatting:
  - *single asterisks* for bold
  - _underscores_ for italics
  - • bullet points
  - \`\`\`triple backticks\`\`\` for code

## Memory

- Use this file to keep group-specific context and preferences.
- Store stable preferences, recurring tasks, and important facts.
- Keep entries short and up to date.
`;
}

export function buildDefaultGlobalClaudeMemory(assistantName: string): string {
  return `# ${assistantName}

This is global memory shared across all groups.

## Purpose

- Store cross-group preferences and durable user facts.
- Keep this file concise and factual.
- Group-specific details should stay in each group's CLAUDE.md.

## Global Guidelines

- Prefer clear, actionable responses.
- Be explicit about assumptions.
- Avoid repeating unchanged memory back to the user.
`;
}

export function ensureGlobalMemoryFiles(
  groupsDir: string,
  assistantName: string,
): void {
  const globalDir = path.join(groupsDir, GLOBAL_GROUP_FOLDER);
  fs.mkdirSync(globalDir, { recursive: true });

  const globalClaudeFile = path.join(globalDir, CLAUDE_MEMORY_FILE);
  if (!fs.existsSync(globalClaudeFile)) {
    fs.writeFileSync(
      globalClaudeFile,
      buildDefaultGlobalClaudeMemory(assistantName),
    );
  }
}

export function ensureGroupMemoryFiles(
  groupDir: string,
  assistantName: string,
  groupName: string,
): void {
  fs.mkdirSync(groupDir, { recursive: true });

  const claudeFile = path.join(groupDir, CLAUDE_MEMORY_FILE);
  if (!fs.existsSync(claudeFile)) {
    fs.writeFileSync(
      claudeFile,
      buildDefaultGroupClaudeMemory(assistantName, groupName),
    );
  }

  const legacyMemoryFile = path.join(groupDir, LEGACY_MEMORY_FILE);
  if (!fs.existsSync(legacyMemoryFile)) {
    fs.writeFileSync(
      legacyMemoryFile,
      `# ${groupName} Memory\n\nThis file stores context and memory for the ${groupName} group.\n`,
    );
  }
}

export function loadMemoryContext(
  groupsDir: string,
  groupFolder: string,
): string {
  const globalDir = path.join(groupsDir, GLOBAL_GROUP_FOLDER);
  const groupDir = path.join(groupsDir, groupFolder);

  const globalMemory = readPreferredMemory(globalDir);
  const groupMemory = readPreferredMemory(groupDir);

  const sections: string[] = [];
  if (globalMemory) {
    sections.push(`Global Memory:\n${globalMemory}`);
  }
  if (groupMemory) {
    sections.push(`Group Memory:\n${groupMemory}`);
  }

  return sections.join('\n\n');
}
