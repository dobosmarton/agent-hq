import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PlaneConfig } from "../config.js";
import type { Config } from "../config.js";
import type { AgentTask } from "../types.js";
import type { Notifier } from "../telegram/notifier.js";
import type { TelegramBridge } from "../telegram/bridge.js";
import type { TaskPoller } from "../poller/task-poller.js";
import { createAgentMcpServer } from "./mcp-tools.js";
import { buildAgentPrompt } from "./prompt-builder.js";
import { addComment } from "../plane/client.js";

type RunnerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  telegramBridge: TelegramBridge;
  taskPoller: TaskPoller;
};

export type AgentResult = {
  costUsd: number;
};

export const runAgent = async (
  task: AgentTask,
  worktreePath: string,
  branchName: string,
  deps: RunnerDeps,
): Promise<AgentResult> => {
  const taskDisplayId = `${task.projectIdentifier}-${task.sequenceId}`;
  const cache = deps.taskPoller.getProjectCache(task.projectIdentifier);

  console.log(`Starting agent for ${taskDisplayId}: "${task.title}"`);

  // Notify on Telegram
  await deps.notifier.agentStarted(taskDisplayId, task.title);

  // Post starting comment on Plane
  await addComment(
    deps.planeConfig,
    task.projectId,
    task.issueId,
    `<p><strong>Agent started</strong> working on this task.</p><p>Branch: <code>${branchName}</code></p>`,
  );

  // Create task-scoped MCP server
  const mcpServer = createAgentMcpServer({
    planeConfig: deps.planeConfig,
    projectId: task.projectId,
    issueId: task.issueId,
    taskDisplayId,
    inReviewStateId: cache?.inReviewStateId ?? null,
    doneStateId: cache?.doneStateId ?? null,
    telegramBridge: deps.telegramBridge,
  });

  const prompt = buildAgentPrompt(task, branchName);
  let totalCostUsd = 0;

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: worktreePath,
        permissionMode: "acceptEdits",
        maxTurns: deps.config.agent.maxTurns,
        maxBudgetUsd: deps.config.agent.maxBudgetPerTask,
        allowedTools: [
          "Read",
          "Write",
          "Edit",
          "Bash",
          "Glob",
          "Grep",
          "Task",
          "mcp__agent-plane-tools__update_task_status",
          "mcp__agent-plane-tools__add_task_comment",
          "mcp__agent-plane-tools__ask_human",
        ],
        mcpServers: {
          "agent-plane-tools": mcpServer,
        },
        persistSession: false,
        settingSources: ["project"],
      },
    })) {
      if (message.type === "result") {
        // Extract cost if available
        if (
          "total_cost_usd" in message &&
          typeof message.total_cost_usd === "number"
        ) {
          totalCostUsd = message.total_cost_usd;
        }

        if (message.subtype === "success") {
          console.log(
            `Agent ${taskDisplayId} completed successfully (cost: $${totalCostUsd.toFixed(2)})`,
          );
          await deps.notifier.agentCompleted(taskDisplayId, task.title);
          await addComment(
            deps.planeConfig,
            task.projectId,
            task.issueId,
            `<p><strong>Agent completed</strong> work on this task.</p><p>Branch <code>${branchName}</code> is ready for review.</p><p>Cost: $${totalCostUsd.toFixed(2)}</p>`,
          );
        } else {
          const errorText =
            "errors" in message && Array.isArray(message.errors)
              ? message.errors.join(", ")
              : "Unknown error";
          console.error(
            `Agent ${taskDisplayId} ended with error: ${errorText}`,
          );
          await deps.notifier.agentErrored(
            taskDisplayId,
            task.title,
            errorText,
          );
          await addComment(
            deps.planeConfig,
            task.projectId,
            task.issueId,
            `<p><strong>Agent encountered an error:</strong></p><pre>${errorText.slice(0, 1000)}</pre>`,
          );
        }
      }
    }

    return { costUsd: totalCostUsd };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Agent ${taskDisplayId} crashed: ${errorMsg}`);
    await deps.notifier.agentErrored(taskDisplayId, task.title, errorMsg);
    await addComment(
      deps.planeConfig,
      task.projectId,
      task.issueId,
      `<p><strong>Agent crashed:</strong></p><pre>${errorMsg.slice(0, 1000)}</pre>`,
    );
    throw err;
  }
};
