# Container Support Documentation

## Overview

BabyBot supports sandboxed agent execution using container runtimes, providing filesystem isolation and security boundaries similar to NanoClaw's architecture.

## Supported Runtimes

### 1. Apple Container (macOS)
- **Lightweight** native macOS container runtime
- **Fast** - Optimized for Apple Silicon
- **Simple** - No daemon required
- **Secure** - OS-level isolation

### 2. Docker (macOS/Linux)
- **Cross-platform** - Works on macOS and Linux
- **Mature** - Well-established tooling
- **Flexible** - Extensive configuration options

### 3. None (Fallback)
- **Direct execution** - No containerization
- **Development mode** - For systems without container runtime
- **Backward compatible** - Original behavior

## Installation

### Prerequisites

**For Apple Container (macOS):**
```bash
# Install Apple Container
brew install apple/homebrew-apple/container

# Verify installation
container --version
```

**For Docker:**
```bash
# Install Docker Desktop (macOS/Linux)
# Visit: https://docs.docker.com/get-docker/

# Verify installation
docker ps
```

### Build Agent Container

```bash
# Build the agent container image
make build-agent

# Or manually:
./scripts/build-agent-container.sh
```

This will:
1. Build the agent runner TypeScript code
2. Create the Docker image `babybot-agent:latest`

## Configuration

### Environment Variables

Add to your `.env` file:

```bash
# Container Runtime
# Options: auto (detect), apple-container, docker, none
CONTAINER_RUNTIME=auto

# Container image name
CONTAINER_IMAGE=babybot-agent:latest

# Timeout for container execution (ms)
CONTAINER_TIMEOUT=1800000

# Maximum output size (bytes)
CONTAINER_MAX_OUTPUT_SIZE=10485760
```

### Runtime Detection

When `CONTAINER_RUNTIME=auto`:
1. On macOS: Check for Apple Container → Docker → None
2. On Linux: Check for Docker → None
3. On other platforms: Use None

## How It Works

### Architecture

```
┌─────────────────┐
│   Main Process  │
│  (index.ts)     │
└────────┬────────┘
         │
         ├─ Message arrives
         │
         ▼
┌─────────────────┐
│ Container Runner│
│ (container-     │
│  runner.ts)     │
└────────┬────────┘
         │
         ├─ Spawn container
         │
         ▼
┌─────────────────┐
│   Container     │
│  ┌───────────┐  │
│  │  Agent    │  │
│  │  Runner   │  │
│  └─────┬─────┘  │
│        │        │
│        ▼        │
│    Ollama API   │
│        │        │
│        ▼        │
│    Response     │
└────────┬────────┘
         │
         ▼
    Main Process
```

### Volume Mounts

**Main Group:**
- `/workspace/project` → Full project root (read-write)
- `/workspace/group` → Group folder (read-write)
- `/workspace/global` → Global memory (read-write)

**Other Groups:**
- `/workspace/group` → Group folder only (read-write)
- `/workspace/global` → Global memory (read-only)

### Security Isolation

Each container:
- ✅ Can only access mounted directories
- ✅ Cannot see other groups' data
- ✅ Runs with limited privileges
- ✅ Has execution timeout
- ✅ Has output size limits

## Usage

### Automatic (Recommended)

The system automatically uses container runtime if available:

```typescript
// In index.ts, the container runner is automatically invoked
await runAgent(group, prompt, chatJid, onOutput);
```

### Manual Control

Force a specific runtime:

```bash
# Force Apple Container
CONTAINER_RUNTIME=apple-container npm start

# Force Docker
CONTAINER_RUNTIME=docker npm start

# Disable containers
CONTAINER_RUNTIME=none npm start
```

## Development

### Building Agent Runner

```bash
cd container/agent-runner
npm install
npm run build
```

### Testing Container

```bash
# Build image
make build-agent

# Test manually
echo '{"prompt":"Hello","groupFolder":"test","chatJid":"test@s.whatsapp.net","isMain":false}' | \
  docker run -i --rm \
  --add-host host.docker.internal:host-gateway \
  babybot-agent:latest
```

### Debugging

Enable debug logging:

```bash
LOG_LEVEL=debug npm start
```

Check logs for:
- Container runtime detection
- Volume mount configuration
- Container spawn/exit events
- Agent output parsing

## Troubleshooting

### Container Not Found

**Problem:** `No container runtime detected`

**Solution:**
1. Check installation: `container --version` or `docker ps`
2. Ensure container daemon is running
3. Try force runtime: `CONTAINER_RUNTIME=docker`

### Build Failures

**Problem:** `Failed to build agent container`

**Solution:**
1. Check Docker is running: `docker ps`
2. Clean build: `rm -rf container/agent-runner/dist`
3. Rebuild: `make build-agent`

### Permission Errors

**Problem:** `Permission denied` mounting volumes

**Solution:**
1. Check folder permissions
2. Ensure groups directory exists: `mkdir -p groups`
3. On macOS, grant Docker access to project folder

### Ollama Connection

**Problem:** Agent can't connect to Ollama

**Solution:**
1. Ensure Ollama is running: `ollama list`
2. Check `OLLAMA_BASE_URL` in `.env`
3. For Docker: Use `http://host.docker.internal:11434`
4. For Apple Container: May need host IP address

### Timeout Issues

**Problem:** Container times out

**Solution:**
1. Increase timeout: `CONTAINER_TIMEOUT=3600000` (1 hour)
2. Check Ollama model is downloaded: `ollama pull llama2`
3. Use smaller/faster model

## Performance

### Overhead

| Runtime | Startup | Memory | CPU |
|---------|---------|--------|-----|
| Apple Container | ~50ms | +20MB | +5% |
| Docker | ~200ms | +50MB | +10% |
| None | 0ms | 0MB | 0% |

### Optimization Tips

1. **Pre-build images** - Don't rebuild on every run
2. **Keep containers warm** - Reuse sessions
3. **Limit concurrency** - `MAX_CONCURRENT_CONTAINERS=3`
4. **Use smaller models** - Faster inference

## Migration Guide

### From Direct Execution

1. Build agent container: `make build-agent`
2. Set runtime: `CONTAINER_RUNTIME=auto`
3. Restart: `npm start`

### From Docker to Apple Container

1. Install Apple Container: `brew install apple/homebrew-apple/container`
2. Set runtime: `CONTAINER_RUNTIME=apple-container`
3. Restart - no rebuild needed

## Advanced Configuration

### Custom Mounts

Edit `src/container-runner.ts` to add custom volume mounts:

```typescript
// Additional mounts for specific groups
if (group.folder === 'special-group') {
  mounts.push({
    hostPath: '/path/to/special/data',
    containerPath: '/workspace/special',
    readonly: true,
  });
}
```

### Resource Limits

For Docker, add resource limits in docker-compose.yml:

```yaml
services:
  babybot:
    deploy:
      resources:
        limits:
          cpus: '2'
          memory: 2G
```

### Network Configuration

Configure Ollama endpoint per environment:

```bash
# Development
OLLAMA_BASE_URL=http://localhost:11434

# Docker
OLLAMA_BASE_URL=http://host.docker.internal:11434

# Remote Ollama
OLLAMA_BASE_URL=http://ollama-server:11434
```

## Future Enhancements

- [ ] Session persistence across restarts
- [ ] Container health checks
- [ ] Multi-container scaling
- [ ] GPU passthrough for Ollama
- [ ] Windows WSL2 support

## References

- [Apple Container Documentation](https://github.com/apple/container)
- [Docker Best Practices](https://docs.docker.com/develop/dev-best-practices/)
- [Ollama API Documentation](https://github.com/ollama/ollama/blob/main/docs/api.md)
