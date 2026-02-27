<!-- skill:name = TypeScript Node.js Best Practices -->
<!-- skill:description = TypeScript and Node.js project setup, compiler configuration, and type-safe coding patterns -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->
<!-- skill:appliesTo = both -->

# Skill: TypeScript Node.js Best Practices

## When to Use This Skill

Use this skill when:

- Starting new TypeScript/Node.js projects
- Setting up TypeScript compiler configuration
- Configuring ESLint and Prettier
- Writing type-safe code
- Applying functional programming patterns
- Reviewing code for type safety issues

**Example User Requests:**

- "Set up a new TypeScript project"
- "Configure strict TypeScript settings"
- "Help me write this function with proper types"
- "Review this code for type safety"
- "Set up ESLint and Prettier"

---

## Core Principles

1. **Type everything explicitly** - No implicit any, annotate all parameters and returns
2. **No `any` ever** - It defeats the purpose of TypeScript
3. **Avoid `unknown`** - Narrow it immediately or use specific types
4. **Prefer types over interfaces** - Types are more flexible and composable
5. **Arrow functions over function declarations** - Concise, lexical `this`, consistent style
6. **Functional programming over OOP** - Pure functions, immutability, composition
7. **Named exports only** - No default exports
8. **Simplicity over cleverness** - The simplest solution that works

---

## TypeScript Configuration

### Strict Base Configuration

```json
{
  "$schema": "https://json.schemastore.org/tsconfig",
  "compilerOptions": {
    // Strict type checking
    "strict": true,
    "strictNullChecks": true,
    "noUncheckedIndexedAccess": true,

    // Module system
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "isolatedModules": true,
    "esModuleInterop": true,

    // Output
    "target": "ES2022",
    "lib": ["ES2022"],
    "noEmit": true,

    // Quality
    "forceConsistentCasingInFileNames": true,
    "skipLibCheck": true,
    "resolveJsonModule": true
  },
  "exclude": ["node_modules", "dist"]
}
```

### Key Compiler Options Explained

| Option                        | Value  | Why                                          |
| ----------------------------- | ------ | -------------------------------------------- |
| `strict`                      | `true` | Enables all strict type checking             |
| `noUncheckedIndexedAccess`    | `true` | Array/object access returns `T \| undefined` |
| `strictNullChecks`            | `true` | `null` and `undefined` are distinct types    |
| `isolatedModules`             | `true` | Each file must be compilable alone           |
| `moduleResolution: "Bundler"` | Modern | Works with modern bundlers                   |
| `noEmit`                      | `true` | Only type check, bundler handles output      |

### Node.js Addition

For Node.js projects, add:

```json
{
  "compilerOptions": {
    "lib": ["ES2022"],
    "types": ["node"]
  }
}
```

---

## Explicit Typing Patterns

### Function Parameters and Returns

```typescript
// ✅ GOOD: Explicit parameter and return types
const add = (a: number, b: number): number => {
  return a + b;
};

// ✅ GOOD: Complex return type
const fetchUser = async (id: string): Promise<User | null> => {
  const result = await db.query(id);
  return result ?? null;
};

// ❌ BAD: Missing return type
const add = (a: number, b: number) => {
  return a + b;
};

// ❌ BAD: Implicit any in callback
items.map((item) => item.name);

// ✅ GOOD: Typed callback
items.map((item: Item) => item.name);
// Or better: let TypeScript infer from well-typed array
```

---

## Arrow Functions Over Function Declarations

### Why Arrow Functions?

| Aspect         | Arrow Function        | Function Declaration   |
| -------------- | --------------------- | ---------------------- |
| `this` binding | Lexical (predictable) | Dynamic (error-prone)  |
| Hoisting       | No (explicit order)   | Yes (can be confusing) |
| Syntax         | Concise               | Verbose                |
| Consistency    | Same style everywhere | Mixed styles           |

### Standard Pattern

```typescript
// ✅ GOOD: Arrow function with explicit types
const add = (a: number, b: number): number => {
  return a + b;
};

// ✅ GOOD: Concise for simple expressions
const double = (n: number): number => n * 2;

// ✅ GOOD: Async arrow function
const fetchUser = async (id: string): Promise<User | null> => {
  const result = await db.query(id);
  return result ?? null;
};

// ❌ BAD: Function declaration
function add(a: number, b: number): number {
  return a + b;
}

// ❌ BAD: Named function expression
const add = function (a: number, b: number): number {
  return a + b;
};
```

### Higher-Order Functions

```typescript
// ✅ GOOD: Arrow functions for HOFs
const createMultiplier = (factor: number) => {
  return (value: number): number => value * factor;
};

const createValidator = <T>(schema: Schema<T>) => {
  return (data: unknown): T => schema.parse(data);
};

// ✅ GOOD: Inline callbacks
const activeUsers = users.filter((user) => user.isActive);
const names = users.map((user) => user.name);

// ❌ BAD: Function declarations in HOFs
const createMultiplier = function (factor: number) {
  return function (value: number): number {
    return value * factor;
  };
};
```

### Object Methods

```typescript
// ✅ GOOD: Object with arrow function properties
const userService = {
  find: async (id: string): Promise<User | null> => {
    return db.users.findUnique({ where: { id } });
  },

  create: async (data: CreateUserInput): Promise<User> => {
    return db.users.create({ data });
  },
};

// ✅ GOOD: Factory returning object with arrow functions
const createUserService = (db: Database) => ({
  find: async (id: string): Promise<User | null> => {
    return db.users.findUnique({ where: { id } });
  },

  create: async (data: CreateUserInput): Promise<User> => {
    return db.users.create({ data });
  },
});

// ❌ BAD: Shorthand method syntax (can have `this` issues)
const userService = {
  async find(id: string): Promise<User | null> {
    return db.users.findUnique({ where: { id } });
  },
};
```

### When `this` Matters (Rare)

```typescript
// The only case for function declarations: when you NEED dynamic `this`
// This is rare and usually indicates a design issue

// If you must use `this` (e.g., library callbacks):
const handler = function (this: Context) {
  return this.value; // Dynamic this
};

// ✅ BETTER: Avoid `this` entirely - pass context explicitly
const handler = (context: Context): string => {
  return context.value;
};
```

### Object Types

```typescript
// ✅ GOOD: Type alias for objects
type User = {
  id: string;
  name: string;
  email: string;
  createdAt: Date;
};

// ✅ GOOD: Readonly for immutable data
type Config = Readonly<{
  apiUrl: string;
  timeout: number;
  retries: number;
}>;

// ❌ BAD: Interface for simple objects
interface User {
  id: string;
  name: string;
}
```

### Function Types

```typescript
// ✅ GOOD: Type alias for function signatures
type Comparator<T> = (a: T, b: T) => number;
type AsyncHandler<T, R> = (input: T) => Promise<R>;
type Predicate<T> = (item: T) => boolean;

// ✅ GOOD: Using function types
const sortByName: Comparator<User> = (a, b) => a.name.localeCompare(b.name);

// ✅ GOOD: Higher-order function with types
const createFilter = <T>(predicate: Predicate<T>) => {
  return (items: T[]): T[] => items.filter(predicate);
};
```

---

## Avoiding `any` and `unknown`

### Never Use `any`

```typescript
// ❌ NEVER: any defeats type safety
const processData = (data: any) => {
  return data.value; // No type checking!
};

// ✅ GOOD: Define the actual type
type ApiResponse = {
  value: string;
  timestamp: number;
};

const processData = (data: ApiResponse): string => {
  return data.value; // Type checked!
};
```

### Handling External Data

```typescript
// For truly unknown external data, parse and validate immediately

import { z } from "zod";

// Define schema
const UserSchema = z.object({
  id: z.string().uuid(),
  name: z.string().min(1),
  email: z.string().email(),
});

type User = z.infer<typeof UserSchema>;

// Parse at the boundary
const parseUser = (data: unknown): User => {
  return UserSchema.parse(data); // Throws if invalid
};

// Or with result type
const safeParseUser = (data: unknown): User | null => {
  const result = UserSchema.safeParse(data);
  return result.success ? result.data : null;
};
```

### External API Payloads

```typescript
// ✅ GOOD: Use .passthrough() for external API payloads
// Allows extra fields the API may add without breaking validation
const WebhookEventSchema = z
  .object({
    action: z.string(),
    payload: z.object({ id: z.number() }).passthrough(),
  })
  .passthrough();

// ✅ GOOD: Derive type from schema — single source of truth
type WebhookEvent = z.infer<typeof WebhookEventSchema>;

// ❌ BAD: Separate type and schema that can drift apart
type WebhookEvent = {
  action: string;
  payload: { id: number };
};
// Schema defined elsewhere with different fields...
```

### Type Narrowing Instead of `unknown`

```typescript
// ❌ BAD: Leaving unknown unnarrowed
const handleError = (error: unknown) => {
  console.log(error.message); // Error: unknown type
};

// ✅ GOOD: Narrow immediately
const handleError = (error: unknown): string => {
  if (error instanceof Error) {
    return error.message;
  }
  if (typeof error === "string") {
    return error;
  }
  return "Unknown error";
};

// ✅ BETTER: Type guard function
const isError = (value: unknown): value is Error => {
  return value instanceof Error;
};

const handleError = (error: unknown): string => {
  return isError(error) ? error.message : "Unknown error";
};
```

---

## Node.js Security Patterns

### Timing-Safe Comparison

When comparing secrets, HMAC signatures, or tokens, always use constant-time comparison. String `===` leaks timing information that attackers can exploit.

```typescript
import { createHmac, timingSafeEqual } from "node:crypto";

// ❌ BAD: Timing attack vulnerable — leaks character-by-character match info
const isValid = actualSignature === expectedSignature;

// ✅ GOOD: Constant-time HMAC verification
const verifyHmac = (
  payload: string,
  signature: string,
  secret: string,
): boolean => {
  const expected = createHmac("sha256", secret).update(payload).digest("hex");
  // Length check prevents timingSafeEqual from throwing on mismatched sizes
  if (signature.length !== expected.length) {
    return false;
  }
  return timingSafeEqual(
    Buffer.from(signature, "hex"),
    Buffer.from(expected, "hex"),
  );
};
```

**Rule**: Any comparison involving secrets, tokens, signatures, or API keys must use `crypto.timingSafeEqual`. Never use `===`, `==`, or `.includes()` for secret comparison.

---

## Async Patterns

### Fire-and-Forget

When you intentionally don't await a promise (e.g., responding to a webhook immediately while processing in the background), use the `void` operator with `.catch()` to signal intent and prevent unhandled rejections.

```typescript
// ❌ BAD: Unhandled floating promise — crashes on rejection
handleEvent(data);

// ❌ BAD: Verbose .then().catch() when .then() just logs
handleEvent(data)
  .then(() => console.log("done"))
  .catch((err) => console.error(err));

// ✅ GOOD: Explicit fire-and-forget with error handling
void handleEvent(data).catch((err: unknown) => {
  console.error("Event processing failed:", err);
});
```

### Respond First, Process Later

```typescript
// ✅ GOOD: Webhook pattern — respond immediately, process async
app.post("/webhook", async (c) => {
  const event = parseEvent(await c.req.text());

  // Fire-and-forget: process in background
  void processEvent(event).catch((err: unknown) => {
    console.error(`Failed to process event ${event.id}:`, err);
  });

  // Respond immediately so the caller doesn't timeout
  return c.json({ received: true });
});
```

**Rule**: Every floating promise must have either `await` or `void ... .catch()`. Never leave a promise return value unused without one of these.

---

## Type vs Interface

### When to Use Type (Almost Always)

```typescript
// ✅ Types for object shapes
type User = {
  id: string;
  name: string;
};

// ✅ Types for unions
type Status = "pending" | "active" | "completed";
type Result<T> = { success: true; data: T } | { success: false; error: string };

// ✅ Types for function signatures
type Handler = (event: Event) => void;

// ✅ Types for mapped types
type Readonly<T> = { readonly [K in keyof T]: T[K] };

// ✅ Types for tuple types
type Coordinates = [number, number];
type RGB = [red: number, green: number, blue: number];
```

### When Interface Might Be Needed

```typescript
// Interfaces for declaration merging (rare)
// Useful for extending library types
declare global {
  interface Window {
    myCustomProperty: string;
  }
}

// Interfaces for class implementation contracts (avoid classes though)
interface Repository<T> {
  find(id: string): Promise<T | null>;
  save(entity: T): Promise<void>;
}
```

---

## Functional Programming Patterns

### Pure Functions

```typescript
// ✅ GOOD: Pure function - same input always gives same output
const calculateTotal = (items: readonly Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0);
};

// ❌ BAD: Impure - depends on external state
let taxRate = 0.1;
const calculateTotal = (items: Item[]): number => {
  return items.reduce((sum, item) => sum + item.price, 0) * (1 + taxRate);
};

// ✅ GOOD: Make dependency explicit
const calculateTotal = (items: readonly Item[], taxRate: number): number => {
  return items.reduce((sum, item) => sum + item.price, 0) * (1 + taxRate);
};
```

### Immutability

```typescript
// ✅ GOOD: Use const and readonly
const config: Readonly<Config> = {
  apiUrl: "https://api.example.com",
  timeout: 5000,
};

// ✅ GOOD: as const for literal types
const STATUSES = ["pending", "active", "completed"] as const;
type Status = (typeof STATUSES)[number]; // "pending" | "active" | "completed"

// ✅ GOOD: Return new objects instead of mutating
const updateUser = (user: User, name: string): User => {
  return { ...user, name };
};

// ❌ BAD: Mutation
const updateUser = (user: User, name: string): User => {
  user.name = name; // Mutating input!
  return user;
};
```

### Accumulate Then Return

When a function produces a complex result from a loop, collect into separate variables and build the result object once at the end — don't create an empty result and mutate it throughout.

```typescript
// ❌ BAD: Create empty result, mutate fields throughout the function
const processItems = (items: Item[]): ProcessResult => {
  const result: ProcessResult = { success: false, processed: [], errors: [] };
  for (const item of items) {
    try {
      handle(item);
      result.processed.push(item.id);
    } catch (err) {
      result.errors.push(item.id);
    }
  }
  result.success = result.errors.length === 0;
  return result;
};

// ✅ GOOD: Separate accumulators, single return
const processItems = (items: Item[]): ProcessResult => {
  const processed: string[] = [];
  const errors: string[] = [];

  for (const item of items) {
    try {
      handle(item);
      processed.push(item.id);
    } catch {
      errors.push(item.id);
    }
  }

  return { success: errors.length === 0, processed, errors };
};
```

### Array Methods Over Loops

```typescript
// ✅ GOOD: Declarative with array methods
const activeUsers = users.filter((user) => user.isActive);
const userNames = users.map((user) => user.name);
const totalAge = users.reduce((sum, user) => sum + user.age, 0);

// ❌ BAD: Imperative loops
const activeUsers: User[] = [];
for (let i = 0; i < users.length; i++) {
  if (users[i].isActive) {
    activeUsers.push(users[i]);
  }
}

// ✅ GOOD: Chaining
const result = users
  .filter((user) => user.isActive)
  .map((user) => user.name)
  .sort((a, b) => a.localeCompare(b));
```

### Function Composition

```typescript
// ✅ GOOD: Small, composable functions
const trim = (s: string): string => s.trim();
const lowercase = (s: string): string => s.toLowerCase();
const removeSpaces = (s: string): string => s.replace(/\s+/g, "-");

const slugify = (s: string): string => {
  return removeSpaces(lowercase(trim(s)));
};

// ✅ GOOD: Pipe utility for composition
const pipe = <T>(...fns: Array<(arg: T) => T>) => {
  return (value: T): T => fns.reduce((acc, fn) => fn(acc), value);
};

const slugify = pipe(trim, lowercase, removeSpaces);
```

### Avoiding Classes for Data

```typescript
// ❌ BAD: Class for simple data
class User {
  constructor(
    public id: string,
    public name: string,
    public email: string,
  ) {}

  getDisplayName(): string {
    return this.name;
  }
}

// ✅ GOOD: Type + functions
type User = {
  id: string;
  name: string;
  email: string;
};

const getDisplayName = (user: User): string => user.name;

const createUser = (id: string, name: string, email: string): User => ({
  id,
  name,
  email,
});
```

---

## Discriminated Unions

### Pattern: Tagged Unions

```typescript
// ✅ GOOD: Discriminated union for states
type AsyncState<T> =
  | { status: "idle" }
  | { status: "loading" }
  | { status: "success"; data: T }
  | { status: "error"; error: string };

// Type-safe handling
const handleState = <T>(state: AsyncState<T>): string => {
  switch (state.status) {
    case "idle":
      return "Ready";
    case "loading":
      return "Loading...";
    case "success":
      return `Got ${state.data}`; // TypeScript knows data exists
    case "error":
      return `Error: ${state.error}`; // TypeScript knows error exists
  }
};
```

### Result Type

```typescript
// ✅ GOOD: Result type for error handling
type Result<T, E = string> = { ok: true; value: T } | { ok: false; error: E };

const divide = (a: number, b: number): Result<number> => {
  if (b === 0) {
    return { ok: false, error: "Division by zero" };
  }
  return { ok: true, value: a / b };
};

// Usage
const result = divide(10, 2);
if (result.ok) {
  console.log(result.value); // TypeScript knows value exists
} else {
  console.error(result.error); // TypeScript knows error exists
}
```

---

## Utility Types

### Common Built-in Types

```typescript
// Pick: Select specific properties
type UserName = Pick<User, "id" | "name">;

// Omit: Exclude specific properties
type UserWithoutId = Omit<User, "id">;

// Partial: Make all properties optional
type PartialUser = Partial<User>;

// Required: Make all properties required
type RequiredUser = Required<User>;

// Readonly: Make all properties readonly
type ReadonlyUser = Readonly<User>;

// Record: Create object type with specific keys
type UserRoles = Record<string, "admin" | "user" | "guest">;

// Extract: Extract union members
type ActiveStatuses = Extract<Status, "active" | "completed">;

// Exclude: Remove union members
type NonActiveStatuses = Exclude<Status, "active">;

// NonNullable: Remove null and undefined
type DefiniteUser = NonNullable<User | null | undefined>;
```

### Custom Utility Types

```typescript
// Make specific properties optional
type PartialBy<T, K extends keyof T> = Omit<T, K> & Partial<Pick<T, K>>;
type CreateUserInput = PartialBy<User, "id" | "createdAt">;

// Make specific properties required
type RequiredBy<T, K extends keyof T> = T & Required<Pick<T, K>>;

// Deep readonly
type DeepReadonly<T> = {
  readonly [K in keyof T]: T[K] extends object ? DeepReadonly<T[K]> : T[K];
};

// Nullable
type Nullable<T> = T | null;
```

---

## ESLint Configuration

### Modern Flat Config

```javascript
// eslint.config.js
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import eslintConfigPrettier from "eslint-config-prettier";

export default [
  js.configs.recommended,
  ...tseslint.configs.recommended,
  eslintConfigPrettier,
  {
    rules: {
      // Enforce explicit types
      "@typescript-eslint/explicit-function-return-type": "error",
      "@typescript-eslint/explicit-module-boundary-types": "error",

      // Ban any
      "@typescript-eslint/no-explicit-any": "error",

      // Prefer const
      "prefer-const": "error",

      // No unused variables
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
        },
      ],
    },
  },
  {
    ignores: ["dist/**", "node_modules/**"],
  },
];
```

### Prettier Configuration

```json
// .prettierrc
{
  "semi": true,
  "singleQuote": false,
  "tabWidth": 2,
  "trailingComma": "es5",
  "printWidth": 100
}
```

### Package.json Scripts

```json
{
  "scripts": {
    "lint": "eslint .",
    "lint:fix": "eslint . --fix",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check-types": "tsc --noEmit"
  }
}
```

---

## Named Exports Only

```typescript
// ✅ GOOD: Named exports
export const createUser = (name: string): User => ({ name });
export type User = { name: string };

// ❌ BAD: Default exports
export default function createUser(name: string) {
  return { name };
}

// ✅ GOOD: Re-exporting
export { createUser, updateUser, deleteUser } from "./user";
export type { User, UserInput } from "./types";

// ✅ GOOD: Barrel exports (index.ts)
export * from "./user";
export * from "./product";
export * from "./types";
```

### Why Named Exports?

1. **Better refactoring** - Renaming is straightforward
2. **Explicit imports** - Clear what's being used
3. **Tree-shaking** - Bundlers can eliminate unused code
4. **Consistency** - Same pattern everywhere

### Export Types That Consumers Need

If a function returns a custom type, export that type so consumers can reference it directly. Forcing consumers to use `ReturnType<typeof fn>` is fragile and unreadable.

```typescript
// ✅ GOOD: Export both the function and its return type
export type UpdateResult =
  | { success: true; status: "moved" | "skipped" }
  | { success: false; reason: string };

export const updateTask = async (id: string): Promise<UpdateResult> => {
  // ...
};

// ❌ BAD: Type hidden — consumers must use inference
type UpdateResult = { success: boolean };
export const updateTask = async (id: string): Promise<UpdateResult> => {
  // ...
};
// Consumer: type Result = Awaited<ReturnType<typeof updateTask>>; // fragile
```

---

## Simplicity Patterns

### Avoid Over-Abstraction

```typescript
// ❌ BAD: Over-engineered
interface IUserRepositoryFactory<T extends IUser, R extends IRepository<T>> {
  create(config: IRepositoryConfig): R;
}

// ✅ GOOD: Simple and direct
type UserRepository = {
  find: (id: string) => Promise<User | null>;
  save: (user: User) => Promise<void>;
};

const createUserRepository = (db: Database): UserRepository => ({
  find: (id) => db.query("SELECT * FROM users WHERE id = ?", [id]),
  save: (user) => db.execute("INSERT INTO users ...", [user]),
});
```

### Flat Over Nested

```typescript
// ❌ BAD: Deep nesting
const processOrder = (order: Order) => {
  if (order.status === "pending") {
    if (order.items.length > 0) {
      if (order.payment) {
        // finally do something
      }
    }
  }
};

// ✅ GOOD: Early returns
const processOrder = (order: Order): Result<void> => {
  if (order.status !== "pending") {
    return { ok: false, error: "Order not pending" };
  }

  if (order.items.length === 0) {
    return { ok: false, error: "Order has no items" };
  }

  if (!order.payment) {
    return { ok: false, error: "No payment info" };
  }

  // do something
  return { ok: true, value: undefined };
};
```

### Small Functions

```typescript
// ❌ BAD: Large function doing too much
const processUser = (data: unknown) => {
  // 100 lines of validation, transformation, saving...
};

// ✅ GOOD: Small, focused functions
const validateUserData = (data: unknown): User => {
  return UserSchema.parse(data);
};

const normalizeUser = (user: User): User => ({
  ...user,
  email: user.email.toLowerCase(),
  name: user.name.trim(),
});

const saveUser = async (user: User): Promise<void> => {
  await db.users.insert(user);
};

// Compose them
const processUser = async (data: unknown): Promise<void> => {
  const user = validateUserData(data);
  const normalized = normalizeUser(user);
  await saveUser(normalized);
};
```

---

## Anti-Patterns to Avoid

### 1. Using `any`

```typescript
// ❌ NEVER
const handle = (data: any) => data.foo;

// ✅ ALWAYS define the type
type Data = { foo: string };
const handle = (data: Data): string => data.foo;
```

### 2. Type Assertions to Silence Errors

```typescript
// ❌ BAD: Casting away the problem
const user = data as User;

// ✅ GOOD: Validate the data
const user = UserSchema.parse(data);
```

### 3. Mutation

```typescript
// ❌ BAD
const addItem = (arr: string[], item: string) => {
  arr.push(item);
  return arr;
};

// ✅ GOOD
const addItem = (arr: readonly string[], item: string): string[] => {
  return [...arr, item];
};
```

### 4. Classes for Simple Data

```typescript
// ❌ BAD
class Point {
  constructor(
    public x: number,
    public y: number,
  ) {}
}

// ✅ GOOD
type Point = { x: number; y: number };
const point: Point = { x: 1, y: 2 };
```

### 5. Over-Engineering

```typescript
// ❌ BAD: Abstract factory for one implementation
interface IFactory<T> {
  create(): T;
}

// ✅ GOOD: Simple factory function
const createUser = (name: string): User => ({ name });
```

### 6. Function Declarations

```typescript
// ❌ BAD: Function declaration
function processUser(user: User): void {
  // ...
}

// ❌ BAD: Named function expression
const processUser = function (user: User): void {
  // ...
};

// ✅ GOOD: Arrow function
const processUser = (user: User): void => {
  // ...
};
```

### 7. Accept `unknown` Then Cast

```typescript
// ❌ BAD: Accept unknown and immediately cast — bypasses all type checking
const processGroup = (data: unknown) => {
  const typed = data as { name: string; items: Item[] };
  return typed.items;
};

// ✅ GOOD: Define a constraint type and use generic extends
// T can have additional properties beyond GroupData — extends handles that
type GroupData = {
  name: string;
  items: Item[];
};

const processGroup = <T extends GroupData>(data: T): Item[] => {
  return data.items; // Direct access — no cast needed for named properties
};
```

### 8. Magic Strings for Control Flow

```typescript
// ❌ BAD: Branching on a human-readable message string
// Fragile — breaks silently if the message text changes
if (result.reason === "Task already in Done state") {
  skipTask(result.taskId);
}

// ✅ GOOD: Discriminated union with a status field
type UpdateResult =
  | { success: true; status: "moved" | "already_done" }
  | { success: false; reason: string };

// Type-safe — compiler catches typos and ensures exhaustive handling
if (result.success && result.status === "already_done") {
  skipTask(result.taskId);
}
```

**Rule**: Never branch on `.message`, `.reason`, or other human-readable strings. Use a discriminated union with a literal status/kind field instead. Strings are for humans; literal types are for control flow.

---

## Quick Reference

### Type vs Interface Decision

```
Need union?           → type
Need intersection?    → type
Need mapped type?     → type
Need tuple?           → type
Need function type?   → type
Need declaration merge? → interface (rare)
Default choice?       → type
```

### Common Patterns

```typescript
// Nullable
type MaybeUser = User | null;

// Optional
type PartialUser = Partial<User>;

// Required
type CompleteUser = Required<User>;

// Readonly
type FrozenUser = Readonly<User>;

// Async return
type AsyncUser = Promise<User>;

// Array
type Users = User[];
type ReadonlyUsers = readonly User[];
```

### Latest Dependencies (2024+)

```json
{
  "devDependencies": {
    "typescript": "^5.4",
    "eslint": "^9.0",
    "typescript-eslint": "^8.0",
    "prettier": "^3.2",
    "eslint-config-prettier": "^9.1"
  }
}
```

---
