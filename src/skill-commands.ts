export type HostSkillCommand = { type: 'list-skills' };

/**
 * Host-side command parser.
 * NanoClaw-style behavior: host handles discovery only; skill execution is agent-driven.
 */
export function parseHostSkillCommand(text: string): HostSkillCommand | null {
  const trimmed = text.trim();
  if (!trimmed.startsWith('/')) {
    return null;
  }

  const command = trimmed.slice(1).toLowerCase();
  if (command === 'list-skills') {
    return { type: 'list-skills' };
  }

  return null;
}

/**
 * Extract explicit skill invocations from user text.
 * Example: "/add-telegram" -> ["add-telegram"] if that skill exists.
 */
export function extractSkillInvocations(
  text: string,
  availableSkills: string[],
): string[] {
  if (!text.includes('/')) return [];

  const availableSet = new Set(availableSkills.map((s) => s.toLowerCase()));
  const found = new Set<string>();

  const matches = text.matchAll(/\/([a-z0-9][a-z0-9-_]*)/gi);
  for (const match of matches) {
    const skillName = (match[1] || '').toLowerCase();
    if (!skillName || skillName === 'list-skills') continue;
    if (availableSet.has(skillName)) {
      found.add(skillName);
    }
  }

  return Array.from(found);
}

export function formatSkillsListMessage(skills: string[]): string {
  if (skills.length === 0) {
    return 'No skills are currently available.';
  }

  const commands = skills
    .sort((a, b) => a.localeCompare(b))
    .map((name) => `/${name}`)
    .join('\n');

  return `Available skills:\n${commands}\n\nUse /<skill-name> in your message and the agent will apply that skill context.`;
}
