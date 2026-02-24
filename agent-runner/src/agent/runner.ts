import { query } from "@anthropic-ai/claude-agent-sdk";
import type { Config, PlaneConfig } from "../config";
import { addComment } from "../plane/client";
import type { PlaneComment } from "../plane/types";
import type { TaskPoller } from "../poller/task-poller";
import type { Notifier } from "../telegram/notifier";
import type { Skill } from "../skills/types";
import type { AgentErrorType, AgentTask } from "../types";
import type { CiContext } from "./ci-discovery";
import { createAgentMcpServer } from "./mcp-tools";
import type { AgentPhase } from "./phase";
import {
  buildImplementationPrompt,
  buildPlanningPrompt,
} from "./prompt-builder";
import type { CommentAnalysis } from "../plane/comment-analyzer";

type RunnerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  taskPoller: TaskPoller;
  retryContext: {
    retryCount: number;
    maxRetries: number;
  };
};

export type AgentResult = {
  costUsd: number;
  errorType?: AgentErrorType;
};

const PLANNING_TOOLS = [
  "Read",
  "Glob",
  "Grep",
  "Task",
  "mcp__agent-plane-tools__update_task_status",
  "mcp__agent-plane-tools__add_task_comment",
  "mcp__agent-plane-tools__list_labels",
  "mcp__agent-plane-tools__load_skill",
  "mcp__agent-plane-tools__create_skill",
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
  "mcp__agent-plane-tools__list_labels",
  "mcp__agent-plane-tools__add_labels_to_task",
  "mcp__agent-plane-tools__remove_labels_from_task",
  "mcp__agent-plane-tools__load_skill",
  "mcp__agent-plane-tools__create_skill",
];

// Blocklist for destructive commands — takes precedence over allowedTools
const DISALLOWED_TOOLS = [
  "Bash(rm -rf *)",
  "Bash(git push --force*)",
  "Bash(git reset --hard*)",
  "Bash(git clean -f*)",
  "Bash(docker *)",
  "Bash(curl *)",
  "Bash(wget *)",
  "Bash(sudo *)",
];

export type ResumeContext = {
  gitLog: string;
  gitDiff: string;
  lastCommit: string | null;
  analysis: CommentAnalysis;
};

export const runAgent = async (
  task: AgentTask,
  phase: AgentPhase,
  workingDir: string,
  branchName: string,
  comments: PlaneComment[],
  ciContext: CiContext,
  skillsSection: string | undefined,
  skills: Skill[],
  deps: RunnerDeps,
  projectRepoPath: string,
  agentRunnerRoot: string,
  resumeContext: ResumeContext | null = null,
): Promise<AgentResult> => {
  const taskDisplayId = `${task.projectIdentifier}-${task.sequenceId}`;
  const hasRetriesRemaining =
    deps.retryContext.retryCount < deps.retryContext.maxRetries;
  const cache = deps.taskPoller.getProjectCache(task.projectIdentifier);

  const isRetry = deps.retryContext.retryCount > 0;

  console.log(
    `Starting ${phase} agent for ${taskDisplayId}: "${task.title}"${isRetry ? ` (retry ${deps.retryContext.retryCount}/${deps.retryContext.maxRetries})` : ""}`,
  );

  // Notify on Telegram (skip on retries to avoid duplicate notifications)
  if (!isRetry) {
    await deps.notifier.agentStarted(taskDisplayId, task.title);
  }

  // Post starting comment on Plane (always, but with retry info)
  const phaseLabel = phase === "planning" ? "planning" : "implementing";
  const retryLabel = isRetry
    ? ` (retry ${deps.retryContext.retryCount}/${deps.retryContext.maxRetries})`
    : "";
  await addComment(
    deps.planeConfig,
    task.projectId,
    task.issueId,
    `<p><strong>Agent started ${phaseLabel}</strong> this task${retryLabel}.</p>${phase === "implementation" ? `<p>Branch: <code>${branchName}</code></p>` : ""}`,
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
    skills,
    projectRepoPath,
    agentRunnerRoot,
  });

  // Build phase-specific prompt
  const prompt =
    phase === "planning"
      ? buildPlanningPrompt(task, skillsSection, resumeContext)
      : buildImplementationPrompt(
          task,
          branchName,
          comments,
          ciContext,
          skillsSection,
          resumeContext,
        );

  // Phase-specific settings
  const maxTurns = phase === "planning" ? 50 : deps.config.agent.maxTurns;
  const maxBudgetUsd =
    phase === "planning" ? 2.0 : deps.config.agent.maxBudgetPerTask;
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
        disallowedTools: phase === "implementation" ? DISALLOWED_TOOLS : [],
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
          const retryNote =
            deps.retryContext.retryCount > 0
              ? ` (succeeded after ${deps.retryContext.retryCount} ${deps.retryContext.retryCount === 1 ? "retry" : "retries"})`
              : "";
          console.log(
            `Agent ${taskDisplayId} (${phase}) completed successfully${retryNote} (cost: $${totalCostUsd.toFixed(2)})`,
          );
          await deps.notifier.agentCompleted(taskDisplayId, task.title);
          await addComment(
            deps.planeConfig,
            task.projectId,
            task.issueId,
            `<p><strong>Agent completed ${phaseLabel}</strong>${retryNote}.</p><p>Cost: $${totalCostUsd.toFixed(2)}</p>${phase === "implementation" ? `<p>Branch <code>${branchName}</code> is ready for review.</p>` : ""}`,
          );
        } else {
          const errors =
            "errors" in message && Array.isArray(message.errors)
              ? message.errors.join(", ")
              : "";
          const subtype = String(message.subtype ?? "");
          const errorText =
            errors ||
            `result subtype: ${subtype}, cost: $${totalCostUsd.toFixed(2)}`;

          // Classify error type for retry decisions
          let errorType: AgentErrorType = "unknown";
          if (!errors && subtype !== "success") {
            errorType = "rate_limited";
          } else if (subtype.includes("budget")) {
            errorType = "budget_exceeded";
          } else if (subtype.includes("turns")) {
            errorType = "max_turns";
          }

          console.error(
            `Agent ${taskDisplayId} (${phase}) ended with error (subtype=${subtype}, type=${errorType}): ${errorText}`,
          );

          // Suppress notifications for retryable errors when retries remain
          const isRetryableError =
            errorType === "rate_limited" || errorType === "unknown";
          if (!(isRetryableError && hasRetriesRemaining)) {
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

          return { costUsd: totalCostUsd, errorType };
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
    if (!hasRetriesRemaining) {
      await deps.notifier.agentErrored(taskDisplayId, task.title, errorMsg);
      await addComment(
        deps.planeConfig,
        task.projectId,
        task.issueId,
        `<p><strong>Agent crashed during ${phaseLabel}:</strong></p><pre>${errorMsg.slice(0, 1000)}</pre>`,
      );
    }
    throw err;
  }
};
