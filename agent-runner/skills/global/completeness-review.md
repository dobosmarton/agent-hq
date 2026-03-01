---
id: completeness-review
name: Completeness Review
description: Reviews code to ensure it meets all acceptance criteria and requirements
category: completeness
priority: 95
applies_to: implementation
---

# Completeness Review

## Purpose

This skill guides the review agent to verify that the implementation fully meets the task requirements and acceptance criteria.

## Review Checklist

### Acceptance Criteria

- **All Criteria Met**: Every acceptance criterion is implemented
- **No Partial Implementation**: Features are complete, not half-done
- **Edge Cases Handled**: Requirements account for edge cases
- **Error Scenarios**: Failure cases are handled as specified

### Feature Completeness

- **Core Functionality**: Main features work as described
- **Supporting Features**: Helper features and utilities included
- **Configuration**: All configuration options implemented
- **Documentation**: Code changes include necessary docs

### Requirements Coverage

- **Functional Requirements**: All specified behavior implemented
- **Non-Functional Requirements**: Performance, security, etc. met
- **Integration Points**: All integrations with other systems work
- **Data Requirements**: Required data structures and fields present

### User Stories

- **User Goals**: Implementation enables user to accomplish goals
- **User Flow**: Complete user workflows are supported
- **Error Messages**: Clear, helpful error messages for users
- **Success Feedback**: Users get confirmation of successful actions

## Common Issues to Check

### Critical Issues

- Core acceptance criteria not implemented
- Required functionality is missing
- Implementation doesn't match specification
- Breaking existing functionality not mentioned in requirements

### Major Issues

- Partial implementation of features
- Missing error handling for specified scenarios
- Incomplete configuration options
- Missing required validation

### Minor Issues

- Missing helpful error messages
- Incomplete logging for debugging
- Missing edge case handling not in requirements
- Suboptimal UX not specified in requirements

## Examples

### Task: "Implement user registration with email validation"

**Acceptance Criteria:**

1. ✅ User can register with email and password
2. ✅ Email must be validated with confirmation email
3. ✅ Password must be at least 8 characters
4. ❌ User receives welcome email after registration (MISSING!)
5. ✅ Registration fails if email already exists

### ❌ Bad: Incomplete Implementation

```typescript
const registerUser = async (email: string, password: string) => {
  // Only validates password length, missing email validation!
  if (password.length < 8) {
    throw new Error("Password too short");
  }

  const user = await db.users.create({ data: { email, password } });
  // Missing: email confirmation, welcome email, duplicate check
  return user;
};
```

### ✅ Good: Complete Implementation

```typescript
const registerUser = async (email: string, password: string) => {
  // Validate email format
  if (!isValidEmail(email)) {
    throw new Error("Invalid email format");
  }

  // Validate password length (AC #3)
  if (password.length < 8) {
    throw new Error("Password must be at least 8 characters");
  }

  // Check for duplicate email (AC #5)
  const existing = await db.users.findUnique({ where: { email } });
  if (existing) {
    throw new Error("Email already registered");
  }

  // Create user (AC #1)
  const user = await db.users.create({
    data: {
      email,
      password: await hashPassword(password),
      emailConfirmed: false,
    },
  });

  // Send confirmation email (AC #2)
  await sendConfirmationEmail(user.email, user.confirmationToken);

  // Send welcome email (AC #4)
  await sendWelcomeEmail(user.email);

  return user;
};
```

## Review Process

1. **Extract Acceptance Criteria**: Identify all ACs from task description
2. **Map to Code**: Find where each AC is implemented
3. **Verify Implementation**: Check that code fully satisfies each AC
4. **Check for Gaps**: Identify any missing or partial implementations
5. **Report Findings**: Clearly state which ACs are met/missing

## Review Output Format

When finding completeness issues, include:

- **Severity**: critical (core AC missing), major (partial implementation), minor (edge case)
- **Category**: completeness
- **Description**: Which acceptance criterion is not met
- **Missing**: What specific functionality is missing
- **Suggestion**: What needs to be added to complete the implementation
