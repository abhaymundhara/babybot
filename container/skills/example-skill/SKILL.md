# Skill: Example Skill Template

**Status**: Template  
**Difficulty**: Medium  
**Prerequisites**: None

## Description

This is a template for creating new skills. Copy this file structure to create your own skills.

## What This Skill Does

Describes the functionality this skill adds to BabyBot.

## Prerequisites

List any requirements before applying this skill:

- [ ] Requirement 1
- [ ] Requirement 2
- [ ] Environment variable X must be set

## Instructions

### Step 1: Install Dependencies

```bash
npm install package-name
```

### Step 2: Create New Files

Create `src/new-feature.ts`:

```typescript
// Template code here
export function newFeature() {
  console.log('New feature!');
}
```

## Testing

1. Build the project: `npm run build`
2. Run type checking: `npm run typecheck`

## Rollback

To remove this skill:

1. Delete `src/new-feature.ts`
2. Remove imports from `src/index.ts`

## References

- [Documentation link](https://example.com)
