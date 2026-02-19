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
  sessionId?: string;
  worktreePath: string;
  branchName: string;
  startedAt: number;
  status: "running" | "blocked" | "completed" | "errored";
};

export type RunnerState = {
  activeAgents: Record<string, ActiveAgent>;
  dailySpendUsd: number;
  dailySpendDate: string;
};
