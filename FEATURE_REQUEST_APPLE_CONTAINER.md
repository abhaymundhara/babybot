# Feature Request: Apple Container Support & NanoClaw Architecture Parity

## Overview

Implement full architectural parity with NanoClaw, including Apple Container/Docker sandboxing and the skills system, while maintaining Ollama as the AI backend.

## Current State

BabyBot currently:
- ✅ Uses Ollama instead of Anthropic Agent SDK
- ✅ WhatsApp integration with Baileys
- ✅ SQLite message persistence
- ✅ Group-based message processing
- ✅ Task scheduling
- ❌ Missing: Container-based sandboxing
- ❌ Missing: Skills system
- ❌ Missing: Advanced IPC architecture

## Proposed Changes

### 1. Container Runtime Support

Implement sandboxed execution for AI agents similar to NanoClaw's approach:

#### 1.1 Container Detection & Runtime
```typescript
// src/container-runtime.ts
export enum ContainerRuntime {
  APPLE_CONTAINER = 'apple-container',
  DOCKER = 'docker',
  NONE = 'none'
}

export function detectContainerRuntime(): ContainerRuntime {
  // Check for Apple Container on macOS
  // Check for Docker
  // Fall back to direct execution
}
```

#### 1.2 Agent Container Runner
Recreate `container-runner.ts` from NanoClaw with Ollama integration:

- **Apple Container support** (macOS)
  - Use `container` CLI command
  - Volume mounting for group folders
  - Session isolation per group
  
- **Docker support** (macOS/Linux)
  - Dockerfile for agent runtime
  - Volume mounting strategy
  - Network configuration for Ollama access

- **Direct execution fallback** (current behavior)
  - For systems without container runtime
  - Development mode

#### 1.3 Container Image
Create container image with:
- Node.js runtime
- Ollama client
- Group filesystem access
- IPC communication layer

**Dockerfile for agent container:**
```dockerfile
FROM node:20-alpine

WORKDIR /workspace

# Install Ollama client
RUN npm install -g ollama

# Copy agent runner
COPY container/agent-runner /app

# Entry point
CMD ["node", "/app/index.js"]
```

### 2. Skills System

Implement NanoClaw's skills architecture:

#### 2.1 Skill Structure
```
.claude/skills/
├── add-telegram/
│   └── SKILL.md
├── add-discord/
│   └── SKILL.md
├── setup-apple-container/
│   └── SKILL.md
└── convert-to-docker/
    └── SKILL.md
```

#### 2.2 Skill Loading
- Sync skills from `container/skills/` to each group's `.claude/skills/`
- Skills teach the agent how to modify the codebase
- Users run `/skill-name` commands

#### 2.3 Priority Skills to Create

**Communication Channels:**
- `/add-telegram` - Telegram integration
- `/add-discord` - Discord integration
- `/add-slack` - Slack integration

**Platform Support:**
- `/setup-apple-container` - Configure Apple Container runtime
- `/convert-to-docker` - Switch to Docker runtime
- `/setup-windows` - WSL2 + Docker for Windows

**Session Management:**
- `/add-clear` - Conversation compaction command
- `/add-memory` - Enhanced memory management

### 3. Enhanced IPC System

Upgrade IPC to match NanoClaw's capabilities:

#### 3.1 IPC Message Types
```typescript
interface IPCMessage {
  type: 'task' | 'command' | 'response' | 'error';
  groupFolder: string;
  payload: any;
  timestamp: string;
}
```

#### 3.2 IPC Watcher Improvements
- Real-time file watching (not polling)
- Message acknowledgment
- Error recovery
- Timeout handling

### 4. Group Memory Enhancement

Align with NanoClaw's memory system:

#### 4.1 CLAUDE.md → MEMORY.md
Already done, but enhance:
- Auto-memory features
- Memory compaction
- Cross-group memory sharing (read-only)

#### 4.2 Global Memory
```
groups/
├── global/
│   └── MEMORY.md (read-only for non-main groups)
├── main/
│   └── MEMORY.md
└── [other-groups]/
    └── MEMORY.md
```

### 5. Volume Mounting Strategy

Implement NanoClaw's security-conscious mounting:

#### 5.1 Per-Group Isolation
- Each group gets isolated filesystem
- Main group gets full project access
- Other groups get their folder only

#### 5.2 Mount Allowlist
```typescript
// Outside project root, tamper-proof
const MOUNT_ALLOWLIST_PATH = path.join(
  HOME_DIR,
  '.config',
  'babybot',
  'mount-allowlist.json'
);
```

#### 5.3 Security Boundaries
- Groups cannot access other groups' folders
- Read-only mounts for shared resources
- Validate all mount paths

### 6. Agent Swarms (Future)

Prepare for multi-agent collaboration:

#### 6.1 Agent Orchestration
- Main agent spawns sub-agents
- Task delegation
- Result aggregation

#### 6.2 Environment Variables
```bash
OLLAMA_EXPERIMENTAL_AGENT_TEAMS=1
OLLAMA_ADDITIONAL_DIRECTORIES_MEMORY=1
OLLAMA_DISABLE_AUTO_MEMORY=0
```

### 7. Session Management

Enhance session handling:

#### 7.1 Per-Group Sessions
- Isolated `.ollama/` directories per group
- Session persistence
- Settings per group

#### 7.2 Session Configuration
```json
{
  "env": {
    "OLLAMA_EXPERIMENTAL_AGENT_TEAMS": "1",
    "OLLAMA_ADDITIONAL_DIRECTORIES_MEMORY": "1"
  }
}
```

## Implementation Plan

### Phase 1: Container Runtime (Week 1-2)
1. Detect container runtime (Apple Container/Docker)
2. Create agent container image
3. Implement container runner
4. Volume mounting strategy
5. Test isolation

### Phase 2: Skills System (Week 2-3)
1. Skills directory structure
2. Skill loading mechanism
3. Create core skills
4. Documentation

### Phase 3: Enhanced IPC (Week 3-4)
1. Upgrade IPC watcher
2. Message types and handlers
3. Error recovery
4. Testing

### Phase 4: Integration & Testing (Week 4-5)
1. Integration testing
2. Security testing
3. Performance optimization
4. Documentation updates

### Phase 5: Agent Swarms (Future)
1. Multi-agent architecture
2. Orchestration logic
3. Testing
4. Examples

## Configuration

### Environment Variables
```bash
# Container runtime
CONTAINER_RUNTIME=auto # auto, apple-container, docker, none
CONTAINER_IMAGE=babybot-agent:latest
CONTAINER_TIMEOUT=1800000

# Mount security
MOUNT_ALLOWLIST_PATH=/Users/user/.config/babybot/mount-allowlist.json

# Agent features
ENABLE_AGENT_SWARMS=false
ENABLE_AUTO_MEMORY=true
```

### Docker Compose
```yaml
version: '3.8'

services:
  babybot:
    image: babybot:latest
    volumes:
      - ./groups:/workspace/groups
      - ./data:/workspace/data
      
  babybot-agent:
    image: babybot-agent:latest
    depends_on:
      - babybot
    # Agent container
```

## Security Considerations

1. **Filesystem Isolation**: Containers can only access mounted directories
2. **Network Isolation**: Agents can only connect to Ollama, not arbitrary endpoints
3. **Resource Limits**: CPU/memory limits per container
4. **Mount Validation**: All mounts validated against allowlist
5. **No Privilege Escalation**: Containers run as non-root

## Backward Compatibility

- Current direct execution mode remains default
- Container mode is opt-in
- Gradual migration path for existing users
- All existing features continue to work

## Testing Strategy

1. **Unit Tests**: Container runtime detection, mounting logic
2. **Integration Tests**: End-to-end container execution
3. **Security Tests**: Escape attempts, mount validation
4. **Performance Tests**: Container overhead measurements

## Documentation Updates

1. **SETUP.md**: Container runtime setup instructions
2. **DOCKER.md**: Enhanced Docker guide
3. **APPLE_CONTAINER.md**: New guide for Apple Container
4. **SKILLS.md**: Skills system documentation
5. **SECURITY.md**: Updated security model

## Success Metrics

- ✅ Apple Container works on macOS
- ✅ Docker works on macOS/Linux
- ✅ Groups are truly isolated
- ✅ Skills system functional
- ✅ Security boundaries enforced
- ✅ Performance acceptable (<500ms overhead)
- ✅ Zero regressions in existing features

## Dependencies

**New:**
- Container runtime (Apple Container or Docker)
- Additional npm packages for file watching

**Existing:**
- All current dependencies maintained

## Open Questions

1. Should we support both runtimes simultaneously?
2. How to handle Ollama connectivity from containers?
3. Skill installation: manual vs. auto-sync?
4. Session migration strategy?

## References

- [NanoClaw Architecture](https://github.com/qwibitai/nanoclaw)
- [Apple Container Docs](https://github.com/apple/container)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)

---

**Status**: Proposed
**Priority**: High
**Effort**: Large (4-5 weeks)
**Assignee**: TBD
