# Testing Guide

## Overview

BabyBot includes a comprehensive test suite for integration testing of all major components.

## Running Tests

### All Tests

```bash
npm test
```

### Specific Test Suites

```bash
# Container runtime tests
npm run test:container

# Skills system tests
npm run test:skills
```

## Test Structure

```
tests/
├── test-utils.ts                    # Test helper functions
├── integration/                     # Integration tests
│   ├── container-runtime.test.ts   # Container detection tests
│   └── skills.test.ts              # Skills system tests
└── run-integration-tests.ts        # Test runner
```

## Test Coverage

### Container Runtime Tests ✅

**What's Tested**:
- Container runtime detection (Apple Container, Docker, None)
- Forced runtime selection via environment variable
- Runtime availability checking

**Test Cases**:
1. `testContainerRuntimeDetection()` - Verifies runtime is detected correctly
2. `testForcedRuntime()` - Tests environment variable override

### Skills System Tests ✅

**What's Tested**:
- Skill discovery and listing
- Skill content retrieval
- Skill file integrity

**Test Cases**:
1. `testListSkills()` - Lists all available skills
2. `testGetSkillContent()` - Retrieves skill documentation
3. `testSkillFilesExist()` - Verifies all SKILL.md files exist

## Writing Tests

### Test Template

```typescript
import { assert, assertEqual } from '../test-utils.js';

async function testYourFeature(): Promise<void> {
  console.log('Testing your feature...');
  
  // Arrange
  const input = 'test';
  
  // Act
  const result = yourFunction(input);
  
  // Assert
  assertEqual(result, 'expected', 'Should return expected value');
  
  console.log('✅ Your feature test passed');
}
```

### Test Utilities

**Setup/Cleanup**:
```typescript
import { setupTestEnv, cleanupTestEnv } from './test-utils.js';

const testDir = setupTestEnv();
try {
  // Your test code
} finally {
  cleanupTestEnv(testDir);
}
```

**Assertions**:
```typescript
// Simple boolean assertion
assert(condition, 'Error message');

// Equality assertion
assertEqual(actual, expected, 'Optional message');
```

**Waiting for Conditions**:
```typescript
await waitFor(() => fs.existsSync(file), 5000);
```

## CI/CD Integration

Tests are designed to run in CI environments:

```yaml
# .github/workflows/test.yml
name: Tests
on: [push, pull_request]
jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm test
```

## Test Data

Tests create temporary data in `tests/.test-data/` which is automatically cleaned up and gitignored.

## Dependencies

Tests use the same dependencies as the main application:
- **tsx** - TypeScript execution
- **Node.js built-ins** - fs, path, etc.

No additional testing frameworks required.

## Performance

Current test suite:
- **Duration**: ~0.03 seconds
- **Tests**: 2 suites, 5 test cases
- **Coverage**: Container runtime, Skills system

## Troubleshooting

### Tests Fail in CI

**Issue**: Tests pass locally but fail in CI

**Solution**:
- Check environment variables
- Verify file paths are absolute
- Ensure test data cleanup happens

### Container Tests Skip

**Issue**: Container tests are skipped

**Reason**: No container runtime available in environment

**Solution**: Install Docker or Apple Container, or tests will auto-skip

## Future Test Plans

- [ ] Database integration tests
- [ ] IPC system tests with real message passing
- [ ] WhatsApp channel mocking tests
- [ ] Ollama integration tests (requires Ollama running)
- [ ] End-to-end workflow tests
- [ ] Performance benchmarks

## Best Practices

1. **Cleanup**: Always cleanup test data in finally blocks
2. **Isolation**: Each test should be independent
3. **Fast**: Keep tests under 100ms each when possible
4. **Clear Names**: Use descriptive test function names
5. **Good Messages**: Provide helpful assertion messages
6. **No External Deps**: Don't require external services (except optional checks)

## Example: Adding a New Test

1. Create test file:
```bash
touch tests/integration/my-feature.test.ts
```

2. Write test:
```typescript
async function testMyFeature(): Promise<void> {
  console.log('Testing my feature...');
  // Test code
  console.log('✅ My feature works');
}

async function runMyFeatureTests(): Promise<void> {
  console.log('\n=== My Feature Tests ===\n');
  await testMyFeature();
  console.log('\n✅ All my feature tests passed!\n');
}

export { runMyFeatureTests };
```

3. Add to test runner:
```typescript
// In tests/run-integration-tests.ts
import { runMyFeatureTests } from './integration/my-feature.test.js';

const tests = [
  // ... existing tests
  { name: 'My Feature', fn: runMyFeatureTests },
];
```

4. Run tests:
```bash
npm test
```

## Continuous Improvement

As BabyBot evolves, tests should:
- Cover new features
- Catch regressions
- Document expected behavior
- Enable safe refactoring
