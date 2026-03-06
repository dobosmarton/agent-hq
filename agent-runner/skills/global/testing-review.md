---
id: testing-review
name: Testing Review
description: Reviews code for test coverage, quality, and best practices
category: testing
priority: 70
applies_to: implementation
---

# Testing Review

## Purpose

This skill guides the review agent to evaluate test coverage, test quality, and testing best practices.

## Review Checklist

### Test Coverage

- **Happy Paths**: Core functionality is tested
- **Edge Cases**: Boundary values, empty inputs, null/undefined
- **Error Cases**: Invalid inputs, exceptions, failures
- **Integration Points**: Interactions between modules tested

### Test Quality

- **Clear Test Names**: Descriptive names explaining what is tested
- **Arrange-Act-Assert**: Consistent test structure
- **One Assertion Focus**: Each test verifies one specific behavior
- **No Test Interdependence**: Tests run independently in any order
- **Deterministic**: Tests produce same result every time

### Test Data

- **Realistic Data**: Test data resembles production data
- **Test Fixtures**: Reusable test data in separate files
- **Minimal Data**: Only create data needed for the test
- **Clean Setup/Teardown**: Proper before/after hooks

### Mocking

- **External Dependencies**: Mock API calls, database, file system
- **No Over-Mocking**: Don't mock the code under test
- **Meaningful Mocks**: Mock data resembles real responses
- **Mock Reset**: Clear mocks between tests

### Async Testing

- **Await Assertions**: Always await async operations
- **Error Testing**: Test rejected promises
- **Timeout Handling**: Appropriate timeouts for async tests
- **No Floating Promises**: All promises properly handled

### Test Organization

- **Describe Blocks**: Group related tests
- **Colocation**: Tests near the code they test (`__tests__/`)
- **File Naming**: `.test.ts` suffix
- **Import Structure**: Clear test file imports

## Common Issues to Check

### Critical Issues

- No tests for core functionality
- Tests that pass regardless of code correctness
- Tests with race conditions or timing issues
- Missing error case testing
- Mocking the wrong thing (implementation not interface)

### Major Issues

- Low test coverage for new code
- Missing edge case testing
- No integration tests for complex flows
- Tests that are fragile (break on minor refactoring)
- Unclear test names

### Minor Issues

- Redundant tests testing the same thing
- Tests with excessive setup
- Missing test fixtures for complex data
- Inconsistent test structure
- Verbose test code that could be simplified

## Examples

### ❌ Bad: Unclear Test Name

```typescript
it("works", () => {
  expect(add(2, 2)).toBe(4);
});
```

### ✅ Good: Descriptive Test Name

```typescript
it("should return sum of two positive numbers", () => {
  expect(add(2, 2)).toBe(4);
});
```

### ❌ Bad: Missing Edge Cases

```typescript
describe("divide", () => {
  it("should divide numbers", () => {
    expect(divide(10, 2)).toBe(5);
  });
});
```

### ✅ Good: Test Edge Cases

```typescript
describe("divide", () => {
  it("should divide positive numbers", () => {
    expect(divide(10, 2)).toBe(5);
  });

  it("should handle division by zero", () => {
    expect(() => divide(10, 0)).toThrow("Division by zero");
  });

  it("should handle negative numbers", () => {
    expect(divide(-10, 2)).toBe(-5);
  });

  it("should handle decimal results", () => {
    expect(divide(5, 2)).toBe(2.5);
  });
});
```

### ❌ Bad: No Arrange-Act-Assert

```typescript
it("should create user", async () => {
  expect(await createUser({ name: "Test" })).toBeDefined();
});
```

### ✅ Good: Clear Structure

```typescript
it("should create user with provided name", async () => {
  // Arrange
  const userData = { name: "Test User", email: "test@example.com" };

  // Act
  const user = await createUser(userData);

  // Assert
  expect(user).toBeDefined();
  expect(user.name).toBe("Test User");
  expect(user.email).toBe("test@example.com");
});
```

### ❌ Bad: Testing Multiple Things

```typescript
it("should handle users", async () => {
  const user = await createUser({ name: "Test" });
  expect(user).toBeDefined();

  const updated = await updateUser(user.id, { name: "Updated" });
  expect(updated.name).toBe("Updated");

  await deleteUser(user.id);
  const deleted = await getUser(user.id);
  expect(deleted).toBeNull();
});
```

### ✅ Good: Focused Tests

```typescript
describe("user operations", () => {
  it("should create user", async () => {
    const user = await createUser({ name: "Test" });
    expect(user).toBeDefined();
    expect(user.name).toBe("Test");
  });

  it("should update user name", async () => {
    const user = await createUser({ name: "Test" });
    const updated = await updateUser(user.id, { name: "Updated" });
    expect(updated.name).toBe("Updated");
  });

  it("should delete user", async () => {
    const user = await createUser({ name: "Test" });
    await deleteUser(user.id);
    const deleted = await getUser(user.id);
    expect(deleted).toBeNull();
  });
});
```

### ❌ Bad: Missing Error Test

```typescript
describe("parseUser", () => {
  it("should parse valid user data", () => {
    const result = parseUser({ name: "Test", age: 25 });
    expect(result.name).toBe("Test");
  });
});
```

### ✅ Good: Test Error Cases

```typescript
describe("parseUser", () => {
  it("should parse valid user data", () => {
    const result = parseUser({ name: "Test", age: 25 });
    expect(result.name).toBe("Test");
    expect(result.age).toBe(25);
  });

  it("should throw on missing name", () => {
    expect(() => parseUser({ age: 25 })).toThrow("Name is required");
  });

  it("should throw on invalid age", () => {
    expect(() => parseUser({ name: "Test", age: -1 })).toThrow(
      "Age must be positive",
    );
  });
});
```

## Review Output Format

When finding testing issues, include:

- **Severity**: critical (no tests for core), major (missing edge cases), minor (test quality)
- **Category**: testing
- **Description**: What testing is missing or problematic
- **Suggestion**: What tests to add or how to improve
- **Coverage Gap**: What scenarios are not covered
