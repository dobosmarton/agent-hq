import type { RunnerState } from "@agent-hq/shared-types";
import type { SkillsConfig } from "@agent-hq/skills";

export type { Notifier } from "@agent-hq/shared-types";

/**
 * Cached project info for state transitions
 */
export type ProjectCache = {
  todoStateId: string;
  planReviewStateId: string | null;
  inReviewStateId: string | null;
  doneStateId: string | null;
  backlogStateId?: string | null;
};

/**
 * Task poller adapter — subset of poller needed by agent
 */
export type TaskPollerAdapter = {
  releaseTask: (issueId: string) => void;
  getProjectCache: (projectIdentifier: string) => ProjectCache | undefined;
};

/**
 * State persistence adapter
 */
export type StatePersistence = {
  load: () => Promise<RunnerState>;
  save: (state: RunnerState) => Promise<void>;
};

/**
 * Worktree operation result
 */
export type WorktreeResult = {
  worktreePath: string;
  branchName: string;
  isExisting: boolean;
  lastCommitMessage: string | null;
};

/**
 * Worktree management adapter
 */
export type WorktreeAdapter = {
  getOrCreateWorktree: (
    repoPath: string,
    taskSlug: string,
    defaultBranch: string
  ) => Promise<WorktreeResult>;
  removeWorktree: (repoPath: string, taskSlug: string) => Promise<void>;
};

/** External MCP server configuration (stdio-based) */
export type ExternalMcpServer = {
  command: string;
  args?: string[];
  env?: Record<string, string>;
};

/**
 * Project-level configuration needed by the agent
 */
export type ProjectConfig = {
  repoPath?: string;
  defaultBranch: string;
  ciChecks?: string[];
  mcpServers?: Record<string, ExternalMcpServer>;
};

export type AuthMode = "api" | "subscription";

/**
 * Agent configuration subset needed by the task agent
 */
export type AgentConfig = {
  authMode: AuthMode;
  maxBudgetPerTask: number;
  maxDailyBudget: number;
  maxTurns: number;
  maxRetries: number;
  progressFeedbackEnabled: boolean;
  progressUpdateIntervalMs: number;
  skills: SkillsConfig;
  mcpServers?: Record<string, ExternalMcpServer>;
};

/**
 * Full configuration as seen by the task agent
 */
export type TaskAgentConfig = {
  projects: Record<string, ProjectConfig>;
  agent: AgentConfig;
};
