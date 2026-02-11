# BabyBot - Project Summary

> Status note (2026-02-11): this summary is partially historical. For the current implementation state, rely on `README.md` and `npm test` output.

## Overview

BabyBot is a personal AI assistant powered by Ollama, inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw). It provides the same core functionality but uses local LLM models instead of cloud-based APIs, ensuring complete privacy and zero API costs.

## Key Features

### ✅ Implemented

1. **WhatsApp Integration**
   - Full WhatsApp support via Baileys library
   - QR code authentication
   - Group and private chat support
   - Auto-reconnection on disconnect

2. **Ollama AI Integration**
   - Local LLM processing (replaces Anthropic Agent SDK)
   - Support for any Ollama model (Llama 2, Mistral, CodeLlama, etc.)
   - Session management with conversation history
   - Configurable system prompts per group

3. **Group Management**
   - Isolated context per group
   - Individual MEMORY.md files for each group
   - Trigger-based responses (@Baby)
   - Main admin group with special privileges

4. **Message Processing**
   - SQLite database for message persistence
   - Concurrent processing with queue system
   - Configurable concurrency limits
   - Message formatting and routing

5. **Task Scheduler**
   - Cron-based recurring tasks
   - One-time scheduled tasks
   - Task status management
   - Per-group task isolation

6. **Infrastructure**
   - TypeScript codebase with full type safety
   - Docker support for containerized deployment
   - Container runtime detection (Apple Container / Docker / None)
   - Comprehensive logging with Pino
   - IPC system for inter-process communication
   - Agent swarm orchestration module

### 🚧 Planned Features

1. **Advanced Scheduling**
   - UI/commands to create/manage tasks
   - Task templates
   - Conditional task execution

2. **Additional Channels**
   - Telegram integration
   - Discord integration
   - Slack integration

3. **Web Interface**
   - Management dashboard
   - Configuration UI
   - Chat history viewer

## Architecture Comparison

### NanoClaw (Original)
```
WhatsApp → SQLite → Polling → Apple Container/Docker → Claude Agent SDK → Response
```

### BabyBot (Our Implementation)
```
WhatsApp → SQLite → Polling → Ollama (Local) → Response
```

**Key Differences:**
- **AI Backend**: Anthropic Claude (cloud) → Ollama (local)
- **Container Runtime**: Complex Apple Container/Docker setup → Simplified (optional Docker)
- **Privacy**: Data sent to Anthropic → 100% local processing
- **Cost**: Pay-per-token → Free
- **Setup Complexity**: High → Low

## Technical Stack

- **Runtime**: Node.js 20+
- **Language**: TypeScript 5.7
- **Database**: SQLite (better-sqlite3)
- **WhatsApp**: Baileys 7.0
- **AI**: Ollama (local LLM)
- **Logging**: Pino
- **Scheduling**: cron-parser
- **Container**: Docker (optional)

## Project Structure

```
babybot-/
├── src/
│   ├── channels/
│   │   └── whatsapp.ts          # WhatsApp integration
│   ├── config.ts                 # Configuration
│   ├── db.ts                     # SQLite database layer
│   ├── group-queue.ts            # Message queue system
│   ├── index.ts                  # Main orchestrator
│   ├── ipc.ts                    # Inter-process communication
│   ├── logger.ts                 # Logging setup
│   ├── ollama-runner.ts          # Ollama AI integration
│   ├── router.ts                 # Message routing
│   ├── task-scheduler.ts         # Scheduled tasks
│   ├── types.ts                  # TypeScript types
│   └── whatsapp-auth.ts          # WhatsApp authentication
├── groups/
│   └── main/
│       └── MEMORY.md             # Main group memory
├── data/                         # Runtime data (git-ignored)
├── Dockerfile                    # Docker image
├── docker-compose.yml            # Docker orchestration
├── SETUP.md                      # Setup guide
├── DOCKER.md                     # Docker guide
├── README.md                     # Main documentation
└── LICENSE                       # MIT License
```

## Security

- ✅ All dependencies scanned for vulnerabilities
- ✅ CodeQL security analysis passed (0 alerts)
- ✅ No sensitive data in repository
- ✅ Local-only AI processing (privacy-first)
- ✅ Isolated group contexts
- ✅ Session management with memory limits

## Performance Considerations

1. **Message Processing**
   - Concurrent processing with configurable limits
   - Queue-based system prevents overload
   - Per-group isolation

2. **Memory Management**
   - Session history limited to 20 messages
   - Automatic session pruning
   - SQLite for efficient storage

3. **AI Performance**
   - Depends on Ollama model size
   - Recommended: 7B models for balance
   - 13B models for better quality (slower)

## Deployment Options

### Local Development
```bash
npm install
npm run dev
```

### Production (Node.js)
```bash
npm install
npm run build
npm start
```

### Docker
```bash
docker-compose up -d
```

## Configuration

Key environment variables:
- `ASSISTANT_NAME`: Bot trigger name (default: Baby)
- `OLLAMA_BASE_URL`: Ollama API URL (default: http://localhost:11434)
- `OLLAMA_MODEL`: Model to use (default: llama2)
- `LOG_LEVEL`: Logging verbosity (default: info)
- `MAX_CONCURRENT_CONTAINERS`: Concurrent message processing limit (default: 5)

## Testing Status

- ✅ TypeScript compilation successful
- ✅ Code review completed
- ✅ Security scan passed
- ⚠️ Runtime testing requires:
  - Ollama installed and running
  - WhatsApp account for authentication
  - Manual QA with real messages

## Known Limitations

1. **No Container Sandboxing** (yet)
   - Unlike NanoClaw, we don't run agents in isolated containers
   - All processing happens in the main Node.js process
   - This is simpler but less secure for untrusted code execution

2. **In-Memory Sessions**
   - Sessions stored in memory, not persisted to disk
   - Sessions lost on restart
   - Future: Add session persistence

3. **Limited Model Support**
   - Currently only supports Ollama models
   - No support for OpenAI, Anthropic, etc. (by design)

4. **Basic Scheduling**
   - No UI for task management
   - Tasks must be added directly to database
   - Future: Add task management commands

## Future Enhancements

1. **Short Term**
   - Add task management commands
   - Implement session persistence
   - Add health check endpoint
   - Create simple web UI

2. **Medium Term**
   - Multi-model support (multiple Ollama models)
   - Agent swarms implementation
   - Additional messaging platforms
   - Better error recovery

3. **Long Term**
   - Container sandboxing for secure execution
   - Plugin system for extensions
   - Cloud deployment guides
   - Mobile app for management

## Contributing

This project welcomes contributions! Priority areas:
- Additional messaging channel integrations
- Task management UI/commands
- Session persistence
- Documentation improvements
- Bug fixes and optimizations

## License

MIT License - see LICENSE file

## Acknowledgments

- Inspired by [NanoClaw](https://github.com/qwibitai/nanoclaw)
- Powered by [Ollama](https://ollama.ai/)
- Built with [Baileys](https://github.com/WhiskeySockets/Baileys)

---

Last Updated: 2024-02-11
Version: 1.0.0
