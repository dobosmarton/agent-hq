---
id: architecture-review
name: Architecture Review
description: Reviews code for architectural patterns, modularity, and design quality
category: architecture
priority: 70
applies_to: implementation
---

# Architecture Review

## Purpose

This skill guides the review agent to evaluate architectural decisions, modularity, separation of concerns, and overall design quality.

## Review Checklist

### Modularity

- **Single Responsibility**: Each module/function has one clear purpose
- **Low Coupling**: Modules depend on abstractions, not implementations
- **High Cohesion**: Related functionality grouped together
- **Clear Boundaries**: Well-defined interfaces between modules

### Separation of Concerns

- **Layer Separation**: Business logic, data access, and presentation separated
- **No Mixed Concerns**: Don't mix unrelated functionality
- **Clear Dependencies**: Dependencies flow in one direction
- **Interface Segregation**: Small, focused interfaces

### Design Patterns

- **Appropriate Patterns**: Use patterns that fit the problem
- **No Over-Engineering**: Avoid unnecessary abstraction
- **Consistent Patterns**: Follow established patterns in the codebase
- **SOLID Principles**: Follow Single Responsibility, Open/Closed, etc.

### Code Organization

- **Logical Structure**: Files and folders organized by feature/domain
- **Clear Naming**: Modules named after their purpose
- **Appropriate Scope**: Functions and variables have appropriate scope
- **No Circular Dependencies**: Avoid circular module dependencies

### API Design

- **Consistent Interfaces**: Similar operations have similar signatures
- **Clear Contracts**: Function signatures clearly express intent
- **Error Handling**: Consistent error handling strategy
- **Backward Compatibility**: Consider API versioning for breaking changes

### Type Safety

- **Explicit Types**: All functions have explicit parameter and return types
- **No `any` Types**: Use specific types or discriminated unions
- **Type Guards**: Use type narrowing for runtime type checking
- **Shared Types**: Reuse types across modules

### Functional Programming

- **Pure Functions**: Functions without side effects where possible
- **Immutability**: Prefer const and readonly
- **Function Composition**: Build complex logic from simple functions
- **Avoid Classes**: Use functions and types over classes

### Data Flow

- **Unidirectional Flow**: Data flows in predictable direction
- **Explicit State**: State changes are explicit and traceable
- **No Global State**: Avoid global mutable state
- **Clear Data Models**: Well-defined data structures

## Common Issues to Check

### Critical Issues

- Circular dependencies between modules
- Tight coupling to implementation details
- Global mutable state
- Mixed business logic and infrastructure code

### Major Issues

- Violation of Single Responsibility Principle
- Overly complex functions (>50 lines)
- Unclear module boundaries
- Inconsistent error handling
- Missing type definitions

### Minor Issues

- Inconsistent naming conventions
- Unnecessary abstraction layers
- Deeply nested code
- Large parameter lists (>4 parameters)

## Examples

### ❌ Bad: Mixed Concerns

```typescript
const processOrder = async (orderId: string) => {
  // Mixing data access, business logic, and formatting
  const order = await db.query("SELECT * FROM orders WHERE id = ?", [orderId]);
  const total = order.items.reduce((sum, item) => sum + item.price, 0);
  const tax = total * 0.1;
  const formatted = `Order ${orderId}: $${total + tax}`;
  await sendEmail(order.email, formatted);
  return formatted;
};
```

### ✅ Good: Separated Concerns

```typescript
// Data access layer
const getOrder = async (orderId: string): Promise<Order> => {
  return db.orders.findUnique({ where: { id: orderId } });
};

// Business logic layer
const calculateOrderTotal = (order: Order): number => {
  const subtotal = order.items.reduce((sum, item) => sum + item.price, 0);
  return subtotal * 1.1; // includes tax
};

// Presentation layer
const formatOrder = (orderId: string, total: number): string => {
  return `Order ${orderId}: $${total}`;
};

// Orchestration
const processOrder = async (orderId: string): Promise<string> => {
  const order = await getOrder(orderId);
  const total = calculateOrderTotal(order);
  const formatted = formatOrder(orderId, total);
  await sendOrderEmail(order.email, formatted);
  return formatted;
};
```

### ❌ Bad: Tight Coupling

```typescript
class UserService {
  private db = new PostgresDatabase(); // Tightly coupled to Postgres

  async getUser(id: string) {
    return this.db.query("SELECT * FROM users WHERE id = ?", [id]);
  }
}
```

### ✅ Good: Dependency Injection

```typescript
type UserRepository = {
  findById: (id: string) => Promise<User | null>;
};

const createUserService = (repository: UserRepository) => ({
  getUser: (id: string) => repository.findById(id),
});
```

### ❌ Bad: Large Function

```typescript
const processUser = (data: unknown) => {
  // 100+ lines of validation, transformation, saving, emailing...
};
```

### ✅ Good: Small, Focused Functions

```typescript
const validateUser = (data: unknown): User => UserSchema.parse(data);
const normalizeUser = (user: User): User => ({
  ...user,
  email: user.email.toLowerCase(),
});
const saveUser = async (user: User): Promise<void> =>
  db.users.create({ data: user });
const notifyUser = async (user: User): Promise<void> =>
  sendWelcomeEmail(user.email);

const processUser = async (data: unknown): Promise<void> => {
  const user = validateUser(data);
  const normalized = normalizeUser(user);
  await saveUser(normalized);
  await notifyUser(normalized);
};
```

## Review Output Format

When finding architectural issues, include:

- **Severity**: critical, major, minor
- **Category**: architecture
- **Description**: Clear explanation of the design issue
- **Suggestion**: How to improve the design
- **Impact**: What problems the current design could cause
