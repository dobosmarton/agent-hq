# Project Skills

This directory contains project-specific coding standards and best practices for the agent-hq project.

## What are Skills?

Skills are markdown documents that define coding standards, patterns, and best practices. They are automatically loaded by the agent runner and injected into Claude's context when planning and implementing tasks.

## Skill Hierarchy

- **Global skills**: Organization-wide standards in `agent-runner/skills/global/`
- **Project skills**: Project-specific standards in `.claude/skills/` (this directory)

Project skills override global skills with the same `id`, allowing you to customize standards for this specific project.

## Creating a New Skill

1. Create a `.md` file in this directory
2. Add metadata comments at the top:

```markdown
<!-- skill:name = Your Skill Name -->
<!-- skill:description = Brief description of what this skill covers -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 70 -->
<!-- skill:appliesTo = both -->

# Your Skill Name

## Section 1
Content here...

## Section 2
More content...
```

### Metadata Fields

- **name**: Display name of the skill
- **description**: Brief description (one sentence)
- **category**: One of: `naming-conventions`, `error-handling`, `testing`, `security`, `documentation`, `architecture`, `best-practices`, `patterns`, `commit-standards`, `api-usage`
- **priority**: Number 0-100 (higher = more important, will be included first if maxSkillsPerPrompt is reached)
- **appliesTo**: When to apply this skill
  - `planning` - Only during planning phase
  - `implementation` - Only during implementation phase
  - `both` - Both phases (default)
- **enabled**: Set to `false` to temporarily disable a skill (default: `true`)

## Skill Examples

See existing skills in:
- Global: `agent-runner/skills/global/`
- Project: `.claude/skills/` (this directory)

## How Skills are Used

When an agent starts working on a task:

1. Agent runner loads global skills from `agent-runner/skills/global/`
2. Agent runner loads project skills from `.claude/skills/`
3. Project skills override global skills with the same ID
4. Skills are filtered by phase (planning vs implementation)
5. Top N skills (by priority) are selected
6. Skills are formatted as markdown and injected into Claude's prompt

## Best Practices

- **Keep skills focused**: Each skill should cover one specific topic
- **Use examples**: Include code examples to illustrate patterns
- **Set appropriate priority**: Higher priority skills are included first
- **Update regularly**: Keep skills aligned with evolving project needs
- **Don't duplicate global skills**: Only create project skills when you need to override or add project-specific guidance

## Disabling Skills

To temporarily disable a skill without deleting it:

```markdown
<!-- skill:name = My Skill -->
<!-- skill:enabled = false -->
```

## Viewing Active Skills

To see which skills are currently loaded:

```bash
npm run skills:list
```

To view a specific skill's content:

```bash
npm run skills:show <skill-id>
```
