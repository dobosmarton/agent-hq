# Agent HQ — Implementation & Adoption Plan

A step-by-step guide to setting up a command center for managing 3–4 Claude Code agents across multiple GitHub projects, with a kanban task board, real-time monitoring, and mobile access.

---

## Progress Overview

| Phase | Description | Status |
|-------|-------------|--------|
| Phase 1 | CCManager — Agent Orchestration | Not started |
| Phase 2 | Plane — Task Board & MCP Integration | ✅ Done |
| Phase 3 | Observability Dashboard — Agent Monitoring | ✅ Done |
| Phase 4 | Mobile Access — Telegram Bot | ✅ Done |
| Phase 5 | Daily Workflow Adoption | Pending |
| Phase 6 | Refinements & Extensions | Pending |

**Key change from original plan**: Using **Tailscale** private mesh network instead of Cloudflare Tunnel + public domains. All services accessed via Tailscale IPs, no DNS/TLS configuration needed.

---

## Target Architecture

```
                        LOCAL (Mac — Tailscale: <mac-tailscale-ip>)
┌─────────────────┐     ┌──────────────────────┐     ┌──────────────────┐
│  Your Terminal   │────▶│  CCManager (TUI)      │────▶│  Claude Code ×4  │
│                  │     │  Multi-project mode   │     │  (git worktrees) │
└─────────────────┘     └──────────────────────┘     └──────┬───────────┘
                                                            │
                                                            │ hooks send events
                        VPS (Hetzner — Tailscale: <vps-tailscale-ip>)
┌─────────────────┐     ┌──────────────────────┐           │
│  Browser         │────▶│  Plane (self-hosted)  │◀─── MCP ─┤
│  (Tailscale net) │     │  http://<vps-tailscale-ip> │           │
└─────────────────┘     └──────────────────────┘           │
                                                            ▼
┌─────────────────┐     ┌──────────────────────────────────────────────┐
│  Browser         │────▶│  Observability Dashboard (Docker on VPS)     │
│  (Tailscale net) │     │  http://<vps-tailscale-ip>:4080                   │
└─────────────────┘     │  Bun API + Vue.js + Caddy + SQLite           │
                        └──────────────────────────────────────────────┘
┌─────────────────┐             │
│  Mobile Phone   │────▶ Telegram Bot (VPS) ────── Plane API
│  (Telegram app) │
└─────────────────┘

All VPS services accessed via Tailscale private encrypted mesh (no public domains)
```

**Stack summary:**

| Layer | Tool | Where | Purpose |
|-------|------|-------|---------|
| Agent orchestration | CCManager | Local Mac | Run/monitor multiple Claude Code sessions |
| Task board | Plane (self-hosted) | VPS (Docker) | Kanban boards, project management, MCP server |
| Agent monitoring | Observability Dashboard | VPS (Docker) | Real-time web dashboard of all agent activity |
| Mobile access | Telegram bot | VPS | Dispatch tasks, check status from phone |
| Network access | Tailscale | Mac + VPS | Private encrypted mesh network between devices |

---

## Prerequisites

Before starting, make sure you have:

- **Claude Code CLI** installed and authenticated (`npm install -g @anthropic-ai/claude-code`)
- **Node.js 22+** (required by Plane MCP server and CCManager)
- **Docker + Docker Compose** installed
- **A VPS or always-on machine** (4 GB RAM minimum, 8 GB recommended) — e.g., Hetzner CX22 (~€6/month) or any small instance
- **Tailscale** installed on your VPS and local machine (free personal plan)
- **Your 3–4 GitHub repos** cloned locally in a common parent directory
- **Telegram account** (for the mobile bot)

---

## Phase 1: CCManager — Agent Orchestration (Day 1, ~1 hour)

CCManager (`kbwo/ccmanager`) is a self-contained TUI that manages multiple Claude Code sessions with real-time state detection, git worktree isolation, and automation hooks. No tmux dependency.

### Step 1.1: Install CCManager

```bash
# Install globally via npm
npm install -g ccmanager

# Or run without installing
npx ccmanager
```

### Step 1.2: Organize your project directories

Create a common root for all your projects:

```bash
mkdir -p ~/projects
# Clone or move your repos here
# ~/projects/project-alpha
# ~/projects/project-beta
# ~/projects/project-gamma
# ~/projects/project-delta
```

### Step 1.3: Configure multi-project mode

Set the environment variable pointing to your projects root:

```bash
# Add to your .bashrc / .zshrc
export CCMANAGER_MULTI_PROJECT_ROOT="$HOME/projects"
```

### Step 1.4: Launch in multi-project mode

```bash
npx ccmanager --multi-project
```

This opens the TUI where you can see all repos, create worktree-isolated sessions, and monitor which agent is in what state (waiting for input, running, completed, errored).

### Step 1.5: Create per-project config (optional)

Create `.ccmanager.json` in each project root for project-specific settings:

```json
{
  "worktreeDir": ".worktrees",
  "defaultAgent": "claude",
  "autoApprove": false
}
```

### Step 1.6: Set up state hooks for notifications

CCManager fires hooks when session states change. Create a hook script that will later integrate with Telegram:

```bash
mkdir -p ~/.config/ccmanager/hooks
```

Create `~/.config/ccmanager/hooks/on-state-change.sh`:

```bash
#!/bin/bash
# $1 = session name, $2 = old state, $3 = new state
if [ "$3" = "completed" ] || [ "$3" = "waiting_input" ]; then
  # We'll wire this to Telegram in Phase 4
  echo "$(date): $1 changed to $3" >> /tmp/ccmanager-events.log
fi
```

```bash
chmod +x ~/.config/ccmanager/hooks/on-state-change.sh
```

Configure it in CCManager's config (`~/.config/ccmanager/config.json`):

```json
{
  "stateHooks": {
    "command": "~/.config/ccmanager/hooks/on-state-change.sh"
  }
}
```

### Step 1.7: Learn the key workflows

- **Create a new session**: Select a project → create worktree → start Claude Code agent with a task prompt
- **Monitor sessions**: The main screen shows all sessions with their real-time states
- **Switch between sessions**: Navigate to any session to see its terminal output
- **Resume sessions**: CCManager preserves sessions across restarts; Claude Code's `--resume` handles conversation state

### Checkpoint

At this point you should be able to:
- Launch CCManager and see all 3–4 projects
- Create parallel Claude Code sessions in isolated worktrees
- See real-time status of each agent (waiting, running, completed)
- Switch between sessions from a single interface

---

## Phase 2: Plane — Task Board & MCP Integration (Day 1–2, ~2 hours) ✅ DONE

> **Status**: Plane is deployed and running on the VPS. Accessible at `http://<vps-tailscale-ip>` via Tailscale.

Plane is your visual command center: kanban boards for each project, backlog management, and an official MCP server so Claude Code can read/write tasks directly.

### Step 2.1: Deploy Plane on your VPS

SSH into your VPS and run:

```bash
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>

# Create working directory
mkdir -p ~/plane-selfhost && cd ~/plane-selfhost

# Download the setup script
curl -fsSL https://raw.githubusercontent.com/makeplane/plane/master/deploy/selfhost/install.sh -o setup.sh
chmod +x setup.sh

# Run the installer
./setup.sh
```

When prompted:
- Select **1) Install**
- Enter your **domain name** (e.g., `plane.yourdomain.com`) or server IP
- Choose **Express** setup for defaults

This spins up the full Plane stack via Docker Compose (web app, API, worker, PostgreSQL, Redis). Minimum requirements: 2 vCPUs, 4 GB RAM.

### Step 2.2: Initial Plane configuration

1. Open `http://<vps-tailscale-ip>` in a browser (via Tailscale)
2. Create your admin account
3. Create a **Workspace** (e.g., "My Projects")
4. Create **4 Projects** — one for each GitHub repo
5. Set up **Kanban views** for each project with columns: `Backlog → Todo → In Progress → In Review → Done`

### Step 2.3: Generate an API key

1. Go to **Settings → Workspace → API Tokens**
2. Create a new token with full access
3. Save the token securely — you'll need it for MCP and webhooks

### Step 2.4: Connect Plane MCP to Claude Code

For **Plane Cloud** (if you use the hosted version):

```bash
# Add Plane MCP server with HTTP transport (OAuth)
claude mcp add --transport http plane https://mcp.plane.so/http/mcp
```

For **self-hosted Plane**, use the stdio transport with your API key:

```bash
# Install the MCP server package and add it
claude mcp add plane \
  -e PLANE_API_KEY="your-api-key-here" \
  -e PLANE_WORKSPACE_SLUG="your-workspace-slug" \
  -e PLANE_BASE_URL="http://<vps-tailscale-ip>/api" \
  -- uvx plane-mcp-server stdio
```

Or add it to your `~/.claude.json` directly:

```json
{
  "mcpServers": {
    "plane": {
      "command": "uvx",
      "args": ["plane-mcp-server", "stdio"],
      "env": {
        "PLANE_API_KEY": "<YOUR_API_KEY>",
        "PLANE_WORKSPACE_SLUG": "<YOUR_WORKSPACE_SLUG>",
        "PLANE_BASE_URL": "http://<vps-tailscale-ip>/api"
      }
    }
  }
}
```

### Step 2.5: Verify MCP connection

Launch Claude Code and run:

```
/mcp
```

You should see `plane: connected` in the output. Test it:

```
> List all projects in my workspace
> Create a work item in project-alpha titled "Add rate limiting to API endpoints"
```

The Plane MCP server exposes 55+ tools covering work items, projects, cycles, modules, and more.

### Step 2.6: Seed your task boards

For each of your 3–4 projects, add initial tasks to Plane. You can do this through the web UI or by chatting with Claude Code:

```
> In project-alpha, create these work items:
> 1. "Refactor auth middleware" - priority High
> 2. "Add integration tests for payment flow" - priority Medium
> 3. "Update API documentation" - priority Low
```

### Checkpoint

At this point you should be able to:
- Access Plane's kanban board from any browser
- See tasks organized per project with proper columns
- Use Claude Code to read and create Plane work items via MCP
- Manage task lifecycle (move between columns, assign, prioritize)

---

## Phase 3: Observability Dashboard — Agent Monitoring (Day 2, ~1 hour) ✅ DONE

> **Status**: Dashboard deployed and receiving live events. Accessible at `http://<vps-tailscale-ip>:4080` via Tailscale. WebSocket streaming works. Events flow from Mac hooks to VPS in real time.

The `disler/claude-code-hooks-multi-agent-observability` project gives you a real-time web dashboard showing what every Claude Code agent is doing across all your projects. It runs on the VPS via Docker, accessible at `http://<vps-tailscale-ip>:4080` via Tailscale.

> **Full step-by-step guide**: See [phase3-observability-setup.md](./phase3-observability-setup.md) for complete deployment instructions including Docker setup, Tailscale networking, and troubleshooting.

### Step 3.1: Deploy on VPS via Docker

SSH into your VPS and clone the observability repo:

```bash
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>
cd ~
git clone https://github.com/disler/claude-code-hooks-multi-agent-observability.git observability
cd ~/observability
```

The repo includes a `docker-compose.yml` with two services: a Bun API server and a Caddy reverse proxy serving the Vue frontend. The build args use Tailscale IPs:

```yaml
web:
  build:
    args:
      VITE_API_URL: http://<vps-tailscale-ip>:4080
      VITE_WS_URL: ws://<vps-tailscale-ip>:4080/stream
```

Build and start:

```bash
docker compose up -d --build
```

The dashboard is now running on port 4080, accessible via Tailscale at `http://<vps-tailscale-ip>:4080`.

### Step 3.2: Access via Tailscale (replaces Cloudflare Tunnel)

Tailscale was installed on both VPS and Mac in Phase 2. No additional setup needed — the dashboard is accessible from any device on the Tailscale network. Tailscale encrypts all traffic, so no TLS certificates are needed.

> **Note**: If the Tailscale IP changes, you must update `VITE_API_URL`/`VITE_WS_URL` and rebuild: `cd ~/observability && docker compose build web && docker compose up -d`

### Step 3.3: Configure hooks to send events to VPS

The hook scripts in each project read the `OBSERVABILITY_SERVER_URL` environment variable. Set it on your Mac:

```bash
echo 'export OBSERVABILITY_SERVER_URL="http://<vps-tailscale-ip>:4080/events"' >> ~/.zshrc
source ~/.zshrc
```

The hooks are already deployed in each project's `.claude/hooks/` directory with the corresponding `settings.json` configuration. No per-project changes needed.

### Step 3.4: Verify events are flowing

1. Open `http://<vps-tailscale-ip>:4080` in your browser (must be on Tailscale network)
2. Start a Claude Code session in one of your projects
3. You should see events appearing in real time: tool calls, file operations, agent spawns, session starts/stops

### Known Issue

Large event payloads (>100KB) sometimes fail with "connection reset by peer". This doesn't affect normal operation but means some large tool outputs may be lost.

### Checkpoint

At this point you should be able to:
- Access the observability dashboard from any browser at `http://<vps-tailscale-ip>:4080` (via Tailscale)
- See all Claude Code agent activity across all projects in real time
- Track which agent is doing what via tool calls, file modifications, and session lifecycles
- WebSocket streaming provides live updates without polling

---

## Phase 4: Mobile Access — Telegram Bot + Remote Access (Day 2–3, ~2–3 hours) ✅ DONE

> **Status**: Telegram bot `@my_agent_hq_bot` deployed on VPS as Docker container. Commands: /projects, /tasks, /add. CI/CD pipeline in `.github/workflows/telegram-bot.yml`. Source code in `telegram-bot/` (TypeScript + grammy).

This phase gives you the ability to check agent status, assign tasks, and trigger work from your phone.

### Step 4.1: Create a Telegram bot

1. Open Telegram, search for `@BotFather`
2. Send `/newbot`
3. Choose a name (e.g., "My Claude HQ Bot")
4. Save the **bot token** you receive
5. Get your **Telegram user ID** (message `@userinfobot` to find it) — this is for authentication

### Step 4.2: Build a lightweight dispatcher bot

Create a new project for your bot:

```bash
mkdir -p ~/projects/claude-hq-bot && cd ~/projects/claude-hq-bot
npm init -y
npm install grammy dotenv
```

Create `.env`:

```env
TELEGRAM_BOT_TOKEN=your_bot_token_here
ALLOWED_USER_ID=your_telegram_user_id
PLANE_API_KEY=your_plane_api_key
PLANE_BASE_URL=http://<vps-tailscale-ip>/api
PLANE_WORKSPACE_SLUG=your-workspace-slug
```

Create `bot.js`:

```javascript
require('dotenv').config();
const { Bot } = require('grammy');
const { exec } = require('child_process');
const http = require('http');

const bot = new Bot(process.env.TELEGRAM_BOT_TOKEN);
const ALLOWED = process.env.ALLOWED_USER_ID;

// Auth middleware
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== ALLOWED) return;
  await next();
});

// /status — check CCManager agent states
bot.command('status', async (ctx) => {
  exec('cat /tmp/ccmanager-events.log | tail -20', (err, stdout) => {
    ctx.reply(stdout || 'No recent events.');
  });
});

// /tasks <project> — list open tasks from Plane
bot.command('tasks', async (ctx) => {
  const project = ctx.match?.trim();
  if (!project) return ctx.reply('Usage: /tasks <project-identifier>');

  try {
    const res = await fetch(
      `${process.env.PLANE_BASE_URL}/v1/workspaces/${process.env.PLANE_WORKSPACE_SLUG}/projects/${project}/work-items/?state_group=unstarted,started&per_page=10`,
      { headers: { 'X-API-Key': process.env.PLANE_API_KEY } }
    );
    const data = await res.json();
    const tasks = data.results?.map(t =>
      `• [${t.state_detail?.name || '?'}] ${t.name}`
    ).join('\n') || 'No tasks found.';
    await ctx.reply(`Tasks for ${project}:\n\n${tasks}`);
  } catch (e) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /add <project> <title> — create a new task in Plane
bot.command('add', async (ctx) => {
  const parts = ctx.match?.trim().split(' ');
  if (!parts || parts.length < 2) return ctx.reply('Usage: /add <project-id> <task title>');

  const [projectId, ...titleParts] = parts;
  const title = titleParts.join(' ');

  try {
    const res = await fetch(
      `${process.env.PLANE_BASE_URL}/v1/workspaces/${process.env.PLANE_WORKSPACE_SLUG}/projects/${projectId}/work-items/`,
      {
        method: 'POST',
        headers: {
          'X-API-Key': process.env.PLANE_API_KEY,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ name: title })
      }
    );
    const task = await res.json();
    await ctx.reply(`Created: ${task.name} (${task.identifier})`);
  } catch (e) {
    await ctx.reply(`Error: ${e.message}`);
  }
});

// /run <project> <task description> — trigger Claude Code
bot.command('run', async (ctx) => {
  const parts = ctx.match?.trim().split(' ');
  if (!parts || parts.length < 2) return ctx.reply('Usage: /run <project-dir> <prompt>');

  const [projectDir, ...promptParts] = parts;
  const prompt = promptParts.join(' ');
  const projectPath = `${process.env.HOME}/projects/${projectDir}`;

  await ctx.reply(`Starting Claude Code in ${projectDir}...`);

  // Run Claude Code headlessly
  const cmd = `cd "${projectPath}" && claude -p "${prompt}" --output-format stream-json --max-turns 30 2>&1 | tail -5`;
  exec(cmd, { timeout: 300000 }, (err, stdout) => {
    if (err) return ctx.reply(`Error: ${err.message.slice(0, 500)}`);
    ctx.reply(`Done!\n\n${stdout.slice(0, 3000)}`);
  });
});

bot.command('help', (ctx) => {
  ctx.reply(
    `/status — Recent agent events\n` +
    `/tasks <project> — List open tasks\n` +
    `/add <project> <title> — Create a task\n` +
    `/run <project-dir> <prompt> — Run Claude Code\n` +
    `/help — Show this message`
  );
});

bot.start();
console.log('Bot started!');
```

### Step 4.3: Run the bot

```bash
node bot.js

# Or with PM2 for persistence:
pm2 start bot.js --name "telegram-hq-bot"
pm2 save
```

### Step 4.4: Wire CCManager hooks to Telegram

Update the state hook from Phase 1 to notify you via Telegram:

```bash
# ~/.config/ccmanager/hooks/on-state-change.sh
#!/bin/bash
SESSION_NAME="$1"
OLD_STATE="$2"
NEW_STATE="$3"

BOT_TOKEN="your_bot_token_here"
CHAT_ID="your_telegram_user_id"

if [ "$NEW_STATE" = "completed" ] || [ "$NEW_STATE" = "waiting_input" ]; then
  MSG="🤖 Agent '$SESSION_NAME' → $NEW_STATE"
  curl -s "https://api.telegram.org/bot${BOT_TOKEN}/sendMessage" \
    -d "chat_id=${CHAT_ID}" \
    -d "text=${MSG}" > /dev/null
fi
```

Now you'll get Telegram pings when agents finish or need input.

### Step 4.5: Network Access (already done via Tailscale)

Tailscale is already set up from Phase 2/3. Both VPS and Mac are connected:

| Device | Tailscale IP | Hostname |
|--------|-------------|----------|
| VPS | <vps-tailscale-ip> | <vps-hostname> |
| Mac | <mac-tailscale-ip> | <mac-hostname> |

Services accessible via Tailscale:
- Plane: `http://<vps-tailscale-ip>`
- Dashboard: `http://<vps-tailscale-ip>:4080`

To access from your phone, install Tailscale on your mobile device and join the same network.

> **Future option**: If public domain access is needed later, consider Cloudflare Tunnel or `tailscale funnel`.

### Checkpoint

At this point you should be able to:
- Send `/tasks project-alpha` from your phone and see Plane tasks
- Send `/add project-alpha Fix the login bug` to create tasks from mobile
- Send `/run project-alpha "implement rate limiting"` to trigger a Claude Code agent
- Receive Telegram notifications when agents complete tasks
- Access Plane's kanban board from your phone's browser via Tailscale
- Access the observability dashboard from your phone via Tailscale

---

## Phase 5: Daily Workflow Adoption (Week 1)

Once all pieces are running, here's the daily routine to adopt:

### Morning Planning (5 minutes, from phone or desktop)

1. Open **Plane** on your phone or laptop
2. Review each project's board — move items to "Todo" for today
3. Prioritize: drag the most important items to the top
4. Optionally, use Telegram: `/tasks project-alpha` for a quick status check

### Task Dispatch (ongoing)

When you're ready to work on a task:

**From terminal (primary workflow):**
```bash
# Launch CCManager
npx ccmanager --multi-project

# Select a project → create new session → paste task prompt:
# "Implement rate limiting for the API endpoints per Plane task WEB-42.
#  Read the task details from Plane first, then implement and update
#  the task status to In Review when done."
```

**From phone (mobile workflow):**
```
/run project-alpha "Fix the login redirect loop per task WEB-15"
```

**From this Claude chat (via Plane MCP context):**
You can describe a task here and then manually trigger it in CCManager with the refined specification.

### Monitoring (passive)

- **Observability dashboard** runs in a browser tab — glance at it periodically
- **Telegram notifications** alert you when agents finish or need input
- **CCManager TUI** shows state at a glance when you're at your terminal

### Review & Merge (as agents complete)

1. CCManager shows sessions in "completed" state
2. Review the git diff in the worktree
3. If satisfied, merge the worktree branch to main
4. Update the Plane task status to "Done" (or have the agent do it via MCP)

### End of Day

1. Check Plane boards for remaining items
2. Note any blocked tasks or issues
3. Stop running agents you don't need overnight (or let them continue)

---

## Phase 6: Refinements & Extensions (Week 2+)

Once comfortable with the base workflow, consider these enhancements:

### 6.1: Plane Webhooks → Auto-trigger agents

Set up Plane webhooks so moving a task to "In Progress" automatically dispatches a Claude Code agent:

1. In Plane: **Settings → Webhooks → Add Webhook**
2. Point it at a small Express server on your VPS
3. The handler reads the task details and spawns a Claude Code process

### 6.2: Per-project CLAUDE.md with Plane context

Add instructions in each project's `CLAUDE.md`:

```markdown
## Task Management
- You have access to Plane via MCP. Always check for assigned tasks before starting.
- When starting a task, update its status to "In Progress".
- When finishing, update status to "In Review" and add a comment with a summary.
- Reference Plane task identifiers (e.g., WEB-42) in git commit messages.
```

### 6.3: Custom Claude Code subagents

Create specialized agents per project in `.claude/agents/`:

```markdown
<!-- .claude/agents/code-reviewer.md -->
---
name: code-reviewer
tools: ["Read", "Glob", "Grep"]
---

You are a code reviewer. Read the recent changes, check for:
- Security vulnerabilities
- Missing error handling
- Test coverage gaps
Report findings as a Plane comment on the relevant task.
```

### 6.4: Claude Code Agent Teams (experimental)

When Anthropic stabilizes Agent Teams, you can use them for intra-project parallelism:

```bash
export CLAUDE_CODE_EXPERIMENTAL_AGENT_TEAMS=1
# Then ask Claude Code to split a large task across teammates
```

Currently limited to a single working directory and requires tmux/iTerm2.

### 6.5: Cost tracking

Add a Telegram command to track API spend:

```javascript
bot.command('costs', async (ctx) => {
  // Read from observability dashboard's SQLite DB
  // or from Claude Code's usage logs
  ctx.reply('Today: $4.20 | This week: $28.50');
});
```

---

## Troubleshooting

**CCManager doesn't detect session states:**
Ensure you're running Claude Code v2.1+ and that CCManager is at v3.6+. Run `npx ccmanager@latest` to update.

**Plane MCP server won't connect:**
- Check that Node.js is v22+: `node --version`
- For self-hosted Plane, verify the API base URL is reachable from your machine
- Run Claude Code with `--debug` flag: `claude --debug`
- Check MCP status: `/mcp` inside Claude Code

**Observability dashboard shows no events:**
- Check `OBSERVABILITY_SERVER_URL` is set on your Mac: `echo $OBSERVABILITY_SERVER_URL`
- Verify the `.claude/hooks/` directory exists in the project
- Check that `settings.json` references the hooks correctly
- Test connectivity: `curl -X POST http://<vps-tailscale-ip>:4080/events -H "Content-Type: application/json" -d '{"source_app":"test","session_id":"test","hook_event_type":"Test","payload":{},"timestamp":0}'`
- Check VPS container logs: `ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "cd ~/observability && docker compose logs server"`

**Tailscale connectivity issues:**
- Check Tailscale is connected: `tailscale status`
- Verify VPS Tailscale IP: `ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip> "tailscale ip -4"`
- If Tailscale IP changed, update `OBSERVABILITY_SERVER_URL` in `~/.zshrc` and rebuild the web container

**Telegram bot doesn't respond:**
- Check the bot token is correct
- Verify your Telegram user ID matches `ALLOWED_USER_ID`
- Check `pm2 logs telegram-hq-bot` for errors

---

## Quick Reference: Key Commands

```bash
# SSH into VPS
ssh -i ~/.ssh/<ssh-key-name> deploy@<vps-public-ip>

# CCManager
npx ccmanager --multi-project              # Launch multi-project TUI
export CCMANAGER_MULTI_PROJECT_ROOT=~/projects

# Claude Code with Plane MCP
claude mcp list                             # Check MCP servers
claude mcp get plane                        # Verify Plane connection
claude -p "List tasks in project WEB"       # Headless query

# Plane (self-hosted, on VPS)
cd ~/plane-selfhost && ./setup.sh           # Manage Plane (start/stop/upgrade)
# Plane URL: http://<vps-tailscale-ip>

# Observability (on VPS)
cd ~/observability
docker compose up -d --build                # Start/rebuild dashboard
docker compose ps                           # Check container status
docker compose logs server                  # View server logs
# Dashboard URL: http://<vps-tailscale-ip>:4080

# Tailscale
tailscale status                            # Check connectivity
tailscale ip -4                             # Show Tailscale IP

# Telegram bot
pm2 start bot.js --name telegram-hq-bot     # Start bot
pm2 logs telegram-hq-bot                    # Check logs

# Telegram commands (from your phone)
/status                                     # Recent agent events
/tasks <project-id>                         # List open tasks
/add <project-id> <title>                   # Create a task
/run <project-dir> <prompt>                 # Trigger Claude Code
```