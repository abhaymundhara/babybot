# BabyBot Makefile

.PHONY: help install build test clean build-agent run-dev

help:
	@echo "BabyBot - Make targets"
	@echo "  install        - Install dependencies"
	@echo "  build          - Build TypeScript"
	@echo "  build-agent    - Build agent container image"
	@echo "  run-dev        - Run in development mode"
	@echo "  test           - Run tests"
	@echo "  clean          - Clean build artifacts"

install:
	npm install

build:
	npm run build

build-agent:
	@echo "Building agent container..."
	@./scripts/build-agent-container.sh

run-dev:
	npm run dev

test:
	npm run typecheck

clean:
	rm -rf dist
	rm -rf container/agent-runner/dist
	rm -rf container/agent-runner/node_modules
