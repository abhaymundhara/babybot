#!/bin/bash
# Build script for agent container

set -e

echo "Building agent runner..."
cd container/agent-runner
npm install
npm run build
cd ../..

RUNTIME="${CONTAINER_RUNTIME:-auto}"

if [[ "$RUNTIME" == "apple-container" ]] || [[ "$RUNTIME" == "auto" && -x "$(command -v container)" ]]; then
  echo "Building image with Apple Container..."
  container build -f container/Dockerfile.agent -t babybot-agent:latest .
elif [[ -x "$(command -v docker)" ]]; then
  echo "Building image with Docker..."
  docker build -f container/Dockerfile.agent -t babybot-agent:latest .
else
  echo "Error: No supported container runtime found (container or docker)." >&2
  exit 1
fi

echo "Agent container built successfully!"
echo "Image: babybot-agent:latest"
