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
};

export type RunnerState = {
  activeAgents: Record<string, ActiveAgent>;
  dailySpendUsd: number;
  dailySpendDate: string;
};
