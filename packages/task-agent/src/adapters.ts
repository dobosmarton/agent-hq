import type { RunnerState } from "@agent-hq/shared-types";
import type { SkillsConfig } from "@agent-hq/skills";

/**
 * Notification interface — implemented by agent-runner's Telegram notifier
 */
export type Notifier = {
  agentStarted: (taskId: string, title: string) => Promise<number>;
  agentCompleted: (taskId: string, title: string) => Promise<void>;
  agentErrored: (taskId: string, title: string, error: string) => Promise<void>;
  agentBlocked: (taskId: string, question: string) => Promise<number>;
  agentProgress: (messageId: number, text: string) => Promise<boolean>;
  sendMessage: (text: string) => Promise<number>;
};

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
  load: () => RunnerState;
  save: (state: RunnerState) => void;
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

/**
 * Project-level configuration needed by the agent
 */
export type ProjectConfig = {
  repoPath?: string;
  defaultBranch: string;
  ciChecks?: string[];
};

/**
 * Agent configuration subset needed by the task agent
 */
export type AgentConfig = {
  maxBudgetPerTask: number;
  maxDailyBudget: number;
  maxTurns: number;
  maxRetries: number;
  progressFeedbackEnabled: boolean;
  progressUpdateIntervalMs: number;
  skills: SkillsConfig;
};

/**
 * Full configuration as seen by the task agent
 */
export type TaskAgentConfig = {
  projects: Record<string, ProjectConfig>;
  agent: AgentConfig;
};
