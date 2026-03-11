# The Board Is for Humans, the Labels Are for Agents

In the [first post](/blog/01-manage-side-projects-from-telegram.md), I showed the mobile interface — creating tasks and managing agents from Telegram. In the [second post](/blog/02-agents-with-worktrees-and-budgets.md), I covered the engine — how agents plan, implement, and stay within budget.

This final post is about the feedback loop that ties it all together: the kanban board as a human visualization layer, webhooks that auto-close tasks when PRs merge, a skills system that lets agents accumulate knowledge, and an honest assessment of what actually works after running this system daily.

---

## Why a Board?

Agents work in terminals. They read files, write code, run tests. Their natural habitat is a log stream. But I don't think in log streams — I think in kanban columns.

The board is the layer where agent work becomes visible to a human. When I open Plane on my laptop, I see every project laid out in columns:

**Backlog** → **Todo** → **Plan Review** → **In Progress** → **In Review** → **Done**

At a glance, I know: two tasks are being implemented (In Progress), one plan is waiting for my review (Plan Review), three tasks are ready for agent pickup (Todo), and yesterday's work has been merged (Done).

Without the board, I'd need to SSH into the VPS, check Docker logs, parse JSON state files, and cross-reference git branches to understand what's happening. The board replaces all of that with a 2-second glance.

### Why Plane?

I needed three things: a clean API, self-hosting, and zero cost. [Plane](https://plane.so) delivers all three. It's open source, runs as a Docker Compose stack on my VPS, and has a REST API that covers everything — projects, issues, states, labels, comments. The API is the real product here; the web UI is a bonus.

Jira's API is a nightmare. Linear doesn't self-host. GitHub Projects doesn't have proper states. Plane was the only option that let me control the entire stack and run it next to the agent runner on the same $7/month VPS.

## Labels as Agent Triggers

The entire dispatch mechanism is a single label: **"agent"**.

When a task has the "agent" label and is in the "Todo" state, the agent runner picks it up. Remove the label, and it's a human-only task — agents will never touch it. This is the simplest possible interface between human intent and agent action.

The label-based approach means I can mix human and agent tasks on the same board. Some tasks are complex enough that I want to do them myself. Others are straightforward enough to hand to an agent. The label is the dividing line.

When creating new projects via the Telegram bot, labels are automatically cloned from a template project. This means every new project starts with the same set of labels — including "agent" — without manual setup.

## The PR-to-Done Webhook: Closing the Loop

The lifecycle of a task looks like this:

```
Telegram → Plane (Todo) → Agent (In Progress) → GitHub (PR) → Plane (Done)
```

The last step — moving from GitHub back to Plane — is handled by a webhook. When a PR is merged on GitHub, the webhook server receives the event and automatically moves the associated task to "Done."

Here's the core logic:

```typescript
// Only process closed PRs that were merged
if (event.action !== "closed" || !event.pull_request.merged) {
  return EMPTY_RESULT;
}

// Extract task IDs from PR branch, title, body
const taskIds = extractTaskIds(pr, undefined, config.webhook.taskIdPattern);
```

Task IDs are extracted from multiple sources — the PR branch name (`agent/PROJECT-42`), the PR title, and the PR body — using a configurable regex pattern: `([A-Z]+-\d+)`. If the agent created a branch called `agent/PROJECT-42` and mentioned "Implements PROJECT-42" in the PR description, both will match and the task moves to Done.

This closes the loop. A task born from a Telegram message on my phone ends its life as a merged PR on GitHub, and the board updates automatically. I don't need to manually drag anything to Done.

## The Skills System: Agents Teaching Agents

Skills are reusable coding standards stored as markdown files. Instead of injecting all standards into every agent prompt (which wastes tokens and context), the agent receives a compact catalog of available skills and loads the ones it needs via an MCP tool.

Each skill has metadata in YAML frontmatter:

```markdown
---
name: Git Commit Messages
description: Standards for writing clear, consistent git commit messages
category: commit-standards
priority: 90
applies_to: implementation
---

# Git Commit Messages

## Standards

When creating commits, follow these conventions:

1. Prefix with task ID (e.g., "PROJECT-8: Add rate limiting")
2. Use imperative mood ("Add feature" not "Added feature")
3. Keep first line under 72 characters
```

**Global skills** apply to all projects: commit message standards, testing guidelines, TypeScript best practices, planning methodology, implementation discipline. These live in `skills/global/`.

**Project-level skills** live in `.claude/skills/` within each repo and can override global ones. A Python project might have different testing standards than a TypeScript project.

The interesting part: agents can **create** new skills during their work. If an agent discovers a pattern or convention in a codebase, it can write a skill file for future agents. Over time, the skills accumulate project-specific knowledge that no single agent session would have.

Skills are phase-aware — some apply only during planning, others only during implementation, and some during both. The loader filters by the current phase and respects a priority system (higher priority skills are loaded first, up to a configurable maximum of 10 per session).

## Resume Context: Picking Up Where You Left Off

Tasks don't always complete in a single run. An agent might get rate-limited, exceed its turn budget, or receive human feedback that requires changes. When a task re-enters the queue, the agent doesn't start from scratch.

Resume detection is based on a simple signal: does the branch `agent/PROJECT-42` already exist? If yes, this is a continuation. The system provides the agent with:

- **Git log** — all commits on the branch since it diverged from main
- **Git diff** — the full diff against main, so the agent sees its own prior work
- **Last commit message** — context about the most recent change
- **Comment analysis** — which Plane comments are new since the last session (human feedback)

The agent gets explicit instructions: "DO NOT redo work that has already been completed." Combined with the git history, this usually means the agent picks up right where it left off — reading the new feedback, adjusting the implementation, and continuing.

## Infrastructure: A Single VPS

The entire system runs on a single Hetzner VPS. Here's what's on it:

| Service                 | How                          |
| ----------------------- | ---------------------------- |
| Plane (task board)      | Docker Compose, port 80      |
| Agent Runner            | Docker Compose, polls Plane  |
| Telegram Bot            | Docker Compose, long polling |
| Observability Dashboard | Docker Compose, port 4080    |

Total cost: ~$7/month for the VPS. Plus API costs for Claude, which vary based on usage but are capped at $20/day by the budget system.

Networking is handled by Tailscale — a private encrypted mesh between my Mac and the VPS. No public domains, no TLS certificates, no nginx reverse proxy. The VPS has a Tailscale IP, my Mac has a Tailscale IP, and everything talks over the mesh. It's one of those things that's almost too simple to write about, which is exactly why I like it.

### Deployment

The CI/CD pipeline is deliberately unglamorous:

```yaml
deploy:
  steps:
    - name: Copy files to VPS
      uses: appleboy/scp-action@v0.1.7
      with:
        host: ${{ secrets.VPS_HOST }}
        username: ${{ secrets.VPS_USER }}
        key: ${{ secrets.SSH_PRIVATE_KEY }}
        source: "agent-runner/src,agent-runner/skills,..."
        target: "~/"

    - name: Build and restart container
      uses: appleboy/ssh-action@v1
      with:
        script: |
          cd ~/agent-runner
          docker compose up -d --build --force-recreate
```

SCP the files. SSH in. Docker compose restart. Quality gates (formatting, type checking, tests) run in the CI job before deployment. If they pass, the new code is live in about 90 seconds.

No Kubernetes. No blue-green deployments. No service mesh. It's a side-project infrastructure for side projects, and that's fine.

## The System That Builds Itself

Here's the part that still makes me smile: Agent HQ is one of its own managed projects. The agent runner, the Telegram bot, the webhook server, the skills system — they're all tasks on the same Plane board that agents pick up and implement.

When I want a new feature in the bot, I open Telegram and create a task. The agent plans the change, I review the plan, the agent implements it, CI deploys it to the VPS, and the new feature is live — in the same bot I used to create the task.

The system iterates on itself. New features in the agent runner (like the skills system, or the webhook integration) were themselves implemented by agents managed by earlier versions of the runner. It's not infinite recursion — I review every PR and approve every plan — but it is a genuine feedback loop where the tool improves itself through its own workflow.

## Honest Assessment

### What Works

**Task enrichment from phone** is genuinely the highest-value feature. A 5-word prompt becomes a structured task with acceptance criteria. This alone would justify the system even without autonomous agents.

**Two-phase architecture catches bad plans.** I've saved real money by reviewing plans before implementation. The most common issue: agents planning too much refactoring when the task only needs a targeted change. A comment like "don't touch the auth module" costs nothing and saves $3-4 of wasted implementation.

**Budget protection has prevented real damage.** Early on, before daily budgets, a stuck agent once burned through $15 exploring a circular dependency. The $20/day cap and the $5/task cap have never been hit accidentally since — they're there for exactly those scenarios.

**The reply-to-answer flow is surprisingly natural.** Answering an agent's question from my phone while walking takes 15 seconds. The agent resumes immediately. This is the closest thing to "managing a team" from your pocket.

**Git worktrees for parallel agents are a solved problem.** Four agents, four branches, four isolated directories, zero conflicts. The resume detection (branch exists = continuation) handles the common case of retries and human feedback gracefully.

### Rough Edges

**Plan quality varies.** Some agents produce tight, focused plans. Others over-explore, spending most of their $2 budget reading files that aren't relevant. I haven't found a reliable way to steer this without being overly prescriptive in the prompt.

**Rate limits are the most common failure mode.** Anthropic API rate limits cause the majority of agent retries. The exponential backoff handles it, but a task that hits rate limits twice takes 5+ minutes of idle waiting.

**PR quality still needs human review.** Agents write correct code, but sometimes over-engineered code. A function that should be 10 lines becomes 30 with error handling for impossible cases. The two-phase architecture helps (you can catch this in plan review), but it doesn't eliminate it.

**The 6-hour stale threshold is sometimes too generous.** I've had agents run for 4+ hours on a task that should take 45 minutes. By the time the stale alert fires at 6 hours, significant budget has been spent. I should probably lower this to 2-3 hours.

### What I'd Change

**Per-project cost tracking.** Currently I track per-task and daily aggregate costs. I'd like to see "Project A has spent $45 this month" at a glance.

**Image support in Telegram.** Sometimes I want to show an agent a screenshot of a UI bug. The current system is text-only.

**Plan scoring.** Automatically evaluating plan quality before I review it — flagging plans that seem unfocused or overly broad — would reduce my review burden.

## The Full Loop

You're walking to lunch. You open Telegram: "Create a task about caching inference results." The bot enriches it with acceptance criteria. "Start implementing PROJECT-12." The agent runner picks it up, plans in read-only mode, posts a plan comment. You glance at your phone — the plan looks good, it's in "Plan Review." You open Plane on your laptop, approve it. The agent resumes, implements, runs tests, pushes a branch, creates a PR. GitHub webhook fires, task moves to Done on the board. You review the PR during your next coffee break.

Three projects. Four agents. One phone. A $7 VPS.

The best productivity tool is the one you use while waiting for your coffee.
