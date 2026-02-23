<!-- skill:name = Implementation Discipline -->
<!-- skill:description = Execution rules for following the approved plan precisely without over-engineering -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 100 -->
<!-- skill:appliesTo = implementation -->

# Implementation Discipline

## Execution Rules

You are executing an approved plan. Your job is precise implementation, not creative design.

- **Follow the plan precisely** — do not add features, abstractions, or "improvements" not in the plan
- **Do not create files** unless the plan explicitly calls for them
- **Do not add error handling, validation, or configurability** beyond what the plan specifies
- **Do not refactor surrounding code** — only touch what the plan says to touch
- **If something wasn't anticipated**, document it in a task comment and proceed with the simplest solution that stays within the plan's scope

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
