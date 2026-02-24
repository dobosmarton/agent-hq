# Agent Runner

Autonomous agent orchestrator that polls [Plane](https://plane.so) for tasks and works on them via the [Claude Code SDK](https://docs.anthropic.com/en/docs/claude-code/sdk). Each task goes through a two-phase workflow — planning then implementation — with budget enforcement, retry logic, and Telegram notifications.

## Architecture

```
Plane (task board)
  │
  ├── Discovery loop (30s) ── polls for "agent"-labeled tasks in "todo" state
  │                            claims task → enqueues
  │
  └── Processing loop (15s) ── dequeues task → spawns agent
                                │
                                ├── Phase 1: Planning
                                │   Read-only exploration, feasibility check,
                                │   posts plan comment, moves to "plan_review"
                                │
                                └── Phase 2: Implementation
                                    Executes plan in git worktree, runs CI,
                                    creates PR, moves to "in_review"
```

Each agent runs in an isolated git worktree so concurrent tasks don't conflict. The runner persists state across restarts and recovers orphaned agents on startup.

## Quick Start

```bash
cp env.example .env    # fill in API keys
cp config.json config.local.json  # adjust project paths

npm install
npm run start:local
```

### Docker

```bash
docker compose up -d --build
```

The Docker image includes Node 22, git, GitHub CLI, and Claude Code CLI. It uses host networking and mounts local repos from `/home/deploy/repos`.

## Configuration

### Environment Variables

| Variable             | Required | Description                                               |
| -------------------- | -------- | --------------------------------------------------------- |
| `PLANE_API_KEY`      | Yes      | Plane API token                                           |
| `ANTHROPIC_API_KEY`  | Yes      | Anthropic API key for Claude Code SDK                     |
| `GITHUB_PAT`         | Yes      | GitHub PAT for git push in worktrees                      |
| `TELEGRAM_BOT_TOKEN` | No       | Telegram bot token (notifications disabled if missing)    |
| `TELEGRAM_CHAT_ID`   | No       | Telegram chat ID for notifications                        |
| `CONFIG_PATH`        | No       | Path to config file (default: `./config.json`)            |
| `STATE_PATH`         | No       | Path to state file (default: `./state/runner-state.json`) |

### config.json

```jsonc
{
  "plane": {
    "baseUrl": "https://plane.example.com/api/v1",
    "workspaceSlug": "projects",
  },
  "projects": {
    "HQ": {
      "repoPath": "/home/deploy/repos/my-project",
      "repoUrl": "https://github.com/org/my-project",
      "defaultBranch": "main", // optional, defaults to "main"
      "ciChecks": ["npm test"], // optional, overrides workflow detection
    },
  },
  "agent": {
    "maxConcurrent": 2, // max parallel agents
    "maxBudgetPerTask": 5, // USD per task
    "maxDailyBudget": 20, // USD per day
    "maxTurns": 200, // max turns per phase
    "pollIntervalMs": 30000,
    "spawnDelayMs": 15000,
    "maxRetries": 2,
    "retryBaseDelayMs": 60000,
    "labelName": "agent",
    "skills": {
      "enabled": true,
      "maxSkillsPerPrompt": 10,
      "globalSkillsPath": "skills/global",
    },
  },
}
```

## Two-Phase Workflow

### Planning Phase

- Budget: $2.00, max 50 turns
- Read-only tools only (no file writes, no bash)
- Agent explores the codebase, assesses feasibility, and writes a detailed plan
- Posts a plan comment with `<!-- AGENT_PLAN -->` marker
- Moves task to "plan_review" state for human approval

### Implementation Phase

- Budget: configurable per-task limit, max turns configurable
- Full tool access (Read, Write, Edit, Bash, Glob, Grep)
- Dangerous commands blocked: `rm -rf`, `git push --force`, `docker`, `curl`, `wget`, `sudo`
- Agent follows the approved plan, runs CI checks, commits with `{taskId}:` prefix
- Creates a PR via `gh pr create`, attaches link to task
- Moves task to "in_review" state

### Task Iteration & Resume

The agent can now **resume work on existing tasks** instead of always starting fresh:

**How it works:**

- When a task moves to "Todo", the agent checks if a branch already exists (naming: `agent/{PROJECT-ID}`)
- If found, the agent:
  - Retrieves all comments to understand previous work and feedback
  - Analyzes git history (commit log, diff) to see what was done
  - Identifies **new user comments** since the last agent work session
  - Posts a "resuming work" comment summarizing context
  - Continues implementation incorporating new feedback

**For users:**

- Move a task back to "Todo" to have the agent iterate on it
- Add comments with updated requirements or direction changes
- The agent treats your **latest feedback as the source of truth**
- Works for both planning and implementation phases

**Resume comment format:**

```html
✅ Resuming work on this task Found existing branch: agent/PROJECT-42 Previous
work completed: 5 commit(s) New feedback from comments: - [2024-02-20] User
requested feature X instead of Y - [2024-02-21] Clarified acceptance criteria
for feature Z Plan for this session: - Review existing work and new feedback -
Update implementation based on new requirements - Complete remaining acceptance
criteria
```

### Retries

- Rate-limited and unknown errors retry with exponential backoff
- Crashes retry if attempts remain
- Budget-exceeded tasks are re-queued for later (daily reset)
- Max 2 retries by default

## MCP Tools

Agents get access to a custom MCP server (`agent-plane-tools`) with these tools:

| Tool                      | Description                                  |
| ------------------------- | -------------------------------------------- |
| `update_task_status`      | Move task to plan_review, in_review, or done |
| `add_task_comment`        | Post HTML progress comment                   |
| `add_task_link`           | Attach link (e.g., PR URL) to task           |
| `list_task_comments`      | Retrieve all comments on current task        |
| `list_labels`             | List project labels                          |
| `add_labels_to_task`      | Add labels (case-insensitive)                |
| `remove_labels_from_task` | Remove labels                                |
| `load_skill`              | Load full content of a skill by ID           |
| `create_skill`            | Create a new skill file for future agents    |

## Skills System

Skills are markdown files with metadata that get injected into agent prompts. They encode coding standards, best practices, and lessons learned.

### Skill File Format

```markdown
<!-- skill:name = TypeScript Best Practices -->
<!-- skill:description = TypeScript coding standards -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->
<!-- skill:appliesTo = both -->

# TypeScript Best Practices

Content here...
```

### Metadata Fields

| Field         | Values                                                                                                                                             | Default                   |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------- |
| `name`        | Any string                                                                                                                                         | filename                  |
| `description` | Any string                                                                                                                                         | "No description provided" |
| `category`    | naming-conventions, error-handling, testing, security, documentation, architecture, best-practices, patterns, commit-standards, api-usage, learned | best-practices            |
| `priority`    | 0-100 (higher = more important)                                                                                                                    | 50                        |
| `appliesTo`   | planning, implementation, both                                                                                                                     | both                      |
| `enabled`     | true, false                                                                                                                                        | true                      |

### Skill Locations

| Location                         | Scope                           | Example                              |
| -------------------------------- | ------------------------------- | ------------------------------------ |
| `skills/global/`                 | All projects                    | Coding standards, commit conventions |
| `skills/global/learned/`         | All projects (auto-generated)   | Patterns discovered by agents        |
| `<repo>/.claude/skills/`         | Single project                  | Project-specific conventions         |
| `<repo>/.claude/skills/learned/` | Single project (auto-generated) | Project-specific lessons             |

- Project skills override global skills with the same filename
- Skills are cached for 5 minutes
- Sorted by priority (descending), limited to `maxSkillsPerPrompt`
- Filtered by phase (planning skills won't appear during implementation, and vice versa)

### Agent-Generated Skills

Agents can create new skill files at runtime via the `create_skill` MCP tool. These are written to the `learned/` subdirectory (global or project scope) and become available to future agents immediately. Global learned skills are git-ignored; project learned skills can be committed to the repo.

### Skills CLI

```bash
npm run skills:list       # list all loaded skills
npm run skills:show       # show skill details
npm run skills:validate   # validate skill file format
```

## Scripts

```bash
npm start           # run with config.json
npm run start:local # run with config.local.json + .env
npm run dev         # watch mode
npm run build       # type-check (tsc --noEmit)
npm test            # run tests (vitest)
npm run format      # format with prettier
```

## Project Structure

```
agent-runner/
├── src/
│   ├── index.ts              # Entry point, discovery + processing loops
│   ├── config.ts             # Zod config schema
│   ├── types.ts              # Core types (AgentTask, RunnerState, etc.)
│   ├── agent/
│   │   ├── runner.ts         # Spawns Claude Code agent via SDK
│   │   ├── phase.ts          # Planning vs implementation detection
│   │   ├── manager.ts        # Active agents, budget, worktree lifecycle
│   │   ├── prompt-builder.ts # Constructs phase-specific prompts
│   │   ├── mcp-tools.ts      # Custom MCP server with Plane tools
│   │   └── ci-discovery.ts   # Reads .github/workflows/ for CI config
│   ├── plane/
│   │   ├── client.ts         # Plane API wrapper
│   │   └── types.ts          # Plane API response schemas
│   ├── poller/
│   │   └── task-poller.ts    # Discovers + claims agent-labeled tasks
│   ├── queue/
│   │   └── task-queue.ts     # FIFO queue with retry scheduling
│   ├── state/
│   │   └── persistence.ts    # JSON state persistence
│   ├── telegram/
│   │   ├── notifier.ts       # Telegram notifications
│   │   └── bridge.ts         # HTTP answer server for agent questions
│   ├── skills/
│   │   ├── types.ts          # Skill schemas (Zod)
│   │   ├── loader.ts         # Loads + caches skills from disk
│   │   ├── formatter.ts      # Formats skills for prompts / CLI
│   │   ├── creator.ts        # Creates new skill files
│   │   └── cli.ts            # Skills CLI commands
│   └── worktree/
│       └── manager.ts        # Git worktree create/remove
├── skills/
│   └── global/               # Global skill files
├── Dockerfile
├── docker-compose.yml
├── config.json
├── env.example
└── tsconfig.json
```
