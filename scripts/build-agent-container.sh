#!/bin/bash
# Build script for agent container

set -e

echo "Building agent runner..."
cd container/agent-runner
npm install
npm run build
cd ../..

echo "Building Docker image..."
docker build -f container/Dockerfile.agent -t babybot-agent:latest .

echo "Agent container built successfully!"
echo "Image: babybot-agent:latest"
