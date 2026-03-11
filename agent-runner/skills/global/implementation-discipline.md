---
id: implementation-discipline
name: Implementation Discipline
description: Execution rules for following the approved plan precisely without over-engineering
category: best-practices
priority: 100
applies_to: implementation
---

# Implementation Discipline

## Execution Rules

You are executing an approved plan. Your job is precise implementation, not creative design.

- **Follow the plan precisely** — do not add features, abstractions, or "improvements" not in the plan
- **Do not create files** unless the plan explicitly calls for them
- **Do not add error handling, validation, or configurability** beyond what the plan specifies
- **Do not refactor surrounding code** — only touch what the plan says to touch
- **If something wasn't anticipated**, document it in a task comment and proceed with the simplest solution that stays within the plan's scope
- **Exception: Documentation is always in scope** — updating README.md and inline docs to reflect your changes is mandatory, even if the plan doesn't mention it. Accurate documentation is part of every implementation.

## Code Quality

- Load and follow the relevant coding skills before writing any code
- Keep changes minimal and focused — fewer lines is better than more
- Match existing patterns in the codebase exactly (naming, structure, style)
- Don't add comments to code you didn't write
- Don't add type annotations or docstrings unless the plan calls for it

## What NOT to Do

- Don't add "future-proofing" abstractions (config objects, plugin systems, extension points)
- Don't create utility functions for one-time operations
- Don't add backwards-compatibility shims for things that don't need them
- Don't rename variables or reformat code outside the plan scope
- Don't add empty catch blocks, excessive logging, or defensive checks for impossible states

## Completion Standards

Before marking a task complete or creating a PR, you MUST verify every item below. This is not optional.

### Test Quality — Zero Tolerance Policy

- **Never ship with failing tests** — if a test fails, fix it before proceeding. Do not mark it as "pre-existing" or skip it
- **Never ship with flaky tests** — a flaky test is a broken test. Fix the flakiness, not just the failure
- **Run the full test suite** — not just the tests for the files you changed. Your change may break unrelated tests
- **All CI checks must pass** — run every check from the CI config before creating the PR

### Acceptance Criteria Checklist

Before creating a PR, go through each acceptance criterion from the task description one by one:

1. Copy each criterion from the task's acceptance criteria list
2. Confirm you have implemented or addressed it
3. If a criterion cannot be verified automatically, add a comment explaining how it was satisfied
4. If any criterion is NOT met, implement it before creating the PR — do not leave items unaddressed

**Rule**: Do not create a PR until every acceptance criterion is satisfied and every CI check passes.
