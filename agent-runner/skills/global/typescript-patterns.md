<!-- skill:name = TypeScript Patterns & Conventions -->
<!-- skill:description = TypeScript coding patterns and naming conventions -->
<!-- skill:category = naming-conventions -->
<!-- skill:priority = 85 -->
<!-- skill:appliesTo = both -->

# TypeScript Patterns & Conventions

## Naming Conventions

- **Variables and functions**: camelCase

  ```typescript
  const maxRetries = 3;
  function calculateTotal(items: Item[]): number {}
  ```

- **Classes and interfaces**: PascalCase

  ```typescript
  class UserService {}
  interface AgentTask {}
  ```

- **Constants**: UPPER_SNAKE_CASE for primitive constants

  ```typescript
  const DEFAULT_TIMEOUT = 5000;
  const MAX_RETRIES = 3;
  ```

- **Type aliases**: PascalCase

  ```typescript
  type UserConfig = { name: string; email: string };
  ```

- **Private members**: Prefix with underscore (when truly private)
  ```typescript
  class Example {
    private _internalState: number;
  }
  ```

## Type Safety

- **Use explicit return types** for exported functions

  ```typescript
  // Good
  export const loadConfig = (path: string): Config => {};

  // Avoid
  export const loadConfig = (path: string) => {};
  ```

- **Prefer `type` over `interface`** for simple object types

  ```typescript
  // Good for simple objects
  type Config = { apiKey: string; timeout: number };

  // Use interface for extensible types
  interface Plugin {
    name: string;
    execute(): void;
  }
  ```

- **Use `readonly` for immutable properties**
  ```typescript
  type Config = {
    readonly apiKey: string;
    readonly endpoints: readonly string[];
  };
  ```

## Error Handling

- **Use custom error classes** for domain-specific errors

  ```typescript
  class ValidationError extends Error {
    constructor(
      public field: string,
      message: string,
    ) {
      super(message);
      this.name = "ValidationError";
    }
  }
  ```

- **Type narrow errors** in catch blocks
  ```typescript
  try {
    await riskyOperation();
  } catch (err) {
    if (err instanceof ValidationError) {
      console.error(`Validation failed on ${err.field}`);
    } else {
      console.error("Unknown error:", err);
    }
  }
  ```

## Async/Await

- **Always use async/await** over raw Promises
- **Handle errors with try/catch** not `.catch()`
- **Use `Promise.all`** for parallel operations
  ```typescript
  const [users, posts] = await Promise.all([fetchUsers(), fetchPosts()]);
  ```

## Imports

- **Use type imports** when importing only types

  ```typescript
  import type { Config } from "./config";
  import { loadConfig } from "./config";
  ```

- **Organize imports**: node builtins, external deps, internal modules
  ```typescript
  import { readFileSync } from "node:fs";
  import { z } from "zod";
  import type { Config } from "./config";
  ```
