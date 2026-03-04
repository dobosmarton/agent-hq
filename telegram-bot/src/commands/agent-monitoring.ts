import { InputFile, type Context } from "grammy";
import { smartChunkMessage } from "../formatter";

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
  days: number = 7,
  project?: string
): Promise<void> => {
  try {
    const params = new URLSearchParams({ days: String(days) });
    if (project) params.set("project", project);

    const res = await fetch(`${agentRunnerUrl}/history?${params.toString()}`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch execution history");
      return;
    }

    const data = (await res.json()) as HistoryResponse;

    const filterDesc = project ? ` — ${project}` : "";
    const lines: string[] = [`<b>📜 Execution History (${days}d${filterDesc})</b>\n`];

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

type LogsResponse = {
  issueId: string;
  executions: HistoryResponse["executions"];
};

export const handleAgentLogs = async (
  ctx: Context,
  agentRunnerUrl: string,
  issueId: string
): Promise<void> => {
  if (!issueId) {
    await ctx.reply(
      "Usage: <code>/agent_logs ISSUE_ID</code>\nExample: <code>/agent_logs HQ-42</code>",
      { parse_mode: "HTML" }
    );
    return;
  }

  try {
    const res = await fetch(`${agentRunnerUrl}/logs/${encodeURIComponent(issueId)}`);
    if (!res.ok) {
      await ctx.reply(`⚠️ Failed to fetch logs for ${issueId}`);
      return;
    }

    const data = (await res.json()) as LogsResponse;
    const lines: string[] = [`<b>📋 Execution Logs: ${issueId}</b>\n`];

    if (data.executions.length === 0) {
      lines.push(`No execution records found for <code>${issueId}</code>`);
    } else {
      lines.push(`${data.executions.length} execution attempt(s)\n`);

      for (const [i, exec] of data.executions.entries()) {
        const attempt = i + 1;
        const status = exec.success ? "✅ Success" : `❌ Failed (${exec.errorType ?? "unknown"})`;
        const started = formatTimestamp(exec.startedAt);
        const completed = formatTimestamp(exec.completedAt);
        const duration = formatDuration(exec.durationMs);
        const retry = exec.retryCount > 0 ? ` (retry ${exec.retryCount})` : "";

        lines.push(
          `<b>Attempt ${attempt}${retry}</b>`,
          `  Status: ${status}`,
          `  Phase: ${exec.phase}`,
          `  Started: ${started}`,
          `  Completed: ${completed}`,
          `  Duration: ${duration} | Cost: $${exec.costUsd.toFixed(2)}`
        );
      }
    }

    const message = lines.join("\n");
    for (const chunk of smartChunkMessage(message)) {
      await ctx.reply(chunk, { parse_mode: "HTML" });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent logs error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

export const handleAgentDashboard = async (ctx: Context, agentRunnerUrl: string): Promise<void> => {
  try {
    const [statusRes, healthRes] = await Promise.all([
      fetch(`${agentRunnerUrl}/status`),
      fetch(`${agentRunnerUrl}/health`),
    ]);

    if (!statusRes.ok || !healthRes.ok) {
      await ctx.reply("⚠️ Failed to fetch dashboard data");
      return;
    }

    const status = (await statusRes.json()) as AgentRunnerStatus;
    const health = (await healthRes.json()) as HealthResponse;

    const statusEmoji = health.status === "healthy" ? "💚" : "⚠️";
    const lines: string[] = [
      `<b>${statusEmoji} Agent Dashboard</b>\n`,
      `Status: <b>${health.status.toUpperCase()}</b>`,
    ];

    // Active agents summary
    if (status.active.length === 0) {
      lines.push(`\n<b>🤖 Running:</b> none`);
    } else {
      lines.push(`\n<b>🤖 Running:</b> ${status.active.length} agent(s)`);
      for (const agent of status.active.slice(0, 3)) {
        const taskId = `${agent.projectIdentifier}-${agent.sequenceId}`;
        const runtime = formatDuration(Date.now() - agent.startedAt);
        lines.push(`  • <code>${taskId}</code> (${agent.phase}) — ${runtime}`);
      }
      if (status.active.length > 3) {
        lines.push(`  ... and ${status.active.length - 3} more`);
      }
    }

    // Queue summary
    lines.push(`\n<b>📋 Queue:</b> ${status.queue.length} task(s)`);

    // Budget
    const budgetPct =
      status.dailyBudget > 0
        ? `${((status.dailySpend / status.dailyBudget) * 100).toFixed(0)}%`
        : "n/a";
    lines.push(
      `\n<b>💰 Budget:</b> $${status.dailySpend.toFixed(2)} / $${status.dailyBudget.toFixed(2)} (${budgetPct})`
    );

    // Metrics
    if (status.metrics) {
      lines.push(
        `\n<b>📊 Metrics</b>`,
        `  Uptime: ${formatDuration(status.metrics.uptime)}`,
        `  Tasks: ${status.metrics.totalTasks} (✅ ${status.metrics.successfulTasks} ❌ ${status.metrics.failedTasks})`,
        `  Success rate: ${(status.metrics.successRate * 100).toFixed(1)}%`,
        `  Avg duration: ${formatDuration(status.metrics.avgDurationMs)}`
      );
    }

    // Health issues
    if (health.issues.length > 0) {
      lines.push(`\n<b>⚠️ Issues:</b>`);
      for (const issue of health.issues) {
        lines.push(`  • ${issue}`);
      }
    } else {
      lines.push(`\n✅ No issues`);
    }

    await ctx.reply(lines.join("\n"), { parse_mode: "HTML" });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent dashboard error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};

const toCSV = (executions: HistoryResponse["executions"]): string => {
  const header =
    "issueId,projectIdentifier,sequenceId,title,phase,startedAt,completedAt,durationMs,costUsd,success,errorType,retryCount";
  const rows = executions.map((e) =>
    [
      e.issueId,
      e.projectIdentifier,
      e.sequenceId,
      `"${e.title.replace(/"/g, '""')}"`,
      e.phase,
      new Date(e.startedAt).toISOString(),
      new Date(e.completedAt).toISOString(),
      e.durationMs,
      e.costUsd.toFixed(4),
      e.success,
      e.errorType ?? "",
      e.retryCount,
    ].join(",")
  );
  return [header, ...rows].join("\n");
};

export const handleAgentExport = async (
  ctx: Context,
  agentRunnerUrl: string,
  days: number = 7,
  format: "json" | "csv" = "json"
): Promise<void> => {
  try {
    const res = await fetch(`${agentRunnerUrl}/history?days=${days}`);
    if (!res.ok) {
      await ctx.reply("⚠️ Failed to fetch history for export");
      return;
    }

    const data = (await res.json()) as HistoryResponse;
    const count = data.executions.length;

    if (count === 0) {
      await ctx.reply(`No executions found in the last ${days} day(s)`);
      return;
    }

    const timestamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);
    let content: string;
    let filename: string;

    if (format === "csv") {
      content = toCSV(data.executions);
      filename = `agent-history-${days}d-${timestamp}.csv`;
    } else {
      content = JSON.stringify(data.executions, null, 2);
      filename = `agent-history-${days}d-${timestamp}.json`;
    }

    const buffer = Buffer.from(content, "utf-8");
    await ctx.replyWithDocument(new InputFile(buffer, filename), {
      caption: `Agent history: ${count} executions over last ${days} day(s)`,
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Unknown error";
    console.error("Agent export error:", msg);
    await ctx.reply(`⚠️ Error: ${msg}`);
  }
};
