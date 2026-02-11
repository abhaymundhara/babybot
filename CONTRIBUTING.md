# Contributing to BabyBot

Thank you for your interest in contributing to BabyBot! This document provides guidelines and instructions for contributing.

## Code of Conduct

- Be respectful and inclusive
- Focus on constructive feedback
- Help create a welcoming environment for all contributors

## How to Contribute

### Reporting Bugs

1. Check if the bug has already been reported in Issues
2. If not, create a new issue with:
   - Clear title and description
   - Steps to reproduce
   - Expected vs actual behavior
   - Your environment (OS, Node version, Ollama version)
   - Relevant logs or error messages

### Suggesting Features

1. Check existing issues and discussions
2. Create a new issue with:
   - Clear description of the feature
   - Use case and benefits
   - Possible implementation approach
   - Any relevant examples from other projects

### Pull Requests

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Test your changes thoroughly
5. Commit with clear messages (`git commit -m 'Add amazing feature'`)
6. Push to your fork (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## Development Setup

### Prerequisites

```bash
# Install Node.js 20+
node --version

# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull a test model
ollama pull llama2
```

### Local Setup

```bash
# Clone your fork
git clone https://github.com/YOUR_USERNAME/babybot-.git
cd babybot-

# Install dependencies
npm install

# Run type checking
npm run typecheck

# Run in development mode
npm run dev
```

## Coding Standards

### TypeScript

- Use TypeScript for all new code
- Enable strict type checking
- Add types for all public APIs
- Use meaningful variable and function names

### Code Style

- Follow existing code style
- Run Prettier before committing: `npm run format`
- Keep functions small and focused
- Add comments for complex logic

### Commits

- Use clear, descriptive commit messages
- Follow conventional commits format:
  - `feat: add new feature`
  - `fix: resolve bug`
  - `docs: update documentation`
  - `refactor: improve code structure`
  - `test: add tests`
  - `chore: update dependencies`

## Testing

### Manual Testing

1. Test with a real WhatsApp account
2. Verify all features work as expected
3. Test error scenarios
4. Check logs for errors or warnings

### Before Submitting

- [ ] Code compiles without errors (`npm run typecheck`)
- [ ] Code is formatted (`npm run format`)
- [ ] All features work as expected
- [ ] No new security vulnerabilities
- [ ] Documentation updated if needed
- [ ] Commit messages are clear

## Project Structure

```
src/
├── channels/        # Messaging platform integrations
├── config.ts        # Configuration management
├── db.ts           # Database layer
├── ollama-runner.ts # AI integration
├── index.ts        # Main orchestrator
└── ...
```

## Architecture Principles

1. **Keep it Simple**: BabyBot is meant to be easily understandable
2. **Local First**: All AI processing should happen locally via Ollama
3. **Privacy Focused**: No data should be sent to external services
4. **Minimal Dependencies**: Add dependencies only when necessary
5. **Type Safe**: Use TypeScript's type system effectively

## Priority Contribution Areas

### High Priority

1. **Task Management Commands**
   - Add commands to create/manage scheduled tasks
   - Implement task listing and deletion
   - Add task status updates

2. **Session Persistence**
   - Save sessions to disk
   - Load sessions on startup
   - Clean up old sessions

3. **Additional Platforms**
   - Telegram integration
   - Discord integration
   - Slack integration

### Medium Priority

1. **Web UI**
   - Simple dashboard for monitoring
   - Task management interface
   - Configuration editor

2. **Agent Swarms**
   - Multi-agent collaboration
   - Specialized sub-agents
   - Task delegation

3. **Better Error Handling**
   - Graceful degradation
   - Automatic recovery
   - Better error messages

### Nice to Have

1. **Documentation**
   - Video tutorials
   - More examples
   - Troubleshooting guides

2. **Testing**
   - Unit tests
   - Integration tests
   - E2E tests

3. **Performance**
   - Optimize database queries
   - Reduce memory usage
   - Faster message processing

## Getting Help

- Open an issue for questions
- Check existing documentation
- Review closed issues and PRs

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

## Recognition

All contributors will be recognized in the project documentation and release notes.

---

Thank you for contributing to BabyBot! 🤖
