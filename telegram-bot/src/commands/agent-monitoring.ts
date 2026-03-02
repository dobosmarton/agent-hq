import type { Context } from "grammy";

type AgentRunnerStatus = {
  queue: Array<{
    issueId: string;
    projectIdentifier: string;
    sequenceId: number;
    title: string;
    retryCount: number;
    nextAttemptAt: number;
    enqueuedAt: number;
  }>;
  active: Array<{
    issueId: string;
    projectIdentifier: string;
    sequenceId: number;
    title: string;
    phase: string;
    status: string;
    startedAt: number;
    costUsd?: number;
    retryCount: number;
  }>;
  dailySpend: number;
  dailyBudget: number;
  metrics: {
    uptime: number;
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    successRate: number;
    totalCostUsd: number;
    avgDurationMs: number;
  } | null;
  uptime: number;
};

type HealthResponse = {
  ok: boolean;
  status: string;
  pending: number;
  queueDepth: number;
  activeCount: number;
  dailySpend: number;
  dailyBudget: number;
  metrics: {
    uptime: number;
    totalTasks: number;
    successfulTasks: number;
    failedTasks: number;
    successRate: number;
    totalCostUsd: number;
    avgDurationMs: number;
  } | null;
  issues: string[];
};

type HistoryResponse = {
  executions: Array<{
    issueId: string;
    projectIdentifier: string;
    sequenceId: number;
    title: string;
    phase: string;
    startedAt: number;
    completedAt: number;
    durationMs: number;
    costUsd: number;
    success: boolean;
    errorType?: string;
    retryCount: number;
  }>;
};

const formatDuration = (ms: number): string => {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
  if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
  return `${Math.floor(ms / 3600000)}h ${Math.floor((ms % 3600000) / 60000)}m`;
};

const formatTimestamp = (timestamp: number): string => {
  const date = new Date(timestamp);
  const now = Date.now();
  const diff = now - timestamp;

  if (diff < 60000) return "just now";
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
  if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;

  return date.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
};

export const handleAgentStatus = async (ctx: Context, agentRunnerUrl: string): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/status`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch agent status");
      return;
    }

    const data = (await res.json()) as AgentRunnerStatus;

    const lines: string[] = ["<b>🤖 Agent Status</b>\n"];

    if (data.active.length === 0) {
      lines.push("No agents running");
    } else {
      lines.push(`Running Agents: ${data.active.length}`);
      for (const agent of data.active) {
        const taskId = `${agent.projectIdentifier}-${agent.sequenceId}`;
        const runtime = formatDuration(Date.now() - agent.startedAt);
        const cost = agent.costUsd ? `$${agent.costUsd.toFixed(2)}` : "$0.00";
        lines.push(
          `\n<b>${taskId}</b> (${agent.phase})`,
          `  Runtime: ${runtime} | Cost: ${cost}`,
          `  Status: ${agent.status}`,
          `  Title: ${agent.title.substring(0, 60)}${agent.title.length > 60 ? "..." : ""}`
        );
      }
    }

    if (data.metrics) {
      const uptime = formatDuration(data.metrics.uptime);
      lines.push(
        `\n<b>📊 Metrics</b>`,
        `Uptime: ${uptime}`,
        `Tasks: ${data.metrics.totalTasks} (✅ ${data.metrics.successfulTasks} | ❌ ${data.metrics.failedTasks})`,
        `Success rate: ${(data.metrics.successRate * 100).toFixed(1)}%`,
        `Avg duration: ${formatDuration(data.metrics.avgDurationMs)}`,
        `Total cost: $${data.metrics.totalCostUsd.toFixed(2)}`
      );
    }

    lines.push(
      `\n<b>💰 Budget</b>`,
      `Daily: $${data.dailySpend.toFixed(2)} / $${data.dailyBudget.toFixed(2)} (${data.dailyBudget > 0 ? ((data.dailySpend / data.dailyBudget) * 100).toFixed(0) : 0}%)`
    );

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent status error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

export const handleAgentQueue = async (ctx: Context, agentRunnerUrl: string): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/status`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch queue status");
      return;
    }

    const data = (await res.json()) as AgentRunnerStatus;

    const lines: string[] = ["<b>📋 Task Queue</b>\n"];

    if (data.queue.length === 0) {
      lines.push("Queue is empty");
    } else {
      lines.push(`Queued: ${data.queue.length} tasks\n`);

      const sorted = [...data.queue].sort((a, b) => a.nextAttemptAt - b.nextAttemptAt);

      for (const task of sorted.slice(0, 10)) {
        const taskId = `${task.projectIdentifier}-${task.sequenceId}`;
        const waitTime = formatDuration(Date.now() - task.enqueuedAt);
        const nextAttempt =
          task.nextAttemptAt > Date.now()
            ? `in ${formatDuration(task.nextAttemptAt - Date.now())}`
            : "ready";
        const retry = task.retryCount > 0 ? ` (retry ${task.retryCount})` : "";

        lines.push(
          `<code>${taskId}</code>${retry}`,
          `  Wait: ${waitTime} | Next: ${nextAttempt}`,
          `  ${task.title.substring(0, 50)}${task.title.length > 50 ? "..." : ""}`
        );
      }

      if (data.queue.length > 10) {
        lines.push(`\n... and ${data.queue.length - 10} more`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent queue error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

export const handleAgentHealth = async (ctx: Context, agentRunnerUrl: string): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/health`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch health status");
      return;
    }

    const data = (await res.json()) as HealthResponse;

    const statusEmoji = data.status === "healthy" ? "💚" : "⚠️";
    const lines: string[] = [`<b>${statusEmoji} System Health</b>\n`];

    lines.push(`Status: <b>${data.status.toUpperCase()}</b>\n`);

    lines.push(
      `<b>Agents</b>`,
      `  Active: ${data.activeCount}`,
      `  Pending questions: ${data.pending}`
    );

    lines.push(`\n<b>Queue</b>`, `  Depth: ${data.queueDepth} tasks`);

    lines.push(
      `\n<b>Budget</b>`,
      `  Daily: $${data.dailySpend.toFixed(2)} / $${data.dailyBudget.toFixed(2)}`
    );

    if (data.metrics) {
      lines.push(
        `\n<b>Metrics</b>`,
        `  Success rate: ${(data.metrics.successRate * 100).toFixed(1)}%`,
        `  Avg duration: ${formatDuration(data.metrics.avgDurationMs)}`,
        `  Uptime: ${formatDuration(data.metrics.uptime)}`
      );
    }

    if (data.issues.length > 0) {
      lines.push(`\n<b>Issues:</b>`);
      for (const issue of data.issues) {
        lines.push(`  • ${issue}`);
      }
    } else {
      lines.push(`\n✅ No issues detected`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent health error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

export const handleAgentHistory = async (
  ctx: Context,
  agentRunnerUrl: string,
  days: number = 7
): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/history?days=${days}`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch execution history");
      return;
    }

    const data = (await res.json()) as HistoryResponse;

    const lines: string[] = [`<b>📜 Execution History (${days}d)</b>\n`];

    if (data.executions.length === 0) {
      lines.push("No executions in this period");
    } else {
      const successful = data.executions.filter((e) => e.success).length;
      const failed = data.executions.length - successful;

      lines.push(
        `Total: ${data.executions.length} (✅ ${successful} | ❌ ${failed})`,
        `Success rate: ${((successful / data.executions.length) * 100).toFixed(1)}%\n`
      );

      for (const exec of data.executions.slice(0, 10)) {
        const taskId = `${exec.projectIdentifier}-${exec.sequenceId}`;
        const status = exec.success ? "✅" : "❌";
        const duration = formatDuration(exec.durationMs);
        const timestamp = formatTimestamp(exec.completedAt);

        lines.push(
          `${status} <code>${taskId}</code> (${exec.phase})`,
          `  ${duration} | $${exec.costUsd.toFixed(2)} | ${timestamp}`,
          `  ${exec.title.substring(0, 50)}${exec.title.length > 50 ? "..." : ""}`
        );

        if (!exec.success && exec.errorType) {
          lines.push(`  Error: ${exec.errorType}`);
        }
      }

      if (data.executions.length > 10) {
        lines.push(`\n... and ${data.executions.length - 10} more`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent history error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

export const handleAgentErrors = async (ctx: Context, agentRunnerUrl: string): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/errors`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch error list");
      return;
    }

    const data = (await res.json()) as { errors: HistoryResponse["executions"] };

    const lines: string[] = ["<b>⚠️ Recent Errors</b>\n"];

    if (data.errors.length === 0) {
      lines.push("✅ No recent errors");
    } else {
      lines.push(`Found ${data.errors.length} errors\n`);

      for (const error of data.errors.slice(0, 10)) {
        const taskId = `${error.projectIdentifier}-${error.sequenceId}`;
        const timestamp = formatTimestamp(error.completedAt);
        const duration = formatDuration(error.durationMs);

        lines.push(
          `<code>${taskId}</code> (${error.phase})`,
          `  ${timestamp} | ${duration} | $${error.costUsd.toFixed(2)}`,
          `  ${error.title.substring(0, 50)}${error.title.length > 50 ? "..." : ""}`,
          `  Error: ${error.errorType ?? "unknown"}`
        );
      }

      if (data.errors.length > 10) {
        lines.push(`\n... and ${data.errors.length - 10} more`);
      }
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent errors error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};
