import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { query } from "@anthropic-ai/claude-agent-sdk";
import type { PlaneClient, PlaneComment } from "@agent-hq/plane-client";
import type { AgentErrorType, AgentPhase, AgentTask } from "@agent-hq/shared-types";
import type { Skill } from "@agent-hq/skills";
import type {
  AgentConfig,
  ExternalMcpServer,
  Notifier,
  TaskAgentConfig,
  TaskPollerAdapter,
} from "./adapters";
import type { CiContext } from "./ci-discovery";
import type { CommentAnalysis } from "./comment-analyzer";
import { createAgentMcpServer } from "./mcp-tools";
import { buildMcpServersRecord } from "./mcp-servers";
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

const GITHUB_MCP_TOOLS = [
  "mcp__github__create_pull_request",
  "mcp__github__get_pull_request",
  "mcp__github__list_pull_requests",
  "mcp__github__create_issue",
  "mcp__github__search_repositories",
  "mcp__github__get_file_contents",
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
  ...GITHUB_MCP_TOOLS,
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

const execAsync = promisify(execFile);

/**
 * Commit and push any uncommitted changes left behind after agent termination.
 * Returns true if a WIP commit was created, false if working tree was clean.
 */
const saveProgress = async (
  workingDir: string,
  branchName: string,
  taskDisplayId: string
): Promise<boolean> => {
  const git = async (args: string[]): Promise<string> => {
    const { stdout } = await execAsync("git", ["-C", workingDir, ...args]);
    return stdout.trim();
  };

  const status = await git(["status", "--porcelain"]);
  if (!status) return false;

  await git(["add", "-A"]);
  await git(["commit", "-m", `${taskDisplayId}: [WIP] save progress before termination`]);
  await git(["push", "-u", "origin", branchName]);

  return true;
};

export type ResumeContext = {
  gitLog: string;
  gitDiff: string;
  lastCommit: string | null;
  analysis: CommentAnalysis;
};

// ── Extracted pure/stateless helpers ─────────────────────────────────

const PLANNING_MAX_TURNS = 50;
const PLANNING_MAX_BUDGET_USD = 2.0;

type PhaseConfig = {
  maxTurns: number;
  maxBudgetUsd: number;
  allowedTools: string[];
  disallowedTools: string[];
  permissionMode: "plan" | "acceptEdits";
  phaseLabel: "planning" | "implementing";
};

export const getPhaseConfig = (phase: AgentPhase, agentConfig: AgentConfig): PhaseConfig => {
  if (phase === "planning") {
    return {
      maxTurns: PLANNING_MAX_TURNS,
      maxBudgetUsd: PLANNING_MAX_BUDGET_USD,
      allowedTools: PLANNING_TOOLS,
      disallowedTools: [],
      permissionMode: "plan",
      phaseLabel: "planning",
    };
  }
  return {
    maxTurns: agentConfig.maxTurns,
    maxBudgetUsd: agentConfig.maxBudgetPerTask,
    allowedTools: IMPLEMENTATION_TOOLS,
    disallowedTools: DISALLOWED_TOOLS,
    permissionMode: "acceptEdits",
    phaseLabel: "implementing",
  };
};

export const classifyError = (subtype: string, errors: string): AgentErrorType => {
  if (subtype.includes("budget")) return "budget_exceeded";
  if (subtype.includes("turns")) return "max_turns";
  if (errors) return "unknown";
  if (subtype === "success") return "unknown";
  return "rate_limited";
};

const notifyAgentError = async (
  deps: RunnerDeps,
  task: AgentTask,
  taskDisplayId: string,
  phaseLabel: "planning" | "implementing",
  errorText: string
): Promise<void> => {
  await deps.notifier.agentErrored(taskDisplayId, task.title, errorText);
  await deps.plane.addComment(
    task.projectId,
    task.issueId,
    `<p><strong>Agent encountered an error during ${phaseLabel}:</strong></p><pre>${errorText.slice(0, 1000)}</pre>`
  );
};

const notifyAgentCrash = async (
  deps: RunnerDeps,
  task: AgentTask,
  taskDisplayId: string,
  phaseLabel: "planning" | "implementing",
  errorText: string
): Promise<void> => {
  await deps.notifier.agentErrored(taskDisplayId, task.title, errorText);
  await deps.plane.addComment(
    task.projectId,
    task.issueId,
    `<p><strong>Agent crashed during ${phaseLabel}:</strong></p><pre>${errorText.slice(0, 1000)}</pre>`
  );
};

// ── Main orchestration ───────────────────────────────────────────────

export type RunAgentInput = {
  task: AgentTask;
  phase: AgentPhase;
  workingDir: string;
  branchName: string;
  comments: PlaneComment[];
  ciContext: CiContext;
  skillsSection: string | undefined;
  skills: Skill[];
  deps: RunnerDeps;
  projectRepoPath: string;
  agentRunnerRoot: string;
  resumeContext: ResumeContext | null;
  externalMcpServers?: Record<string, ExternalMcpServer>;
};

export const runAgent = async (input: RunAgentInput): Promise<AgentResult> => {
  const {
    task,
    phase,
    workingDir,
    branchName,
    comments,
    ciContext,
    skillsSection,
    skills,
    deps,
    projectRepoPath,
    agentRunnerRoot,
    resumeContext,
    externalMcpServers,
  } = input;

  const taskDisplayId = `${task.projectIdentifier}-${task.sequenceId}`;
  const hasRetriesRemaining = deps.retryContext.retryCount < deps.retryContext.maxRetries;
  const cache = deps.taskPoller.getProjectCache(task.projectIdentifier);
  const isRetry = deps.retryContext.retryCount > 0;
  const pc = getPhaseConfig(phase, deps.config.agent);

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

  // Post starting comment on Plane
  const retryLabel = isRetry
    ? ` (retry ${deps.retryContext.retryCount}/${deps.retryContext.maxRetries})`
    : "";

  progressTracker.update("Setting up environment", "in_progress");

  await deps.plane.addComment(
    task.projectId,
    task.issueId,
    `<p><strong>Agent started ${pc.phaseLabel}</strong> this task${retryLabel}.</p>${phase === "implementation" ? `<p>Branch: <code>${branchName}</code></p>` : ""}`
  );

  progressTracker.update("Setting up environment", "completed");

  // Create task-scoped MCP server
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
        permissionMode: pc.permissionMode,
        maxTurns: pc.maxTurns,
        maxBudgetUsd: pc.maxBudgetUsd,
        allowedTools: pc.allowedTools,
        disallowedTools: pc.disallowedTools,
        mcpServers: buildMcpServersRecord({
          sdkServer: mcpServer,
          globalServers: deps.config.agent.mcpServers,
          projectServers: externalMcpServers,
        }),
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
            `<p><strong>Agent completed ${pc.phaseLabel}</strong>${retryNote}.</p><p>Cost: $${totalCostUsd.toFixed(2)}</p>${phase === "implementation" ? `<p>Branch <code>${branchName}</code> is ready for review.</p>` : ""}`
          );
        } else {
          const errors =
            "errors" in message && Array.isArray(message.errors) ? message.errors.join(", ") : "";
          const subtype = String(message.subtype ?? "");
          const errorText =
            errors || `result subtype: ${subtype}, cost: $${totalCostUsd.toFixed(2)}`;

          const errorType = classifyError(subtype, errors);

          console.error(
            `Agent ${taskDisplayId} (${phase}) ended with error (subtype=${subtype}, type=${errorType}): ${errorText}`
          );

          if (errorType === "budget_exceeded" || errorType === "max_turns") {
            if (phase === "implementation") {
              try {
                const saved = await saveProgress(workingDir, branchName, taskDisplayId);
                if (saved) {
                  console.log(`Saved in-progress work for ${taskDisplayId} before termination`);
                }
              } catch (saveErr) {
                console.error(`Failed to save progress for ${taskDisplayId}:`, saveErr);
              }
            }
          }

          // Suppress notifications for retryable errors when retries remain
          const isRetryableError = errorType === "rate_limited" || errorType === "unknown";
          if (!(isRetryableError && hasRetriesRemaining)) {
            await notifyAgentError(deps, task, taskDisplayId, pc.phaseLabel, errorText);
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

    // Save uncommitted work before propagating the crash
    if (phase === "implementation") {
      try {
        const saved = await saveProgress(workingDir, branchName, taskDisplayId);
        if (saved) {
          console.log(`Saved in-progress work for ${taskDisplayId} after crash`);
        }
      } catch {
        // Best effort — don't mask the original error
      }
    }

    if (!hasRetriesRemaining) {
      await notifyAgentCrash(deps, task, taskDisplayId, pc.phaseLabel, errorMsg);
    }
    throw err;
  }
};
