# Skill: Add Discord Integration

**Status**: Ready  
**Difficulty**: Medium  
**Prerequisites**: Discord Bot Token

## Description

Add Discord bot integration to BabyBot alongside WhatsApp.

## Instructions

1. Install `discord.js` and types.
2. Add `DISCORD_BOT_TOKEN` to `.env`.
3. Create `src/channels/discord.ts` for inbound/outbound message handling.
4. Register Discord channel in `src/index.ts`.
5. Reuse existing group registration and routing behavior.

## Verification

- Start app with token configured.
- Send a Discord message in a test channel.
- Confirm message is stored and BabyBot responds.
