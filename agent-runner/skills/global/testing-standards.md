<!-- skill:name = Testing Standards -->
<!-- skill:description = Guidelines for writing comprehensive, maintainable tests using Vitest -->
<!-- skill:category = testing -->
<!-- skill:priority = 75 -->
<!-- skill:appliesTo = both -->

# Testing Standards

## Test File Organization

- **Colocate tests** with source code in `__tests__` directories

  ```
  src/
    skills/
      loader.ts
      formatter.ts
      __tests__/
        loader.test.ts
        formatter.test.ts
  ```

- **Name test files** with `.test.ts` suffix

- **One test file per module** - don't combine unrelated tests

## Test Structure

- **Use `describe` blocks** to group related tests

  ```typescript
  describe("loadSkills", () => {
    it("should load global skills", () => {});
    it("should merge project skills", () => {});
    it("should filter by phase", () => {});
  });
  ```

- **Use descriptive test names** that explain what is being tested

  ```typescript
  // Good
  it("should return empty array when skills directory does not exist", () => {});

  // Bad
  it("works", () => {});
  ```

- **Follow Arrange-Act-Assert** pattern

  ```typescript
  it("should filter skills by phase", () => {
    // Arrange
    const skills = [
      /* test data */
    ];

    // Act
    const result = filterSkills(skills, "planning");

    // Assert
    expect(result).toHaveLength(2);
  });
  ```

## Test Coverage

- **Test happy paths** - main functionality works correctly
- **Test edge cases** - empty inputs, null, undefined, boundary values
- **Test error cases** - invalid inputs, exceptions, failures
- **Test integration points** - how modules work together

## Mocking

- **Mock external dependencies** - don't make real API calls or file operations in tests

  ```typescript
  import { vi } from "vitest";

  vi.mock("node:fs", () => ({
    readFileSync: vi.fn(() => "mocked content"),
  }));
  ```

- **Use test fixtures** for complex data structures

  ```typescript
  // fixtures/skills.ts
  export const mockSkill: Skill = {
    id: "test-skill",
    name: "Test Skill",
    // ...
  };
  ```

- **Reset mocks** between tests
  ```typescript
  beforeEach(() => {
    vi.clearAllMocks();
  });
  ```

## Assertions

- **Use specific matchers** for clarity

  ```typescript
  // Good
  expect(result).toHaveLength(3);
  expect(value).toBeUndefined();
  expect(error).toBeInstanceOf(ValidationError);

  // Less clear
  expect(result.length).toBe(3);
  expect(value === undefined).toBe(true);
  ```

- **Test for specific error messages** when appropriate
  ```typescript
  expect(() => parseSkill(invalid)).toThrow("Invalid skill format");
  ```

## Async Tests

- **Always await async operations**

  ```typescript
  it("should load skills asynchronously", async () => {
    const skills = await loadSkills();
    expect(skills).toBeDefined();
  });
  ```

- **Test error handling** in async code
  ```typescript
  it("should handle read errors", async () => {
    await expect(loadSkills("/invalid")).rejects.toThrow();
  });
  ```

## Test Lifecycle

- **Clean up** after tests that create side effects

  ```typescript
  afterEach(() => {
    clearSkillCache();
  });
  ```

- **Don't rely on test execution order** - each test should be independent
