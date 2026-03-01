---
id: performance-review
name: Performance Review
description: Reviews code for performance issues and optimization opportunities
category: performance
priority: 60
applies_to: implementation
---

# Performance Review

## Purpose

This skill guides the review agent to identify performance bottlenecks and optimization opportunities.

## Review Checklist

### Database Queries

- **N+1 Queries**: Avoid separate queries in loops
- **SELECT \* Queries**: Only select needed columns
- **Missing Indexes**: Check for queries on unindexed columns
- **Eager Loading**: Load related data in single query when needed
- **Query Pagination**: Paginate large result sets

### Algorithm Complexity

- **Time Complexity**: Avoid O(n²) or worse when O(n log n) is possible
- **Space Complexity**: Consider memory usage for large datasets
- **Unnecessary Work**: Don't compute values that aren't used
- **Early Termination**: Exit loops early when result is found

### API Calls

- **Sequential Calls**: Run independent calls in parallel
- **Unnecessary Calls**: Cache results, avoid redundant requests
- **Batch Operations**: Batch multiple operations when API supports it
- **Request Size**: Minimize request/response payload sizes

### Data Structures

- **Appropriate Choice**: Use Map/Set instead of Array for lookups
- **Immutable Operations**: Be aware of copy costs with spread operator
- **Large Arrays**: Consider streaming for large datasets
- **Object Lookups**: Use Map for dynamic keys instead of objects

### Caching

- **Repeated Computations**: Cache expensive calculations
- **API Responses**: Cache external API responses with TTL
- **Memoization**: Memoize pure function results
- **Cache Invalidation**: Implement proper cache invalidation strategy

### Resource Management

- **Memory Leaks**: Clean up event listeners, timers, connections
- **Connection Pooling**: Reuse database/HTTP connections
- **Stream Processing**: Use streams for large files
- **Lazy Loading**: Load resources only when needed

### Async Operations

- **Blocking Code**: Avoid synchronous I/O in async context
- **Promise.all**: Run independent promises concurrently
- **Parallel Execution**: Use concurrency for independent operations
- **Async Iteration**: Use for-await-of for async iterables

## Common Issues to Check

### Critical Issues

- N+1 database query problems
- Synchronous I/O blocking event loop
- Missing database indexes on queried columns
- Memory leaks from unclosed connections
- Quadratic or worse time complexity on large datasets

### Major Issues

- Sequential API calls that could be parallel
- Missing caching for expensive operations
- Inefficient algorithms (using wrong data structure)
- Loading entire large datasets into memory
- Missing pagination on list endpoints

### Minor Issues

- Unnecessary object/array copies
- Redundant computations in loops
- Missing memoization for pure functions
- Verbose logging in hot paths
- Unoptimized regular expressions

## Examples

### ❌ Bad: N+1 Query Problem

```typescript
const getOrdersWithItems = async (userId: string) => {
  const orders = await db.query("SELECT * FROM orders WHERE user_id = ?", [
    userId,
  ]);

  for (const order of orders) {
    // Separate query for each order!
    order.items = await db.query("SELECT * FROM items WHERE order_id = ?", [
      order.id,
    ]);
  }

  return orders;
};
```

### ✅ Good: Single Query with JOIN

```typescript
const getOrdersWithItems = async (userId: string) => {
  return db.query(
    `
    SELECT
      orders.*,
      items.id as item_id,
      items.name,
      items.price
    FROM orders
    LEFT JOIN items ON items.order_id = orders.id
    WHERE orders.user_id = ?
  `,
    [userId],
  );
};
```

### ❌ Bad: Sequential API Calls

```typescript
const getUserData = async (userId: string) => {
  const profile = await fetchProfile(userId);
  const orders = await fetchOrders(userId);
  const preferences = await fetchPreferences(userId);
  return { profile, orders, preferences };
};
```

### ✅ Good: Parallel API Calls

```typescript
const getUserData = async (userId: string) => {
  const [profile, orders, preferences] = await Promise.all([
    fetchProfile(userId),
    fetchOrders(userId),
    fetchPreferences(userId),
  ]);
  return { profile, orders, preferences };
};
```

### ❌ Bad: Array for Lookups

```typescript
const findUser = (users: User[], id: string): User | undefined => {
  return users.find((u) => u.id === id); // O(n) lookup
};
```

### ✅ Good: Map for Lookups

```typescript
const createUserMap = (users: User[]): Map<string, User> => {
  return new Map(users.map((u) => [u.id, u]));
};

const findUser = (userMap: Map<string, User>, id: string): User | undefined => {
  return userMap.get(id); // O(1) lookup
};
```

### ❌ Bad: Expensive Repeated Computation

```typescript
const processItems = (items: Item[]) => {
  for (const item of items) {
    const expensive = computeExpensiveValue(item.category); // Computed every iteration!
    item.value = expensive * item.quantity;
  }
};
```

### ✅ Good: Cache Results

```typescript
const processItems = (items: Item[]) => {
  const cache = new Map<string, number>();

  for (const item of items) {
    let expensive = cache.get(item.category);
    if (expensive === undefined) {
      expensive = computeExpensiveValue(item.category);
      cache.set(item.category, expensive);
    }
    item.value = expensive * item.quantity;
  }
};
```

## Review Output Format

When finding performance issues, include:

- **Severity**: critical (blocks production), major (noticeable impact), minor (optimization opportunity)
- **Category**: performance
- **Description**: What the performance issue is
- **Impact**: Expected performance impact (e.g., "O(n²) for 10k items = 100M operations")
- **Suggestion**: How to optimize with code example
