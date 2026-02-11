# Docker Deployment Guide

## Prerequisites

- Docker and Docker Compose installed
- Ollama running on your host machine

## Setup

### 1. Configure Environment

```bash
cp .env.example .env
# Edit .env with your settings
```

### 2. Build and Run

```bash
docker-compose up -d
```

### 3. Authenticate WhatsApp

First time setup requires QR code scanning:

```bash
# View logs to see QR code
docker-compose logs -f babybot

# Or run auth in interactive mode
docker-compose exec babybot npm run auth
```

Scan the QR code with WhatsApp on your phone.

### 4. Check Logs

```bash
docker-compose logs -f babybot
```

## Connecting to Ollama

The container is configured to connect to Ollama running on your host machine using `host.docker.internal:11434`.

Make sure Ollama is running on your host:

```bash
# On host machine
ollama serve
```

## Managing the Container

### Stop

```bash
docker-compose down
```

### Restart

```bash
docker-compose restart
```

### View Logs

```bash
docker-compose logs -f
```

### Rebuild After Code Changes

```bash
docker-compose down
docker-compose build
docker-compose up -d
```

## Data Persistence

The following directories are mounted as volumes:
- `./auth_info_baileys` - WhatsApp authentication
- `./data` - SQLite database and sessions
- `./groups` - Group memory files

These persist even if you remove the container.

## Troubleshooting

### Can't Connect to Ollama

If BabyBot can't connect to Ollama on your host:

1. Make sure Ollama is running: `ollama serve`
2. On Linux, you might need to use your actual host IP instead of `host.docker.internal`
   
   Edit `docker-compose.yml`:
   ```yaml
   environment:
     - OLLAMA_BASE_URL=http://192.168.1.x:11434
   ```

### WhatsApp Authentication Issues

If QR code doesn't display properly:

```bash
# Run auth in interactive terminal
docker-compose run --rm babybot npm run auth
```

### Container Keeps Restarting

Check logs for errors:
```bash
docker-compose logs --tail=100 babybot
```

Common issues:
- Ollama not accessible
- Missing .env file
- Invalid configuration
