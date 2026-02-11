# Skills System

BabyBot supports a skills system where you can teach the assistant how to modify itself and add new capabilities.

## How Skills Work

Skills are stored in `container/skills/` and synced to each group's context at `groups/<group>/.claude/skills` (with legacy mirror at `.skills`). When you use a skill command (e.g., `/add-telegram`), the message is routed through the agent and the matching skill context is attached.

## Creating Skills

Each skill is a directory containing a `SKILL.md` file:

```
container/skills/
├── add-clear/
│   └── SKILL.md
├── add-discord/
│   └── SKILL.md
├── add-gmail/
│   └── SKILL.md
├── add-memory/
│   └── SKILL.md
├── add-parallel/
│   └── SKILL.md
├── add-slack/
│   └── SKILL.md
├── add-telegram/
│   └── SKILL.md
├── add-telegram-swarm/
│   └── SKILL.md
├── add-voice-transcription/
│   └── SKILL.md
├── agent-browser/
│   └── SKILL.md
├── convert-to-docker/
│   └── SKILL.md
├── customize/
│   └── SKILL.md
├── debug/
│   └── SKILL.md
├── example-skill/
│   └── SKILL.md
├── setup/
│   └── SKILL.md
├── setup-apple-container/
│   └── SKILL.md
├── setup-windows/
│   └── SKILL.md
└── x-integration/
    └── SKILL.md
```

## Skill Format

A skill file should contain:

1. **Description**: What the skill does
2. **Prerequisites**: Requirements before running
3. **Instructions**: Step-by-step guide for implementation
4. **Files to Create/Modify**: Specific code changes
5. **Testing**: How to verify the skill was applied correctly

## Example Skill

See `container/skills/example-skill/SKILL.md` for a template.

## Available Skills

### Communication Channels

- `/add-telegram` - Add Telegram bot integration
- `/add-telegram-swarm` - Add Telegram swarm workflow
- `/add-discord` - Add Discord bot integration
- `/add-slack` - Add Slack bot integration
- `/add-gmail` - Add Gmail integration
- `/x-integration` - Add X/Twitter integration

### Platform Support

- `/setup` - Project setup/bootstrap skill
- `/setup-apple-container` - Configure Apple Container runtime
- `/convert-to-docker` - Switch to Docker runtime
- `/setup-windows` - Setup on Windows with WSL2
- `/agent-browser` - Browser automation helper skill

### Session Management

- `/add-clear` - Add conversation compaction
- `/add-memory` - Improve memory management

### Productivity & Development

- `/add-parallel` - Parallel execution workflow
- `/add-voice-transcription` - Voice transcription flow
- `/customize` - Customize behavior/configuration
- `/debug` - Debug workflow guidance

## Using Skills

1. **List available skills**: Send `/list-skills` to the assistant
2. **Invoke a skill**: Send `/skill-name` (e.g., `/add-telegram`)
3. **Agent execution**: The agent receives the matching `SKILL.md` context
4. **Verify**: Test the new functionality

## Contributing Skills

To contribute a new skill:

1. Create a directory in `container/skills/your-skill-name/`
2. Write a `SKILL.md` file with clear instructions
3. Test the skill on a fresh installation
4. Submit a pull request

Skills should:

- Be self-contained and focused
- Include prerequisite checks
- Provide clear error messages
- Be reversible if possible
- Include testing steps
