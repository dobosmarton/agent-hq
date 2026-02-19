# Agent HQ

A command center for managing multiple Claude Code agents across software projects. Combines a self-hosted task board (Plane), a real-time observability dashboard, and a Telegram bot with LLM-powered natural language for mobile task management.

## Architecture

```
                        LOCAL (Mac)
┌──────────────────────────────────────────────────┐
│  Claude Code agents → hooks → send events to VPS │
└──────────────────────────────────────────────────┘
                        │
                        │ Tailscale private mesh
                        ▼
                        VPS (Hetzner)
┌──────────────────────────────────────────────────┐
│  Plane (self-hosted)          → port 80          │
│  Observability Dashboard      → port 4080        │
│  Agent Runner (Docker)        → polls Plane       │
│  Telegram Bot (Docker)        → long polling      │
└──────────────────────────────────────────────────┘
                        │
                        │ Telegram API
                        ▼
┌──────────────────────────────────────────────────┐
│  Phone → @my_agent_hq_bot → natural language     │
│  "Create a task in Verdandi about rate limiting"  │
└──────────────────────────────────────────────────┘
```

| Component | Tech | Purpose |
|-----------|------|---------|
| Task board | [Plane](https://plane.so) (self-hosted) | Kanban boards, project management |
| Agent runner | Claude Agent SDK + Plane API | Autonomous agents that pick up tasks and work on them |
| Agent monitoring | [Observability Dashboard](https://github.com/disler/claude-code-hooks-multi-agent-observability) | Real-time web dashboard of all agent activity |
| Mobile access | Telegram bot + Mastra AI agent | Create/list/inspect tasks via natural language |
| Networking | Tailscale | Private encrypted mesh between Mac and VPS |

## Telegram Bot

The bot lives in [`telegram-bot/`](./telegram-bot/) and is the main piece of code in this repo. It's a TypeScript app that connects Telegram to Plane via an LLM agent.

### How it works

You send a natural language message to `@my_agent_hq_bot` on Telegram. A [Mastra](https://mastra.ai) agent (backed by Claude) interprets your intent, calls the appropriate Plane API tools, and replies conversationally. It supports multi-turn conversations — the agent can ask clarifying questions before acting.

**Examples:**

- "List my projects"
- "What tasks are open in Verdandi?"
- "Create a task in Style-swipe about fixing the onboarding flow"
- "What workflow states does Verdandi have?"

When creating tasks, the agent proactively enriches your brief description into a structured issue with acceptance criteria, technical considerations, and edge cases.

### Tech stack

- **[grammy](https://grammy.dev)** — Telegram bot framework (long polling, no webhooks needed)
- **[Mastra](https://mastra.ai)** — AI agent framework with built-in tool calling and conversation memory
- **[@ai-sdk/anthropic](https://sdk.vercel.ai)** — Claude model provider
- **[LibSQL](https://turso.tech/libsql)** — SQLite-based persistent storage for conversation history
- **[Zod](https://zod.dev)** — Runtime type validation at API boundaries
- **TypeScript** — Strict mode, arrow functions, types over interfaces

### Project structure

```
telegram-bot/
├── src/
│   ├── bot.ts              # Entry point — grammy bot setup, auth middleware, message handler
│   ├── types.ts            # Zod schemas for env validation and Plane API responses
│   ├── plane.ts            # Typed Plane API client (list projects, issues, states; create issues)
│   ├── utils.ts            # Pure utilities — extractTaskId, chunkMessage
│   ├── agent/
│   │   ├── index.ts        # Mastra agent setup — system prompt, memory, model config
│   │   └── tools.ts        # Four Plane tools: list_projects, list_tasks, create_task, get_project_states
│   ├── commands/
│   │   └── help.ts         # /start and /help command handlers
│   └── __tests__/          # Vitest unit tests (50 tests)
├── Dockerfile              # Multi-stage build (compile TS → run JS)
├── docker-compose.yml      # Docker Compose with bot-data volume for SQLite persistence
├── tsconfig.json           # Strict TypeScript config
├── .prettierrc             # Prettier config
└── env.example             # Required environment variables
```

### Agent tools

The LLM agent has four tools for interacting with Plane:

| Tool | Description |
|------|-------------|
| `list_projects` | Lists all projects in the workspace |
| `list_tasks` | Lists open tasks (backlog/todo/in progress) for a project with state names |
| `create_task` | Creates a task with an enriched HTML description |
| `get_project_states` | Lists workflow states for a project |

### Environment variables

Copy `env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `TELEGRAM_BOT_TOKEN` | Bot token from @BotFather |
| `ALLOWED_USER_ID` | Your Telegram user ID (auth gate) |
| `PLANE_API_KEY` | Plane workspace API token |
| `PLANE_BASE_URL` | Plane API base URL (e.g. `http://localhost/api/v1`) |
| `PLANE_WORKSPACE_SLUG` | Plane workspace slug |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude |
| `ANTHROPIC_MODEL` | Model ID (default: `claude-haiku-4-5-20251001`) |

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

| Script | Command |
|--------|---------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run the compiled bot |
| `npm run dev` | Watch mode (recompile on changes) |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting (CI) |

## Agent Runner

The agent runner lives in [`agent-runner/`](./agent-runner/) and is an autonomous task execution system. It polls Plane for tasks labeled `agent`, spawns Claude Code agents to work on them, and reports progress back via Telegram.

### How it works

1. Polls Plane for issues with the `agent` label in configured projects
2. Claims a task by moving it to "In Progress"
3. Creates a git worktree with a dedicated branch (`agent/<task-id>`)
4. Spawns a Claude Code agent (via the Agent SDK) with MCP tools for updating task status, adding comments, and asking humans questions
5. On completion, cleans up the worktree and notifies via Telegram
6. Manages daily budget limits to control API spend

### Tech stack

- **[Claude Agent SDK](https://docs.anthropic.com/en/docs/agents)** — Spawns Claude Code agents with tool use
- **[Zod](https://zod.dev)** — Runtime config and API response validation
- **[Vitest](https://vitest.dev)** — Unit testing (104 tests)
- **TypeScript** — Strict mode

### Project structure

```
agent-runner/
├── src/
│   ├── index.ts              # Entry point — config loading, polling loop, graceful shutdown
│   ├── config.ts             # Zod schemas for config.json and environment variables
│   ├── types.ts              # Shared type definitions
│   ├── agent/
│   │   ├── manager.ts        # Agent lifecycle — spawning, budget tracking, stale detection
│   │   ├── runner.ts         # Claude Agent SDK integration — runs the agent process
│   │   ├── mcp-tools.ts      # MCP tools: update_task_status, add_task_comment, ask_human
│   │   └── prompt-builder.ts # Builds the system prompt for each agent
│   ├── plane/
│   │   ├── client.ts         # Typed Plane API client (projects, states, labels, issues, comments)
│   │   └── types.ts          # Zod schemas for Plane API responses
│   ├── poller/
│   │   └── task-poller.ts    # Polls Plane for agent-labeled tasks, manages claim/release
│   ├── state/
│   │   └── persistence.ts    # JSON file persistence for agent state across restarts
│   ├── telegram/
│   │   ├── notifier.ts       # Telegram message sender (start/complete/error/blocked notifications)
│   │   └── bridge.ts         # Human-in-the-loop — agents ask questions, humans reply via Telegram
│   ├── worktree/
│   │   └── manager.ts        # Git worktree creation/cleanup for isolated agent workspaces
│   └── __tests__/            # Vitest unit tests (104 tests)
├── config.json               # Project mappings and agent settings
├── Dockerfile                # Multi-stage build with git support
├── docker-compose.yml        # Docker Compose with repo volumes and state persistence
├── entrypoint.sh             # Container entrypoint
└── env.example               # Required environment variables
```

### Environment variables

Copy `env.example` to `.env` and fill in the values:

| Variable | Description |
|----------|-------------|
| `PLANE_API_KEY` | Plane workspace API token |
| `ANTHROPIC_API_KEY` | Anthropic API key for Claude agents |
| `TELEGRAM_BOT_TOKEN` | Bot token (same as telegram-bot) |
| `TELEGRAM_CHAT_ID` | Telegram chat ID for notifications |
| `GITHUB_PAT` | GitHub PAT for git push in worktrees |

### Scripts

| Script | Command |
|--------|---------|
| `npm run build` | Compile TypeScript |
| `npm start` | Run the compiled runner |
| `npm run dev` | Watch mode (recompile on changes) |
| `npm test` | Run unit tests |
| `npm run test:watch` | Run tests in watch mode |
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting (CI) |

### Deployment

The runner runs as a Docker container on the VPS. CI/CD is handled by GitHub Actions (`.github/workflows/agent-runner.yml`).

**Pipeline:**
1. **Quality** — `npm ci`, formatting check, type check (`tsc --noEmit`), tests (`vitest run`), build (`tsc`)
2. **Deploy** — SCP files to VPS, rebuild Docker container

## VPS Services

All services run on a Hetzner VPS and are accessed via Tailscale private network.

| Service | Port | URL |
|---------|------|-----|
| Plane | 80 | `http://<tailscale-ip>` |
| Observability Dashboard | 4080 | `http://<tailscale-ip>:4080` |
| Agent Runner | — | Polls Plane (no incoming port) |
| Telegram Bot | — | Long polling (no incoming port) |

### SSH access

```bash
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-ip>
```

### Key paths on VPS

| Path | Contents |
|------|----------|
| `~/plane-selfhost/` | Plane self-hosted (Docker Compose) |
| `~/observability/` | Observability dashboard (Docker Compose) |
| `~/agent-runner/` | Agent runner (Docker Compose) |
| `~/telegram-bot/` | Telegram bot (Docker Compose) |

## Planning docs

- [`implementation-plan.md`](./implementation-plan.md) — Full phased implementation plan
- [`phase2-vps-plane-setup.md`](./phase2-vps-plane-setup.md) — Plane deployment guide
- [`phase3-observability-setup.md`](./phase3-observability-setup.md) — Observability dashboard setup
