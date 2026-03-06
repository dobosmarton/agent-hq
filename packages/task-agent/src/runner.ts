import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PlaneClient, PlaneComment } from "@agent-hq/plane-client";
import type { AgentErrorType, AgentPhase, AgentTask } from "@agent-hq/shared-types";
import type { Skill } from "@agent-hq/skills";
import type { Notifier, TaskAgentConfig, TaskPollerAdapter } from "./adapters";
import type { CiContext } from "./ci-discovery";
import type { CommentAnalysis } from "./comment-analyzer";
import { createAgentMcpServer } from "./mcp-tools";
import { createAgentProgressTracker } from "./progress-tracker";
import { buildImplementationPrompt, buildPlanningPrompt } from "./prompt-builder";

type RunnerDeps = {
  plane: PlaneClient;
  config: TaskAgentConfig;
  notifier: Notifier;
  taskPoller: TaskPollerAdapter;
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
  "mcp__agent-plane-tools__validate_quality_gate",
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
  resumeContext: ResumeContext | null = null
): Promise<AgentResult> => {
  const taskDisplayId = `${task.projectIdentifier}-${task.sequenceId}`;
  const hasRetriesRemaining = deps.retryContext.retryCount < deps.retryContext.maxRetries;
  const cache = deps.taskPoller.getProjectCache(task.projectIdentifier);

  const isRetry = deps.retryContext.retryCount > 0;

  console.log(
    `Starting ${phase} agent for ${taskDisplayId}: "${task.title}"${isRetry ? ` (retry ${deps.retryContext.retryCount}/${deps.retryContext.maxRetries})` : ""}`
  );

  // Notify on Telegram and start progress tracking
  let progressMessageId = 0;
  if (!isRetry) {
    progressMessageId = await deps.notifier.agentStarted(taskDisplayId, task.title);
  }

  const progressTracker = createAgentProgressTracker({
    notifier: deps.notifier,
    messageId: progressMessageId,
    taskDisplayId,
    taskTitle: task.title,
    enabled: deps.config.agent.progressFeedbackEnabled,
    updateIntervalMs: deps.config.agent.progressUpdateIntervalMs,
  });

  // Post starting comment on Plane (always, but with retry info)
  const phaseLabel = phase === "planning" ? "planning" : "implementing";
  const retryLabel = isRetry
    ? ` (retry ${deps.retryContext.retryCount}/${deps.retryContext.maxRetries})`
    : "";

  progressTracker.update("Setting up environment", "in_progress");

  await deps.plane.addComment(
    task.projectId,
    task.issueId,
    `<p><strong>Agent started ${phaseLabel}</strong> this task${retryLabel}.</p>${phase === "implementation" ? `<p>Branch: <code>${branchName}</code></p>` : ""}`
  );

  progressTracker.update("Setting up environment", "completed");

  // Create task-scoped MCP server (synchronous — mark completed directly)
  const mcpServer = createAgentMcpServer({
    plane: deps.plane,
    projectId: task.projectId,
    issueId: task.issueId,
    taskDisplayId,
    planReviewStateId: cache?.planReviewStateId ?? null,
    inReviewStateId: cache?.inReviewStateId ?? null,
    doneStateId: cache?.doneStateId ?? null,
    skills,
    projectRepoPath,
    agentRunnerRoot,
    ciCommands: ciContext.overrideCommands ?? [],
  });

  progressTracker.update("Loading skills", "completed");

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
          resumeContext
        );

  // Phase-specific settings
  const maxTurns = phase === "planning" ? 50 : deps.config.agent.maxTurns;
  const maxBudgetUsd = phase === "planning" ? 2.0 : deps.config.agent.maxBudgetPerTask;
  const allowedTools = phase === "planning" ? PLANNING_TOOLS : IMPLEMENTATION_TOOLS;
  const permissionMode = phase === "planning" ? "plan" : "acceptEdits";

  let totalCostUsd = 0;

  try {
    progressTracker.update(
      phase === "planning" ? "Planning implementation" : "Implementing changes",
      "in_progress"
    );

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
        if ("total_cost_usd" in message && typeof message.total_cost_usd === "number") {
          totalCostUsd = message.total_cost_usd;
        }

        if (message.subtype === "success") {
          const retryNote =
            deps.retryContext.retryCount > 0
              ? ` (succeeded after ${deps.retryContext.retryCount} ${deps.retryContext.retryCount === 1 ? "retry" : "retries"})`
              : "";
          console.log(
            `Agent ${taskDisplayId} (${phase}) completed successfully${retryNote} (cost: $${totalCostUsd.toFixed(2)})`
          );
          await deps.notifier.agentCompleted(taskDisplayId, task.title);
          await deps.plane.addComment(
            task.projectId,
            task.issueId,
            `<p><strong>Agent completed ${phaseLabel}</strong>${retryNote}.</p><p>Cost: $${totalCostUsd.toFixed(2)}</p>${phase === "implementation" ? `<p>Branch <code>${branchName}</code> is ready for review.</p>` : ""}`
          );
        } else {
          const errors =
            "errors" in message && Array.isArray(message.errors) ? message.errors.join(", ") : "";
          const subtype = String(message.subtype ?? "");
          const errorText =
            errors || `result subtype: ${subtype}, cost: $${totalCostUsd.toFixed(2)}`;

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
            `Agent ${taskDisplayId} (${phase}) ended with error (subtype=${subtype}, type=${errorType}): ${errorText}`
          );

          // Suppress notifications for retryable errors when retries remain
          const isRetryableError = errorType === "rate_limited" || errorType === "unknown";
          if (!(isRetryableError && hasRetriesRemaining)) {
            await deps.notifier.agentErrored(taskDisplayId, task.title, errorText);
            await deps.plane.addComment(
              task.projectId,
              task.issueId,
              `<p><strong>Agent encountered an error during ${phaseLabel}:</strong></p><pre>${errorText.slice(0, 1000)}</pre>`
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
      await deps.plane.addComment(
        task.projectId,
        task.issueId,
        `<p><strong>Agent crashed during ${phaseLabel}:</strong></p><pre>${errorMsg.slice(0, 1000)}</pre>`
      );
    }
    throw err;
  }
};
