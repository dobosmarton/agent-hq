# Agent HQ

A command center for managing multiple Claude Code agents across software projects. Combines a self-hosted task board (Plane), a real-time observability dashboard, and a Telegram bot with LLM-powered natural language for mobile task management.

## Architecture

```
                      VPS (Hetzner) — fully self-contained
┌──────────────────────────────────────────────────┐
│  Plane (self-hosted)          → port 80          │
│  Observability Dashboard      → port 4080        │
│  Agent Runner (Docker)        → polls Plane      │
│    ├─ task queue (persist to disk)               │
│    ├─ parallel agents (plan → implement)         │
│    ├─ HTTP API (status, queue control, answers)  │
│    └─ webhook server (port 3000)                 │
│  Telegram Bot (Docker)        → long polling     │
│    └─ queries Agent Runner for queue status      │
└──────────────────────────────────────────────────┘
         ▲                          │
         │ webhooks (pull_request)  │ Telegram API
         │                          ▼
  ┌────────────┐        ┌──────────────────────────────────────────────┐
  │   GitHub   │        │  Phone → @my_agent_hq_bot                   │
  │ PR merged  │        │  "What's the agent queue status?"           │
  │ → task     │        │  "Create a task about rate limiting"         │
  │   "Done"   │        │  "Search GitHub for my verdandi repo"       │
  └────────────┘        └──────────────────────────────────────────────┘

                    OPTIONAL: Local (Mac)
┌──────────────────────────────────────────────────┐
│  Claude Code agents → hooks → send events to VPS │
│  (only needed for observability when running      │
│   agents locally via Tailscale private mesh)      │
└──────────────────────────────────────────────────┘
```

| Component        | Tech                                                                                             | Purpose                                               |
| ---------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------- |
| Task board       | [Plane](https://plane.so) (self-hosted)                                                          | Kanban boards, project management                     |
| Agent runner     | Claude Agent SDK + Plane API                                                                     | Autonomous agents that pick up tasks and work on them |
| Agent monitoring | [Observability Dashboard](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Real-time web dashboard of all agent activity         |
| Mobile access    | Telegram bot + Mastra AI agent                                                                   | Create/list/inspect tasks via natural language        |
| Networking       | Tailscale                                                                                        | Private encrypted mesh between Mac and VPS            |

## Telegram Bot

The bot lives in [`telegram-bot/`](./telegram-bot/) and is the main piece of code in this repo. It's a TypeScript app that connects Telegram to Plane via an LLM agent.

### How it works

You send a natural language message to `@my_agent_hq_bot` on Telegram. A [Mastra](https://mastra.ai) agent (backed by Claude) interprets your intent, calls the appropriate Plane API tools, and replies conversationally. It supports multi-turn conversations — the agent can ask clarifying questions before acting.

**Examples:**

- "List my projects"
- "What tasks are open in Verdandi?"
- "Create a task in Style-swipe about fixing the onboarding flow"
- "What workflow states does Verdandi have?"
- "Add the agent label to VERDANDI-5"
- "Start implementing AGENTHQ-2" (auto-adds "agent" label + moves to "Todo")
- "What's the agent queue status?" (shows queued tasks, active agents, daily spend)
- "Remove VERDANDI-3 from the agent queue"
- "Search GitHub for my verdandi repo" (project discovery)
- "Create a new Plane project for this repo and link it"

When creating tasks, the agent proactively enriches your brief description into a structured issue with acceptance criteria, technical considerations, and edge cases.

**Implementation-Start Convention:** When you say phrases like "start implementing TASK-ID", "begin work on TASK-ID", or "let's implement TASK-ID", the agent automatically adds the "agent" label and moves the task to "Todo" state. This standardizes the workflow for agent-driven task implementation.

### Tech stack

- **[grammy](https://grammy.dev)** — Telegram bot framework (long polling, no webhooks needed)
- **[Mastra](https://mastra.ai)** — AI agent framework with built-in tool calling and conversation memory
- **[@ai-sdk/anthropic](https://sdk.vercel.ai)** — Claude model provider
- **[LibSQL](https://turso.tech/libsql)** — SQLite-based persistent storage for conversation history
- **[Octokit](https://github.com/octokit/rest.js)** — GitHub API client for repo search and project discovery
- **[Zod](https://zod.dev)** — Runtime type validation at API boundaries
- **[Vitest](https://vitest.dev)** — Unit testing
- **TypeScript** — Strict mode, arrow functions, types over interfaces

### Project structure

```
telegram-bot/
├── src/
│   ├── bot.ts              # Entry point — grammy bot setup, auth middleware, message handler
│   ├── types.ts            # Zod schemas for env validation and Plane API responses
│   ├── plane.ts            # Typed Plane API client (list projects, issues, states; create issues)
│   ├── github.ts           # GitHub API client (repo search, user/org repos, URL parsing)
│   ├── github-types.ts     # Zod schemas for GitHub API responses
│   ├── formatter.ts        # Telegram HTML message formatter with chunking and truncation
│   ├── utils.ts            # Pure utilities — extractTaskId, chunkMessage
│   ├── agent/
│   │   ├── index.ts        # Mastra agent setup — system prompt, memory, model config
│   │   └── tools.ts        # Plane + GitHub + agent runner tools
│   ├── commands/
│   │   └── help.ts         # /start and /help command handlers
│   └── __tests__/          # Vitest unit tests
├── Dockerfile              # Multi-stage build (compile TS → run JS)
├── docker-compose.yml      # Docker Compose with bot-data volume for SQLite persistence
├── tsconfig.json           # Strict TypeScript config
├── .prettierrc             # Prettier config
└── env.example             # Required environment variables
```

### Agent tools

The LLM agent has these tools for interacting with Plane and the agent runner:

**Plane tools:**

| Tool                      | Description                                                                       |
| ------------------------- | --------------------------------------------------------------------------------- |
| `list_projects`           | Lists all projects in the workspace                                               |
| `list_tasks`              | Lists open tasks (backlog/todo/in progress) for a project with state names        |
| `create_task`             | Creates a task with an enriched HTML description                                  |
| `get_project_states`      | Lists workflow states for a project                                               |
| `get_task_details`        | Gets full details of a specific task (description, metadata, URL)                 |
| `list_task_comments`      | Lists all comments on a task                                                      |
| `add_task_comment`        | Adds a comment to a task (HTML formatted)                                         |
| `move_task_state`         | Moves a task to a different workflow state                                        |
| `add_labels_to_task`      | Adds one or more labels to a task (idempotent, validates against existing labels) |
| `remove_labels_from_task` | Removes one or more labels from a task (idempotent)                               |

**Project discovery tools** (enabled when `GITHUB_PAT` is set):

| Tool                        | Description                                                       |
| --------------------------- | ----------------------------------------------------------------- |
| `search_github_projects`    | Searches GitHub repos by name or URL (user, org, and global)      |
| `search_plane_projects`     | Searches existing Plane projects by keyword                       |
| `create_plane_project`      | Creates a new Plane project with optional template cloning        |
| `find_github_plane_match`   | Finds matching Plane project for a GitHub repo                    |
| `get_project_mapping`       | Gets the full mapping between GitHub repos and Plane projects     |
| `link_github_plane_project` | Links a GitHub repo to a Plane project in the agent runner config |

**Agent runner tools:**

| Tool                      | Description                                                              |
| ------------------------- | ------------------------------------------------------------------------ |
| `agent_queue_status`      | Shows queued tasks, active agents, runtime, cost, and daily budget usage |
| `remove_from_agent_queue` | Removes a queued (not active) task from the agent queue                  |

### Environment variables

Copy `env.example` to `.env` and fill in the values:

| Variable               | Description                                                                          |
| ---------------------- | ------------------------------------------------------------------------------------ |
| `TELEGRAM_BOT_TOKEN`   | Bot token from @BotFather                                                            |
| `ALLOWED_USER_ID`      | Your Telegram user ID (auth gate)                                                    |
| `PLANE_API_KEY`        | Plane workspace API token                                                            |
| `PLANE_BASE_URL`       | Plane API base URL (e.g. `http://localhost/api/v1`)                                  |
| `PLANE_WORKSPACE_SLUG` | Plane workspace slug                                                                 |
| `ANTHROPIC_API_KEY`    | Anthropic API key for Claude                                                         |
| `ANTHROPIC_MODEL`      | Model ID (default: `claude-haiku-4-5-20251001`)                                      |
| `AGENT_RUNNER_URL`     | Agent runner HTTP URL for queue tools (optional, e.g. `http://127.0.0.1:3847`)       |
| `GITHUB_PAT`           | GitHub Personal Access Token for project discovery (optional — enables GitHub tools) |

### Local development

```bash
cd telegram-bot
npm install
cp env.example .env    # fill in values
npm run build          # compile TypeScript
npm start              # run the bot
```

### Deployment

The bot runs as a Docker container on the VPS. CI/CD is handled by GitHub Actions (`.github/workflows/telegram-bot.yml`).

**Pipeline:**

1. **Quality** — `npm ci`, formatting check, type check (`tsc --noEmit`), tests (`vitest run`), build (`tsc`)
2. **Deploy** — SCP files to VPS, rebuild Docker container

**Manual deploy:**

```bash
# From telegram-bot/ directory
scp -i ~/.ssh/<ssh-key-name> -r src package.json package-lock.json tsconfig.json Dockerfile docker-compose.yml deploy@<vps-ip>:~/telegram-bot/
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-ip> "cd ~/telegram-bot && docker compose up -d --build --force-recreate"
```

**GitHub Actions secrets required:**

- `VPS_HOST` — VPS IP address
- `VPS_USER` — SSH user
- `SSH_PRIVATE_KEY` — SSH private key

### Scripts

| Script                 | Command                           |
| ---------------------- | --------------------------------- |
| `npm run build`        | Compile TypeScript                |
| `npm start`            | Run the compiled bot              |
| `npm run dev`          | Watch mode (recompile on changes) |
| `npm test`             | Run unit tests                    |
| `npm run test:watch`   | Run tests in watch mode           |
| `npm run format`       | Format code with Prettier         |
| `npm run format:check` | Check formatting (CI)             |

## Agent Runner

The agent runner lives in [`agent-runner/`](./agent-runner/) and is an autonomous task execution system. It polls Plane for tasks labeled `agent`, queues them, spawns Claude Code agents to work on them in parallel, and reports progress back via Telegram.

### How it works

1. **Discovery loop** (every 30s) — polls Plane for issues with the `agent` label, claims them by moving to "In Progress", and enqueues them
2. **Processing loop** (every 15s) — dequeues ready tasks and spawns agents up to the concurrency limit
3. Each agent runs a two-phase workflow: **planning** (read-only exploration) then **implementation** (on a git worktree with a dedicated `agent/<task-id>` branch)
4. Agents have MCP tools for updating task status, adding comments, loading coding skills on-demand, and asking humans questions via Telegram
5. On completion, cleans up the worktree, pushes the branch, and notifies via Telegram
6. Manages daily budget limits to control API spend

### Queue and retry system

The runner uses an in-memory task queue persisted to disk (`state/runner-state.json`). This ensures no tasks are lost across container restarts.

- **Deduplication** — a task can only be queued once (keyed by issue ID)
- **Exponential backoff** — failed tasks are requeued with increasing delays (base delay \* 2^retry)
- **Configurable retries** — transient errors (rate limits, crashes) are retried up to `maxRetries` times
- **Orphan recovery** — on startup, agents that were "running" in a previous process are automatically re-enqueued and their Plane state reset to "Todo"
- **Budget protection** — when the daily budget is reached, tasks are re-enqueued instead of dropped
- **Graceful shutdown** — on SIGINT/SIGTERM, state is saved and active agents are reported via Telegram
- **Clean boundaries** — the queue is a pure data structure; all orchestration (retry logic, state persistence, lifecycle management) is owned by the central orchestrator

### Tech stack

- **[Claude Agent SDK](https://docs.anthropic.com/en/docs/agents)** — Spawns Claude Code agents with tool use
- **[Hono](https://hono.dev)** — Lightweight HTTP framework for the GitHub webhook server
- **[Zod](https://zod.dev)** — Runtime config and API response validation
- **[Vitest](https://vitest.dev)** — Unit testing
- **TypeScript** — Strict mode

### Skills system

Skills are reusable coding standards and best practices that agents can load on-demand. Instead of injecting all skill content into every prompt, the agent receives a compact catalog of available skills and selectively loads the ones relevant to the current task via the `load_skill` MCP tool.

**Global skills** (`agent-runner/skills/global/`):

| Skill                              | Description                                                         | Phase               |
| ---------------------------------- | ------------------------------------------------------------------- | ------------------- |
| `planning-methodology`             | Feasibility assessment, plan structure, skip recommendations        | Planning only       |
| `implementation-discipline`        | Execution rules for precise plan following without over-engineering | Implementation only |
| `commit-messages`                  | Git commit message standards                                        | Implementation only |
| `typescript-nodejs-best-practices` | TypeScript/Node.js patterns and type safety                         | Both                |
| `python-best-practices`            | Python 3.12+ typing, tooling, and patterns                          | Both                |
| `testing-standards`                | Vitest testing guidelines                                           | Both                |

**Project skills** are loaded from `.claude/skills/` within each project repo. They override global skills with the same ID.

Skills are markdown files with metadata in HTML comments:

```markdown
<!-- skill:name = TypeScript Node.js Best Practices -->
<!-- skill:description = TypeScript and Node.js project setup and type-safe coding patterns -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->
<!-- skill:appliesTo = both -->

# Content here...
```

**CLI commands:**

```bash
cd agent-runner
npm run skills:list [project-path]      # List all available skills
npm run skills:show <id> [project-path] # Show skill details
npm run skills:validate [project-path]  # Validate skill files
```

### Project structure

```
agent-runner/
├── src/
│   ├── index.ts              # Orchestrator — discovery/process loops, retry logic, state persistence, shutdown
│   ├── config.ts             # Zod schemas for config.json and environment variables
│   ├── types.ts              # Shared type definitions (AgentTask, SpawnResult, RunnerState, etc.)
│   ├── agent/
│   │   ├── manager.ts        # Agent lifecycle — spawning, budget tracking, stale detection
│   │   ├── runner.ts         # Claude Agent SDK integration — runs the agent process
│   │   ├── phase.ts          # Detects planning vs implementation phase from comments
│   │   ├── mcp-tools.ts      # MCP tools: update_task_status, add_task_comment, load_skill
│   │   ├── ci-discovery.ts   # Reads CI workflow files for validation instructions
│   │   └── prompt-builder.ts # Builds the system prompt for each agent
│   ├── skills/
│   │   ├── types.ts          # Skill schema, phase, and category definitions
│   │   ├── loader.ts         # Loads, merges, and filters skills from global + project dirs
│   │   ├── formatter.ts      # Formats skills as catalog (prompt) or detail (CLI)
│   │   └── cli.ts            # CLI commands: list, show, validate
│   ├── plane/
│   │   ├── client.ts         # Typed Plane API client (projects, states, labels, issues, comments)
│   │   └── types.ts          # Zod schemas for Plane API responses
│   ├── poller/
│   │   └── task-poller.ts    # Polls Plane for agent-labeled tasks, manages claim/release
│   ├── queue/
│   │   └── task-queue.ts     # In-memory task queue with dedup, backoff, and serialization
│   ├── state/
│   │   └── persistence.ts    # JSON file persistence for runner state across restarts
│   ├── telegram/
│   │   ├── notifier.ts       # Telegram message sender (start/complete/error/blocked notifications)
│   │   └── bridge.ts         # HTTP API for human-in-the-loop, queue status, and queue control
│   ├── webhooks/
│   │   ├── server.ts         # Hono webhook server with HMAC signature verification
│   │   ├── handler.ts        # PR event processing (merged PR → task status update)
│   │   ├── types.ts          # Zod schemas for GitHub webhook payloads
│   │   ├── task-matcher.ts   # Extracts task IDs from PR description, branch, commits
│   │   ├── updater.ts        # Updates Plane task state to "Done" on merge
│   │   └── __tests__/        # Webhook unit tests
│   ├── worktree/
│   │   └── manager.ts        # Git worktree creation/cleanup for isolated agent workspaces
│   └── __tests__/            # Vitest unit tests
├── skills/
│   └── global/               # Global skills (loaded for all projects)
│       ├── planning-methodology.md
│       ├── implementation-discipline.md
│       ├── commit-messages.md
│       ├── typescript-nodejs-best-practices.md
│       ├── python-best-practices.md
│       └── testing-standards.md
├── config.json               # Project mappings and agent settings
├── Dockerfile                # Multi-stage build with git support
├── docker-compose.yml        # Docker Compose with repo volumes and state persistence
├── entrypoint.sh             # Container entrypoint
└── env.example               # Required environment variables
```

### Configuration

Agent behavior is configured in `config.json`:

| Setting                           | Default               | Description                              |
| --------------------------------- | --------------------- | ---------------------------------------- |
| `agent.maxConcurrent`             | 2                     | Max agents running in parallel           |
| `agent.maxBudgetPerTask`          | $5.00                 | Budget ceiling per individual task       |
| `agent.maxDailyBudget`            | $20.00                | Total daily spend limit                  |
| `agent.maxTurns`                  | 200                   | Max agent turns per task                 |
| `agent.pollIntervalMs`            | 30000                 | Discovery cycle interval                 |
| `agent.spawnDelayMs`              | 15000                 | Processing cycle interval                |
| `agent.maxRetries`                | 2                     | Retry count for transient failures       |
| `agent.retryBaseDelayMs`          | 60000                 | Base delay for exponential backoff       |
| `agent.labelName`                 | `agent`               | Plane label that triggers agent pickup   |
| `agent.skills.enabled`            | `true`                | Enable/disable the skills system         |
| `agent.skills.maxSkillsPerPrompt` | 10                    | Max skills available per agent session   |
| `agent.skills.globalSkillsPath`   | `skills/global`       | Path to global skills directory          |
| `webhook.enabled`                 | `true`                | Enable/disable the GitHub webhook server |
| `webhook.port`                    | 3000                  | Port for the webhook server              |
| `webhook.path`                    | `/webhooks/github/pr`         | URL path for GitHub webhook events            |
| `webhook.taskIdPattern`           | `([A-Z]+-\\d+)`               | Regex to extract task IDs from PRs            |
| `review.enabled`                  | `false`                       | Enable/disable automated PR review agent      |
| `review.triggerOnOpened`          | `true`                        | Trigger review when PR is opened              |
| `review.triggerOnSynchronize`     | `true`                        | Trigger review when PR is updated             |
| `review.severityThreshold`        | `major`                       | Minimum severity for issues (`critical`/`major`/`minor`/`suggestion`) |
| `review.maxDiffSizeKb`            | `100`                         | Maximum diff size for automated review (KB)   |
| `review.claudeModel`              | `claude-3-5-sonnet-20241022`  | Claude model to use for code analysis         |

### Environment variables

Copy `env.example` to `.env` and fill in the values:

| Variable                | Description                                                                      |
| ----------------------- | -------------------------------------------------------------------------------- |
| `PLANE_API_KEY`         | Plane workspace API token                                                        |
| `ANTHROPIC_API_KEY`     | Anthropic API key for Claude agents                                              |
| `TELEGRAM_BOT_TOKEN`    | Bot token (same as telegram-bot, optional)                                       |
| `TELEGRAM_CHAT_ID`      | Telegram chat ID for notifications (optional)                                    |
| `GITHUB_PAT`            | GitHub PAT for git push in worktrees                                             |
| `GITHUB_WEBHOOK_SECRET` | Secret for GitHub webhook HMAC signature verification (optional but recommended) |
| `STATE_PATH`            | Path to state file (default: `state/runner-state.json`)                          |

### Scripts

| Script                     | Command                            |
| -------------------------- | ---------------------------------- |
| `npm run build`            | Compile TypeScript                 |
| `npm start`                | Run the compiled runner            |
| `npm run dev`              | Watch mode (recompile on changes)  |
| `npm test`                 | Run unit tests                     |
| `npm run test:watch`       | Run tests in watch mode            |
| `npm run format`           | Format code with Prettier          |
| `npm run format:check`     | Check formatting (CI)              |
| `npm run skills:list`      | List all global and project skills |
| `npm run skills:show <id>` | Show detailed skill content        |
| `npm run skills:validate`  | Validate skill file syntax         |

### GitHub webhooks

The webhook server handles two types of PR events: merged PRs (auto-update task status) and opened/updated PRs (automated code review).

#### Auto-update task status on PR merge

When a PR is merged on GitHub, the webhook server automatically moves the associated Plane task to "Done". Task IDs are extracted from the PR branch name (`agent/AGENTHQ-123`), description, or commit messages.

**How it works:**

1. GitHub sends a `pull_request` event to `http://<vps-ip>:3000/webhooks/github/pr`
2. The server verifies the HMAC-SHA256 signature (if `GITHUB_WEBHOOK_SECRET` is set)
3. Only processes `closed` events where `merged: true`
4. Extracts task IDs using the configured `taskIdPattern` regex
5. Looks up the task in Plane and moves it to the "Done" state
6. Responds to GitHub immediately; processing happens asynchronously

#### Automated PR review (Phase 1 MVP)

When enabled (`review.enabled: true`), the PR review agent automatically reviews agent-created PRs when they are opened or updated. This creates a quality gate before human review.

**How it works:**

1. GitHub sends a `pull_request` event (`opened` or `synchronize` action)
2. Review agent extracts task ID and fetches task details from Plane
3. Fetches PR diff and files changed from GitHub API
4. Loads project coding skills for context
5. Uses Claude to analyze code changes against task requirements and best practices
6. Posts detailed review comments to GitHub PR
7. Posts review summary to Plane task
8. Reviews cover: correctness, completeness, code quality, best practices, security, testing, documentation, performance

**Review dimensions:**

- **Correctness**: Does the code work? Are there bugs?
- **Completeness**: Does it meet all acceptance criteria?
- **Code Quality**: Is it clean, readable, maintainable?
- **Best Practices**: Does it follow project conventions?
- **Security**: Are there security vulnerabilities?
- **Testing**: Are there tests? Do they cover changes?
- **Documentation**: Is the code documented?
- **Performance**: Are there inefficiencies?

**Configuration:**

Set `review.enabled: true` in `config.json` to enable automated reviews. The review agent respects the `maxDiffSizeKb` limit to avoid reviewing excessively large PRs.

**Note**: Phase 1 never auto-approves PRs. It only posts comments or requests changes. Human approval is still required before merging.

**GitHub webhook setup** (per repo): Settings > Webhooks > Add webhook

| Field        | Value                                                   |
| ------------ | ------------------------------------------------------- |
| Payload URL  | `http://<vps-public-ip>:3000/webhooks/github/pr`       |
| Content type | `application/json`                                      |
| Secret       | Same as `GITHUB_WEBHOOK_SECRET` in agent-runner `.env` |
| Events       | Pull requests                                           |

### Deployment

The runner runs as a Docker container on the VPS. CI/CD is handled by GitHub Actions (`.github/workflows/agent-runner.yml`).

**Pipeline:**

1. **Quality** — `npm ci`, formatting check, type check (`tsc --noEmit`), tests (`vitest run`), build (`tsc`)
2. **Deploy** — SCP files to VPS, rebuild Docker container

## VPS Services

All services run on a Hetzner VPS and are accessed via Tailscale private network.

| Service                 | Port | URL                                                       |
| ----------------------- | ---- | --------------------------------------------------------- |
| Plane                   | 80   | `http://<tailscale-ip>`                                   |
| Observability Dashboard | 4080 | `http://<tailscale-ip>:4080`                              |
| Agent Runner            | 3000 | Polls Plane + webhook server at `http://<public-ip>:3000` |
| Telegram Bot            | —    | Long polling (no incoming port)                           |

### SSH access

```bash
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-ip>
```

### Key paths on VPS

| Path                | Contents                                 |
| ------------------- | ---------------------------------------- |
| `~/plane-selfhost/` | Plane self-hosted (Docker Compose)       |
| `~/observability/`  | Observability dashboard (Docker Compose) |
| `~/agent-runner/`   | Agent runner (Docker Compose)            |
| `~/telegram-bot/`   | Telegram bot (Docker Compose)            |

## Planning docs

- [`implementation-plan.md`](./implementation-plan.md) — Full phased implementation plan
- [`phase2-vps-plane-setup.md`](./phase2-vps-plane-setup.md) — Plane deployment guide
- [`phase3-observability-setup.md`](./phase3-observability-setup.md) — Observability dashboard setup
