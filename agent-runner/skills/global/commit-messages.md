<!-- skill:name = Git Commit Messages -->
<!-- skill:description = Standards for writing clear, consistent git commit messages -->
<!-- skill:category = commit-standards -->
<!-- skill:priority = 90 -->
<!-- skill:appliesTo = implementation -->

# Git Commit Messages

## Standards

When creating commits, follow these conventions:

1. **Prefix with task ID**: Always start commit messages with the task identifier (e.g., `AGENTHQ-8:`)
2. **Use imperative mood**: Write as if giving a command (e.g., "Add feature" not "Added feature")
3. **Keep first line under 72 characters**: Be concise in the summary
4. **Separate subject from body**: Use a blank line between summary and detailed description
5. **Focus on the "why"**: Explain motivation and context, not just what changed

## Format

```
TASK-ID: Concise summary under 72 chars

Optional detailed explanation of the changes, including:
- Why the change was necessary
- What problem it solves
- Any important implementation details
- References to related issues or docs

Co-Authored-By: Claude Sonnet 4.5 <noreply@anthropic.com>
```

## Examples

**Good:**

```
AGENTHQ-8: Add skills system for coding standards

Implements file-based skills loader that reads markdown files from
global and project-level directories. Project skills override global
skills by ID, allowing customization while maintaining defaults.

Includes caching layer to avoid repeated file I/O on each agent spawn.
```

**Bad:**

```
updated some files
```

**Bad:**

```
AGENTHQ-8: Added the skills loader and formatter and also updated the config schema and modified the prompt builder to inject skills
```

## When to Commit

- Commit after completing each logical unit of work
- Don't commit broken code or code that fails CI checks
- Push after every significant milestone
