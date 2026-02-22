<!-- skill:name = Node.js Best Practices -->
<!-- skill:description = Best practices for Node.js development including error handling, async patterns, and module design -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->
<!-- skill:appliesTo = both -->

# Node.js Best Practices

## Module Imports

- **Use `node:` protocol** for built-in modules

  ```typescript
  import { readFileSync } from "node:fs";
  import { resolve } from "node:path";
  ```

- **Prefer named imports** over default imports

  ```typescript
  // Good
  import { readFile } from "node:fs/promises";

  // Avoid
  import fs from "node:fs";
  ```

## Error Handling

- **Always handle errors** in async functions

  ```typescript
  try {
    const data = await readFile(path);
  } catch (err) {
    console.error("Failed to read file:", err);
    // Handle or rethrow
  }
  ```

- **Type narrow Node.js errors** when checking error codes

  ```typescript
  catch (err) {
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      // File not found
    }
  }
  ```

- **Log errors with context**, not just the error object
  ```typescript
  console.error(`Failed to process task ${taskId}:`, err);
  ```

## File Operations

- **Use async versions** of fs methods

  ```typescript
  import { readFile, writeFile } from "node:fs/promises";
  ```

- **Use `resolve()` for paths** to handle relative paths correctly

  ```typescript
  const configPath = resolve(process.cwd(), "config.json");
  ```

- **Check file existence** before operations when appropriate

  ```typescript
  import { access, constants } from "node:fs/promises";

  try {
    await access(path, constants.R_OK);
    // File exists and is readable
  } catch {
    // File doesn't exist or not readable
  }
  ```

## Process & Environment

- **Exit gracefully** on unhandled errors

  ```typescript
  process.on("unhandledRejection", (err) => {
    console.error("Unhandled rejection:", err);
    process.exit(1);
  });
  ```

- **Validate environment variables** early with schemas (e.g., Zod)

  ```typescript
  const EnvSchema = z.object({
    API_KEY: z.string().min(1),
    PORT: z.coerce.number().default(3000),
  });

  const env = EnvSchema.parse(process.env);
  ```

- **Don't expose sensitive data** in logs or error messages

## Performance

- **Cache expensive operations** when appropriate

  ```typescript
  const cache = new Map<string, Result>();

  const getCached = (key: string): Result | undefined => {
    return cache.get(key);
  };
  ```

- **Use streams for large files** instead of loading into memory

  ```typescript
  import { createReadStream } from "node:fs";

  const stream = createReadStream(largePath);
  stream.pipe(destination);
  ```

## Dependency Management

- **Pin dependency versions** in package.json for production
- **Keep dependencies minimal** - don't add libraries for simple tasks
- **Audit dependencies regularly** for security vulnerabilities
