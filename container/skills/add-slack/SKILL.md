# Skill: Add Slack Integration

**Status**: Ready  
**Difficulty**: Medium  
**Prerequisites**: Slack Bot Token, App Signing Secret

## Description

Add Slack integration using Slack Events API and bot messages.

## Instructions

1. Install Slack SDK dependencies.
2. Add `SLACK_BOT_TOKEN` and `SLACK_SIGNING_SECRET` to `.env`.
3. Create `src/channels/slack.ts` for event ingestion and bot replies.
4. Normalize Slack events into BabyBot message format.
5. Register Slack channel lifecycle in `src/index.ts`.

## Verification

- Send a message in a connected Slack channel.
- Confirm it is persisted and routed through BabyBot.
