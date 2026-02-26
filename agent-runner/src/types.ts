export type AgentTask = {
  issueId: string;
  projectId: string;
  projectIdentifier: string;
  sequenceId: number;
  title: string;
  descriptionHtml: string;
  stateId: string;
  labelIds: string[];
};

export type AgentErrorType =
  | "rate_limited"
  | "budget_exceeded"
  | "max_turns"
  | "unknown";

export type ActiveAgent = {
  task: AgentTask;
  phase: "planning" | "implementation";
  sessionId?: string;
  worktreePath: string;
  branchName: string;
  startedAt: number;
  status: "running" | "blocked" | "completed" | "errored";
  costUsd?: number;
  alertedStale?: boolean;
  retryCount: number;
};

export type SpawnResult =
  | { outcome: "started" }
  | {
      outcome: "rejected";
      reason: "no_project_config" | "budget_exceeded" | "no_repo_path";
    }
  | { outcome: "error"; reason: string };

export type AgentDoneResult = {
  costUsd: number;
  errorType?: AgentErrorType;
  crashed?: boolean;
  error?: string;
};

export type SerializedQueueEntry = {
  task: AgentTask;
  retryCount: number;
  nextAttemptAt: number;
  enqueuedAt: number;
};

export type RunnerState = {
  activeAgents: Record<string, ActiveAgent>;
  dailySpendUsd: number;
  dailySpendDate: string;
  queuedTasks?: SerializedQueueEntry[];
};
