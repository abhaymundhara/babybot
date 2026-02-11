# Skill: Setup Windows Runtime (WSL2 + Docker)

**Status**: Ready  
**Difficulty**: Medium  
**Prerequisites**: Windows 11, WSL2, Docker Desktop

## Description

Prepare BabyBot to run in a Windows environment via WSL2 and Docker.

## Instructions

1. Install WSL2 with Ubuntu.
2. Install Docker Desktop and enable WSL integration.
3. Install Node.js 20+ inside WSL.
4. Clone repo inside Linux filesystem.
5. Configure `.env` with `CONTAINER_RUNTIME=docker`.
6. Build container image and run tests.

## Verification

- `npm run typecheck`
- `npm test`
- Start bot and validate inbound/outbound messaging.
