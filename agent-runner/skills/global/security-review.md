---
id: security-review
name: Security Review
description: Reviews code for security vulnerabilities and best practices
category: security
priority: 90
applies_to: implementation
---

# Security Review

## Purpose

This skill guides the review agent to identify security vulnerabilities and ensure code follows security best practices.

## Review Checklist

### Input Validation

- **User Input Sanitization**: All user inputs must be validated and sanitized
- **Type Validation**: Use strict type checking and schema validation (Zod)
- **Boundary Checks**: Validate ranges, lengths, and formats
- **Reject Invalid Data**: Fail fast on invalid input, don't attempt to fix

### Authentication & Authorization

- **Authentication Checks**: Verify user identity before sensitive operations
- **Authorization Checks**: Verify user permissions for requested actions
- **Session Management**: Use secure session tokens with proper expiration
- **Password Handling**: Never log or expose passwords, use bcrypt/argon2

### Data Protection

- **Sensitive Data**: Encrypt sensitive data at rest and in transit
- **PII Handling**: Follow privacy regulations for personal data
- **Database Security**: Use parameterized queries, never string concatenation
- **Secrets Management**: No hardcoded secrets, use environment variables

### Injection Prevention

- **SQL Injection**: Always use parameterized queries or ORM
- **NoSQL Injection**: Validate and sanitize NoSQL query parameters
- **Command Injection**: Never pass user input to shell commands
- **XSS Prevention**: Escape output, use Content Security Policy

### API Security

- **Rate Limiting**: Implement rate limits on API endpoints
- **CORS Configuration**: Restrict cross-origin requests appropriately
- **HTTPS Only**: Enforce HTTPS for all external communication
- **API Keys**: Rotate keys regularly, use environment variables

### Timing Attacks

- **Constant-Time Comparison**: Use `crypto.timingSafeEqual()` for secrets
- **HMAC Verification**: Use constant-time comparison for signatures
- **Token Comparison**: Never use `===` for comparing tokens or secrets

### Dependency Security

- **Known Vulnerabilities**: Check dependencies for known CVEs
- **Minimal Dependencies**: Only include necessary dependencies
- **Version Pinning**: Pin dependency versions in package.json
- **Regular Updates**: Keep dependencies up to date

### Error Handling

- **No Information Leakage**: Don't expose stack traces to users
- **Generic Error Messages**: Return generic errors to clients
- **Detailed Logging**: Log full errors server-side for debugging
- **Fail Securely**: On error, deny access rather than allow

## Common Vulnerabilities to Check

### Critical Issues

- Hardcoded secrets (API keys, passwords, tokens)
- SQL injection vulnerabilities
- Command injection vulnerabilities
- Missing authentication/authorization checks
- Insecure password storage
- Timing attack vulnerabilities in secret comparison

### Major Issues

- Missing input validation
- Inadequate error handling exposing sensitive info
- Insecure session management
- Missing rate limiting on sensitive endpoints
- Unencrypted sensitive data transmission
- Vulnerable dependencies

### Minor Issues

- Weak random number generation
- Missing security headers
- Overly permissive CORS settings
- Insufficient logging of security events
- Missing HTTPS enforcement

## Examples

### ❌ Bad: Vulnerable to SQL Injection

```typescript
const getUser = (userId: string) => {
  return db.query(`SELECT * FROM users WHERE id = '${userId}'`);
};
```

### ✅ Good: Parameterized Query

```typescript
const getUser = (userId: string) => {
  return db.query("SELECT * FROM users WHERE id = ?", [userId]);
};
```

### ❌ Bad: Timing Attack Vulnerable

```typescript
const verifySignature = (expected: string, actual: string): boolean => {
  return expected === actual; // Leaks timing information
};
```

### ✅ Good: Constant-Time Comparison

```typescript
import { timingSafeEqual } from "node:crypto";

const verifySignature = (expected: string, actual: string): boolean => {
  if (expected.length !== actual.length) {
    return false;
  }
  return timingSafeEqual(Buffer.from(expected), Buffer.from(actual));
};
```

### ❌ Bad: Hardcoded Secret

```typescript
const apiKey = "sk_live_12345abcdef";
```

### ✅ Good: Environment Variable

```typescript
const apiKey = process.env.API_KEY;
if (!apiKey) {
  throw new Error("API_KEY environment variable required");
}
```

## Review Output Format

When finding security issues, include:

- **Severity**: critical, major, minor
- **Category**: security
- **Description**: Clear explanation of the vulnerability
- **Suggestion**: How to fix it with code example
- **File & Line**: Exact location of the issue
