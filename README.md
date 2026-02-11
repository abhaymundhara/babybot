# BabyBot 🤖

[![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-blue)](https://ollama.ai/)

Your personal AI assistant with pluggable LLM providers (Ollama by default, OpenRouter optional). Lightweight, secure, and easy to self-host.

## Why BabyBot?

Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw), BabyBot brings you the same core functionality with flexible provider choice. This means:

- ✅ **Local by Default** - Use Ollama for on-device inference
- ✅ **Provider Flexibility** - Switch to OpenRouter when you need cloud models
- ✅ **Model Freedom** - Use Ollama models or OpenRouter-hosted models
- ✅ **Cost Control** - Run free/local with Ollama, or pay-per-use via OpenRouter
- ✅ **Simple Architecture** - One process, easy to understand codebase

## Features

- 🔐 **WhatsApp Integration** - Message your assistant from your phone
- 🧠 **Provider Selection** - Use Ollama (local) or OpenRouter (cloud) via config
- 📦 **Container Runtime Support** - Auto-detect Apple Container/Docker with direct fallback
- 👥 **Isolated Group Context** - Each group has its own memory and context
- ⏰ **Scheduled Tasks** - Recurring jobs that run automatically
- 🧩 **Agent Skill Calls** - Skills are synced NanoClaw-style and `/<skill-name>` is routed to the agent (use `/list-skills` to discover)
- 🛠️ **Host Admin Commands** - Manage groups and tasks directly from chat (`/list-groups`, `/register-group`, `/list-tasks`, etc.)
- 🔁 **Long-lived Container Sessions** - Active group containers keep context and accept follow-up IPC messages before idle close
- 🌐 **Browser Automation Runtime** - `agent-browser` + Chromium support in container runtime (`agent_browser` tool)
- 🎯 **Trigger-based Responses** - Control when the bot responds with `@Baby`
- 📝 **Persistent Memory** - Each group maintains `CLAUDE.md` memory (with `MEMORY.md` legacy fallback)
- 🔄 **Session Management** - Conversations maintain context across messages
- 🗂️ **Conversation Archival Hooks** - Auto-archives older chat history into `groups/<group>/archives`
- 📜 **Task Run History** - Scheduler writes per-run task logs (status, duration, result/error)
- 🤝 **Agent Swarms (Experimental)** - Multi-agent task orchestration and delegation

## Requirements

- **Node.js 20+**
- **Ollama** - [Install Ollama](https://ollama.ai/download)
- **WhatsApp Account** - For messaging integration

## Quick Start

### 1. Install Ollama

```bash
# macOS/Linux
curl -fsSL https://ollama.ai/install.sh | sh

# Or visit https://ollama.ai/download for other options
```

### 2. Pull an AI Model

```bash
# Pull Llama 2 (recommended for general use)
ollama pull llama2

# Or try other models:
# ollama pull mistral
# ollama pull codellama
```

### 3. Install BabyBot

```bash
git clone https://github.com/abhaymundhara/babybot-.git
cd babybot-
npm install
```

### 4. Configure Environment

```bash
cp .env.example .env
# Edit .env to set your preferences (model, assistant name, etc.)
```

### 5. Authenticate WhatsApp

```bash
npm run auth
# Scan the QR code with WhatsApp on your phone
```

### 6. Start BabyBot

```bash
npm start
```

## Usage

### Basic Interaction

Send a message to any WhatsApp group or chat with the trigger word:

```
@Baby what's the weather like today?
@Baby remind me to call mom at 5pm
@Baby summarize the last 10 messages in this chat
```

### Host Commands

From your configured main chat (`MAIN_CHAT_JID`), you can manage groups/tasks:

```text
/list-groups
/register-group <jid> <folder> [--no-trigger]
/remove-group <jid>
/list-tasks all
/schedule-task <cron|interval|once>|<value>|<prompt>|[targetJid]
/update-task <id>|<cron|interval|once>|<value>|<prompt>
/pause-task <id>
/resume-task <id>
/cancel-task <id>
```

### Configuration

Edit `.env` to customize:

```bash
# Assistant name (trigger word will be @YourName)
ASSISTANT_NAME=Baby

# Main/admin chat JID
MAIN_CHAT_JID=15551234567@s.whatsapp.net

# Strict NanoClaw-style group registration (recommended)
AUTO_REGISTER_NEW_CHATS=false

# Conversation archive controls
CONVERSATION_ARCHIVE_TRIGGER=200
CONVERSATION_ARCHIVE_KEEP_RECENT=80

# LLM provider (ollama or openrouter)
LLM_PROVIDER=ollama

# Ollama configuration (used when LLM_PROVIDER=ollama)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# OpenRouter configuration (used when LLM_PROVIDER=openrouter)
OPENROUTER_API_KEY=sk-or-...
OPENROUTER_MODEL=openai/gpt-4o-mini

# Logging
LOG_LEVEL=info
```

### Available Models

BabyBot works with any Ollama model. Some popular choices:

| Model         | Size | Best For                        |
| ------------- | ---- | ------------------------------- |
| `llama2`      | 7B   | General conversation            |
| `mistral`     | 7B   | Fast, accurate responses        |
| `codellama`   | 7B   | Code-related tasks              |
| `llama2:13b`  | 13B  | More capable responses (slower) |
| `neural-chat` | 7B   | Conversational AI               |

Change models anytime:

```bash
# In .env
OLLAMA_MODEL=mistral

# Then restart BabyBot
```

## Architecture

```
WhatsApp → SQLite → Message Loop → Ollama → Response
```

**Key Components:**

- `src/index.ts` - Main orchestrator
- `src/channels/whatsapp.ts` - WhatsApp connection
- `src/ollama-runner.ts` - Ollama integration (replaces Anthropic Agent SDK)
- `src/db.ts` - SQLite database
- `src/router.ts` - Message formatting
- `src/group-queue.ts` - Concurrent message processing
- `src/task-scheduler.ts` - Scheduled tasks

## Development

```bash
# Run in development mode with auto-reload
npm run dev

# Type checking
npm run typecheck

# Format code
npm run format

# Build for production
npm run build
```

## Differences from NanoClaw

| Feature           | NanoClaw                 | BabyBot                       |
| ----------------- | ------------------------ | ----------------------------- |
| AI Backend        | Anthropic Claude (cloud) | Ollama (local) or OpenRouter  |
| Container Runtime | Apple Container/Docker   | Apple Container/Docker/Direct |
| Agent Swarms      | ✅ Yes                   | ✅ Experimental               |
| Cost              | Pay-per-token            | Free                          |
| Privacy           | Data sent to Anthropic   | 100% local                    |
| Setup             | Complex container setup  | Simple npm install            |

## Roadmap

- [x] Docker/Apple Container support for sandboxed execution
- [x] Agent swarms foundation for collaborative tasks
- [x] NanoClaw-style agent skill invocation with `/list-skills` discovery
- [ ] Web interface for management
- [ ] Telegram channel runtime integration
- [ ] Discord channel runtime integration
- [ ] More advanced scheduling options
- [ ] Persistent conversation state across restarts

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw)
- Powered by [Ollama](https://ollama.ai/)
- Built with [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp
