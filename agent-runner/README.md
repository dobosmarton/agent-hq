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

| Variable                | Required | Description                                               |
| ----------------------- | -------- | --------------------------------------------------------- |
| `PLANE_API_KEY`         | Yes      | Plane API token                                           |
| `ANTHROPIC_API_KEY`     | Yes      | Anthropic API key for Claude Code SDK                     |
| `GITHUB_PAT`            | Yes      | GitHub PAT for git push in worktrees                      |
| `GITHUB_WEBHOOK_SECRET` | No       | GitHub webhook secret for signature validation            |
| `TELEGRAM_BOT_TOKEN`    | No       | Telegram bot token (notifications disabled if missing)    |
| `TELEGRAM_CHAT_ID`      | No       | Telegram chat ID for notifications                        |
| `CONFIG_PATH`           | No       | Path to config file (default: `./config.json`)            |
| `STATE_PATH`            | No       | Path to state file (default: `./state/runner-state.json`) |

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
  "webhook": {
    "enabled": true, // enable GitHub webhook server
    "port": 3000, // webhook server port
    "path": "/webhooks/github/pr", // webhook endpoint path
    "taskIdPattern": "([A-Z]+-\\d+)", // regex to match task IDs
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

### Retries

- Rate-limited and unknown errors retry with exponential backoff
- Crashes retry if attempts remain
- Budget-exceeded tasks are re-queued for later (daily reset)
- Max 2 retries by default

## Webhook Automation

The agent runner includes a GitHub webhook server that automatically moves Plane tasks to "Done" when their associated pull requests are merged. This closes the feedback loop between code development and project tracking.

### How It Works

1. **PR Merged** - When a PR is merged on GitHub, a webhook event is sent to the agent runner
2. **Task ID Extraction** - The webhook handler searches for task IDs in:
   - PR description (e.g., "Closes AGENTHQ-123", "Fixes AGENTHQ-456")
   - Branch name (e.g., `agent/AGENTHQ-123`, `feature/AGENTHQ-789-description`)
   - Commit messages (searches all commits in the PR)
3. **State Update** - For each matched task ID:
   - Finds the task in Plane by project identifier + sequence ID
   - Updates task state to "Done"
   - Adds a comment with PR merge information
   - Logs the update for audit trail
4. **Error Handling** - Gracefully handles edge cases:
   - Multiple task IDs in one PR (updates all)
   - Task already in Done state (skips update)
   - Invalid/missing task IDs (logs warning, continues)
   - Plane API errors (logs error, continues)

### Setup

1. **Configure the webhook server** in `config.json`:

```jsonc
{
  "webhook": {
    "enabled": true,
    "port": 3000,
    "path": "/webhooks/github/pr",
    "taskIdPattern": "([A-Z]+-\\d+)", // customize if using different task ID format
  },
}
```

2. **Generate a webhook secret**:

```bash
openssl rand -hex 32
```

Add it to your `.env`:

```bash
GITHUB_WEBHOOK_SECRET=your-generated-secret
```

3. **Configure GitHub webhook** in your repository settings:
   - URL: `http://your-server:3000/webhooks/github/pr`
   - Content type: `application/json`
   - Secret: Use the same secret from step 2
   - Events: Select "Pull requests" only
   - Active: ✓

4. **Ensure the server is accessible** from GitHub:
   - If running locally, use a tool like [ngrok](https://ngrok.com/) or [localtunnel](https://localtunnel.github.io/www/)
   - If running on a VPS, ensure port 3000 is open in your firewall

### Security

- **Signature Validation** - All webhook requests are validated using HMAC-SHA256
- **Secret Required** - Configure `GITHUB_WEBHOOK_SECRET` to enable validation
- **Event Filtering** - Only `pull_request` events with `action=closed` and `merged=true` are processed

### Testing

To test the webhook integration:

1. Create a test PR with a task ID in the description (e.g., "Closes AGENTHQ-123")
2. Merge the PR
3. Check the agent runner logs for webhook processing messages
4. Verify the task moved to "Done" in Plane

### Troubleshooting

**Webhook not firing:**

- Check GitHub webhook delivery logs in repository settings
- Verify the webhook URL is accessible from the internet
- Check firewall rules and network configuration

**Signature validation failing:**

- Ensure `GITHUB_WEBHOOK_SECRET` matches the secret configured in GitHub
- Check for whitespace or encoding issues in the secret

**Task not updating:**

- Verify task ID format matches the `taskIdPattern` in config
- Check that the task exists in Plane
- Review agent runner logs for error messages

## MCP Tools

Agents get access to a custom MCP server (`agent-plane-tools`) with these tools:

| Tool                      | Description                                  |
| ------------------------- | -------------------------------------------- |
| `update_task_status`      | Move task to plan_review, in_review, or done |
| `add_task_comment`        | Post HTML progress comment                   |
| `add_task_link`           | Attach link (e.g., PR URL) to task           |
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
│   ├── webhooks/
│   │   ├── server.ts         # HTTP webhook server with signature validation
│   │   ├── handler.ts        # GitHub PR event processing
│   │   ├── task-matcher.ts   # Task ID extraction from PR/branch/commits
│   │   ├── updater.ts        # Plane task state updates
│   │   └── types.ts          # GitHub webhook payload types
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
