# Skill: Add Telegram Integration

**Status**: Ready  
**Difficulty**: Medium  
**Prerequisites**: Telegram Bot Token

## Description

Add Telegram bot integration to BabyBot alongside WhatsApp.

## Prerequisites

- [ ] Telegram Bot Token from @BotFather
- [ ] Node.js 20+ installed

## Instructions

### Step 1: Install Dependencies

```bash
npm install node-telegram-bot-api
npm install --save-dev @types/node-telegram-bot-api
```

### Step 2: Get Bot Token

1. Message [@BotFather](https://t.me/botfather) on Telegram
2. Send `/newbot` and follow instructions
3. Copy the bot token

### Step 3: Configure

Add to `.env`:
```bash
TELEGRAM_BOT_TOKEN=your-token-here
```

### Step 4: Create Telegram Channel

Create `src/channels/telegram.ts` with Telegram bot implementation (see full skill for code).

### Step 5: Update Index

Import and initialize Telegram channel in `src/index.ts`.

## Testing

1. Set `TELEGRAM_BOT_TOKEN` in `.env`
2. Restart BabyBot: `npm start`
3. Message your bot: `@Baby hello`

## References

- [Telegram Bot API](https://core.telegram.org/bots/api)
