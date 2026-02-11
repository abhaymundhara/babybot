# Setup Guide

## Prerequisites

1. **Node.js 20+**
   ```bash
   node --version  # Should be 20.x or higher
   ```

2. **Ollama**
   ```bash
   # Install Ollama
   curl -fsSL https://ollama.ai/install.sh | sh
   
   # Pull a model (choose one)
   ollama pull llama2        # Recommended for general use (3.8GB)
   ollama pull mistral       # Fast and accurate (4.1GB)
   ollama pull codellama     # For code-related tasks (3.8GB)
   
   # Verify Ollama is running
   ollama list
   ```

3. **WhatsApp Account**
   - You need a WhatsApp account to use as the bot
   - This will run on a separate WhatsApp account from your main one
   - You can use WhatsApp Web on the same account

## Installation Steps

### 1. Clone and Install

```bash
git clone https://github.com/abhaymundhara/babybot-.git
cd babybot-
npm install
```

### 2. Configure

```bash
cp .env.example .env
```

Edit `.env` and set your preferences:
```bash
# Change the assistant name (optional)
ASSISTANT_NAME=Baby

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2  # or mistral, codellama, etc.

# Log level (optional)
LOG_LEVEL=info
```

### 3. Authenticate WhatsApp

```bash
npm run auth
```

This will display a QR code in your terminal. Scan it with WhatsApp on your phone:
1. Open WhatsApp on your phone
2. Go to Settings → Linked Devices
3. Click "Link a Device"
4. Scan the QR code displayed in your terminal

Once authenticated, you'll see a success message and can close this process.

### 4. Start BabyBot

```bash
npm start
```

Or for development with auto-reload:
```bash
npm run dev
```

## First Steps

### Test the Bot

1. Send a message to yourself or in a group: `@Baby hello`
2. The bot should respond!

### Register a Group

By default, only the "main" group (your self-chat) is registered. To use the bot in other groups:

1. Add the bot's WhatsApp number to a group
2. Messages in groups require the trigger word `@Baby` (or whatever you set as ASSISTANT_NAME)
3. The bot will automatically register the group when it receives a triggered message

### System Prompts and Memory

Each group gets its own `MEMORY.md` file in `groups/<group-folder>/MEMORY.md`. You can edit this file to:
- Add context about the group
- Set preferences for how the bot should respond
- Store important information

Example `MEMORY.md`:
```markdown
# Family Chat Memory

This is a family group chat. Members:
- Dad (John)
- Mom (Sarah)
- Kids (Emma, Noah)

Preferences:
- Keep responses friendly and casual
- Remember birthdays and anniversaries
- Help with family scheduling

Important Dates:
- Dad's birthday: June 15
- Mom's birthday: March 22
```

## Troubleshooting

### Ollama Connection Issues

If you see errors about connecting to Ollama:

```bash
# Check if Ollama is running
ollama list

# If not running, start it
ollama serve
```

### WhatsApp Disconnects

If WhatsApp keeps disconnecting:
1. Delete the `auth_info_baileys` folder
2. Run `npm run auth` again
3. Make sure you're not using the same WhatsApp account elsewhere

### Bot Not Responding

1. Check logs for errors
2. Verify the trigger word is correct (default: `@Baby`)
3. Make sure Ollama is running and the model is pulled
4. Check that the group is registered (messages should appear in logs)

### Out of Memory

If you see memory errors:
1. Use a smaller model (e.g., `llama2` instead of `llama2:13b`)
2. Reduce `MAX_CONCURRENT_CONTAINERS` in `.env`
3. Clear old session data from `data/sessions/`

## Advanced Configuration

### Change Models

You can switch models at any time:

```bash
# Pull a new model
ollama pull mistral

# Update .env
OLLAMA_MODEL=mistral

# Restart BabyBot
```

### Multiple Concurrent Conversations

Edit `.env`:
```bash
MAX_CONCURRENT_CONTAINERS=10
```

This allows up to 10 groups to be processed simultaneously.

### Scheduled Tasks

(Coming soon - feature is implemented but needs UI/commands to create tasks)

## Development

### Project Structure

```
babybot-/
├── src/
│   ├── channels/
│   │   └── whatsapp.ts      # WhatsApp integration
│   ├── config.ts             # Configuration
│   ├── db.ts                 # SQLite database
│   ├── group-queue.ts        # Message queue
│   ├── index.ts              # Main orchestrator
│   ├── ipc.ts                # Inter-process communication
│   ├── logger.ts             # Logging
│   ├── ollama-runner.ts      # Ollama integration
│   ├── router.ts             # Message routing
│   ├── task-scheduler.ts     # Scheduled tasks
│   └── types.ts              # TypeScript types
├── data/                     # Runtime data (git-ignored)
│   ├── babybot.db           # SQLite database
│   └── sessions/            # Chat sessions
├── groups/                   # Group folders (git-ignored)
│   └── main/
│       └── MEMORY.md        # Main group memory
└── auth_info_baileys/       # WhatsApp auth (git-ignored)
```

### Build

```bash
npm run build
```

### Type Check

```bash
npm run typecheck
```

### Format Code

```bash
npm run format
```

## What's Next?

- Add more groups and customize their MEMORY.md files
- Experiment with different Ollama models
- Check out the roadmap in README.md for upcoming features
