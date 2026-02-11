# Skill: Add Clear Conversation Command

**Status**: Planned  
**Difficulty**: Medium  
**Prerequisites**: None

## Description

Add a `/clear` command to reset per-group session context.

## Instructions

1. Add command parsing for `/clear` in message loop.
2. Remove session for current group from database and in-memory state.
3. Return confirmation message to user.
4. Add integration test for command behavior.

## Verification

- Send `/clear` in a group.
- Confirm next model reply starts with fresh context.
