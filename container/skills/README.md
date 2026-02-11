# Skills System

BabyBot supports a skills system where you can teach the assistant how to modify itself and add new capabilities.

## How Skills Work

Skills are stored in `container/skills/` and synced to each group's context. When you run a skill command (e.g., `/add-telegram`), the assistant reads the skill instructions and applies the changes to the codebase.

## Creating Skills

Each skill is a directory containing a `SKILL.md` file:

```
container/skills/
├── add-telegram/
│   └── SKILL.md
├── add-discord/
│   └── SKILL.md
└── setup-apple-container/
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
- `/add-discord` - Add Discord bot integration
- `/add-slack` - Add Slack bot integration

### Platform Support
- `/setup-apple-container` - Configure Apple Container runtime
- `/convert-to-docker` - Switch to Docker runtime
- `/setup-windows` - Setup on Windows with WSL2

### Session Management
- `/add-clear` - Add conversation compaction
- `/enhance-memory` - Improve memory management

## Using Skills

1. **List available skills**: Send `/list-skills` to the assistant
2. **Apply a skill**: Send `/skill-name` (e.g., `/add-telegram`)
3. **Follow instructions**: The assistant will guide you through the process
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
