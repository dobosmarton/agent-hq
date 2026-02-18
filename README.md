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
│   ├── agent/
│   │   ├── index.ts        # Mastra agent setup — system prompt, memory, model config
│   │   └── tools.ts        # Four Plane tools: list_projects, list_tasks, create_task, get_project_states
│   └── commands/
│       └── help.ts         # /start and /help command handlers
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
1. **Quality** — `npm ci`, type check (`tsc --noEmit`), build (`tsc`)
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
| `npm run format` | Format code with Prettier |
| `npm run format:check` | Check formatting (CI) |

## VPS Services

All services run on a Hetzner VPS and are accessed via Tailscale private network.

| Service | Port | URL |
|---------|------|-----|
| Plane | 80 | `http://<tailscale-ip>` |
| Observability Dashboard | 4080 | `http://<tailscale-ip>:4080` |
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
| `~/telegram-bot/` | Telegram bot (Docker Compose) |

## Planning docs

- [`implementation-plan.md`](./implementation-plan.md) — Full phased implementation plan
- [`phase2-vps-plane-setup.md`](./phase2-vps-plane-setup.md) — Plane deployment guide
- [`phase3-observability-setup.md`](./phase3-observability-setup.md) — Observability dashboard setup
