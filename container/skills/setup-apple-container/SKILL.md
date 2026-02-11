# Skill: Setup Apple Container Runtime

**Status**: Ready  
**Difficulty**: Easy  
**Prerequisites**: macOS

## Description

Configure BabyBot to use Apple Container for sandboxed execution on macOS.

## Prerequisites

- [ ] macOS (Apple Silicon or Intel)
- [ ] Homebrew installed

## Instructions

### Step 1: Install Apple Container

```bash
brew tap apple/homebrew-apple
brew install container
container --version
```

### Step 2: Configure Runtime

Edit `.env`:
```bash
CONTAINER_RUNTIME=apple-container
CONTAINER_IMAGE=babybot-agent:latest
```

### Step 3: Build Agent Image

```bash
make build-agent
```

### Step 4: Test

```bash
LOG_LEVEL=debug npm start
```

Look for: "Apple Container detected"

## Performance Benefits

- Startup: ~50ms vs ~200ms (Docker)
- Memory: +20MB vs +50MB (Docker)
- Native performance on Apple Silicon

## Troubleshooting

### Container Not Found

```bash
brew reinstall apple/homebrew-apple/container
export PATH="/opt/homebrew/bin:$PATH"
```

## References

- [Apple Container GitHub](https://github.com/apple/container)
