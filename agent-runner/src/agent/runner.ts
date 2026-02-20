import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PlaneConfig } from "../config.js";
import type { Config } from "../config.js";
import type { AgentTask } from "../types.js";
import type { AgentPhase } from "./phase.js";
import type { PlaneComment } from "../plane/types.js";
import type { Notifier } from "../telegram/notifier.js";
import type { TaskPoller } from "../poller/task-poller.js";
import { createAgentMcpServer } from "./mcp-tools.js";
import {
  buildPlanningPrompt,
  buildImplementationPrompt,
} from "./prompt-builder.js";
import { addComment } from "../plane/client.js";

type RunnerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  taskPoller: TaskPoller;
};

export type AgentResult = {
  costUsd: number;
};

const PLANNING_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Task",
  "mcp__agent-plane-tools__update_task_status",
  "mcp__agent-plane-tools__add_task_comment",
];

const IMPLEMENTATION_TOOLS = [
  "Read",
  "Write",
  "Edit",
  "Bash",
  "Glob",
  "Grep",
  "Task",
  "mcp__agent-plane-tools__update_task_status",
  "mcp__agent-plane-tools__add_task_comment",
  "mcp__agent-plane-tools__add_task_link",
];

export const runAgent = async (
  task: AgentTask,
  phase: AgentPhase,
  workingDir: string,
  branchName: string,
  comments: PlaneComment[],
  deps: RunnerDeps,
): Promise<AgentResult> => {
  const taskDisplayId = `${task.projectIdentifier}-${task.sequenceId}`;
  const cache = deps.taskPoller.getProjectCache(task.projectIdentifier);

  console.log(`Starting ${phase} agent for ${taskDisplayId}: "${task.title}"`);

  // Notify on Telegram
  await deps.notifier.agentStarted(taskDisplayId, task.title);

  // Post starting comment on Plane
  const phaseLabel = phase === "planning" ? "planning" : "implementing";
  await addComment(
    deps.planeConfig,
    task.projectId,
    task.issueId,
    `<p><strong>Agent started ${phaseLabel}</strong> this task.</p>${phase === "implementation" ? `<p>Branch: <code>${branchName}</code></p>` : ""}`,
  );

  // Create task-scoped MCP server
  const mcpServer = createAgentMcpServer({
    planeConfig: deps.planeConfig,
    projectId: task.projectId,
    issueId: task.issueId,
    taskDisplayId,
    planReviewStateId: cache?.planReviewStateId ?? null,
    inReviewStateId: cache?.inReviewStateId ?? null,
    doneStateId: cache?.doneStateId ?? null,
  });

  // Build phase-specific prompt
  const prompt =
    phase === "planning"
      ? buildPlanningPrompt(task)
      : buildImplementationPrompt(task, branchName, comments);

  // Phase-specific settings
  const maxTurns = phase === "planning" ? 50 : deps.config.agent.maxTurns;
  const maxBudgetUsd =
    phase === "planning" ? 1.0 : deps.config.agent.maxBudgetPerTask;
  const allowedTools =
    phase === "planning" ? PLANNING_TOOLS : IMPLEMENTATION_TOOLS;
  const permissionMode = phase === "planning" ? "plan" : "acceptEdits";

  let totalCostUsd = 0;

  try {
    for await (const message of query({
      prompt,
      options: {
        cwd: workingDir,
        permissionMode,
        maxTurns,
        maxBudgetUsd,
        allowedTools,
        mcpServers: {
          "agent-plane-tools": mcpServer,
        },
        persistSession: false,
        settingSources: ["project"],
      },
    })) {
      if (message.type === "result") {
        if (
          "total_cost_usd" in message &&
          typeof message.total_cost_usd === "number"
        ) {
          totalCostUsd = message.total_cost_usd;
        }

        if (message.subtype === "success") {
          console.log(
            `Agent ${taskDisplayId} (${phase}) completed successfully (cost: $${totalCostUsd.toFixed(2)})`,
          );
          await deps.notifier.agentCompleted(taskDisplayId, task.title);
          await addComment(
            deps.planeConfig,
            task.projectId,
            task.issueId,
            `<p><strong>Agent completed ${phaseLabel}</strong>.</p><p>Cost: $${totalCostUsd.toFixed(2)}</p>${phase === "implementation" ? `<p>Branch <code>${branchName}</code> is ready for review.</p>` : ""}`,
          );
        } else {
          const errorText =
            "errors" in message && Array.isArray(message.errors)
              ? message.errors.join(", ")
              : "Unknown error";
          console.error(
            `Agent ${taskDisplayId} (${phase}) ended with error: ${errorText}`,
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
            `<p><strong>Agent encountered an error during ${phaseLabel}:</strong></p><pre>${errorText.slice(0, 1000)}</pre>`,
          );
        }

        // Return immediately after processing the result message.
        // The Claude Code process may exit with a non-zero code after
        // yielding the result, which would throw if we continue iterating.
        return { costUsd: totalCostUsd };
      }
    }

    return { costUsd: totalCostUsd };
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error(`Agent ${taskDisplayId} (${phase}) crashed: ${errorMsg}`);
    await deps.notifier.agentErrored(taskDisplayId, task.title, errorMsg);
    await addComment(
      deps.planeConfig,
      task.projectId,
      task.issueId,
      `<p><strong>Agent crashed during ${phaseLabel}:</strong></p><pre>${errorMsg.slice(0, 1000)}</pre>`,
    );
    throw err;
  }
};
