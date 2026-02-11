# BabyBot 🤖

[![Ollama](https://img.shields.io/badge/Powered%20by-Ollama-blue)](https://ollama.ai/)

Your personal AI assistant powered by Ollama. Lightweight, secure, and runs completely locally with your own LLM models.

## Why BabyBot?

Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw), BabyBot brings you the same core functionality but with **complete local control** using Ollama models instead of cloud-based APIs. This means:

- ✅ **100% Local** - All AI processing happens on your machine
- ✅ **Privacy First** - Your data never leaves your device
- ✅ **Model Freedom** - Use any Ollama model (Llama 2, Mistral, CodeLlama, etc.)
- ✅ **Cost-Free** - No API costs, runs entirely offline
- ✅ **Simple Architecture** - One process, easy to understand codebase

## Features

- 🔐 **WhatsApp Integration** - Message your assistant from your phone
- 👥 **Isolated Group Context** - Each group has its own memory and context
- ⏰ **Scheduled Tasks** - Recurring jobs that run automatically
- 🎯 **Trigger-based Responses** - Control when the bot responds with `@Baby`
- 📝 **Persistent Memory** - Each group maintains its own MEMORY.md file
- 🔄 **Session Management** - Conversations maintain context across messages

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

### Configuration

Edit `.env` to customize:

```bash
# Assistant name (trigger word will be @YourName)
ASSISTANT_NAME=Baby

# Ollama configuration
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Logging
LOG_LEVEL=info
```

### Available Models

BabyBot works with any Ollama model. Some popular choices:

| Model | Size | Best For |
|-------|------|----------|
| `llama2` | 7B | General conversation |
| `mistral` | 7B | Fast, accurate responses |
| `codellama` | 7B | Code-related tasks |
| `llama2:13b` | 13B | More capable responses (slower) |
| `neural-chat` | 7B | Conversational AI |

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

| Feature | NanoClaw | BabyBot |
|---------|----------|---------|
| AI Backend | Anthropic Claude (cloud) | Ollama (local) |
| Container Runtime | Apple Container/Docker | Simplified (no containers by default) |
| Agent Swarms | ✅ Yes | ⚠️ Planned |
| Cost | Pay-per-token | Free |
| Privacy | Data sent to Anthropic | 100% local |
| Setup | Complex container setup | Simple npm install |

## Roadmap

- [ ] Docker container support for sandboxed execution
- [ ] Agent swarms for collaborative tasks
- [ ] Web interface for management
- [ ] Telegram integration
- [ ] Discord integration
- [ ] More advanced scheduling options

## Contributing

Contributions welcome! Please feel free to submit a Pull Request.

## License

MIT

## Acknowledgments

- Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw)
- Powered by [Ollama](https://ollama.ai/)
- Built with [Baileys](https://github.com/WhiskeySockets/Baileys) for WhatsApp