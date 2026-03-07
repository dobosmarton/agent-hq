/**
 * Shared adapter interfaces for dependency inversion.
 *
 * Agents and orchestrators depend on these interfaces,
 * while consuming apps (agent-runner, telegram-bot) provide concrete implementations.
 */

/** Notification adapter — implemented by Telegram, Slack, etc. */
export type Notifier = {
  agentStarted: (taskId: string, title: string) => Promise<number>;
  agentCompleted: (taskId: string, title: string) => Promise<void>;
  agentErrored: (taskId: string, title: string, error: string) => Promise<void>;
  agentBlocked: (taskId: string, question: string) => Promise<number>;
  agentProgress: (messageId: number, text: string) => Promise<boolean>;
  sendMessage: (text: string, replyToMessageId?: number) => Promise<number>;
};

/** Result type — shared discriminated union */
export type Result<T> = { success: true; data: T } | { success: false; error: string };

/** Review event types for GitHub PR reviews */
export type ReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/** GitHub PR adapter — subset used by review orchestrator */
export type GitHubPRAdapter = {
  getPullRequest: (
    prNumber: number
  ) => Promise<Result<{ title: string; body: string | null; html_url: string }>>;
  getPullRequestDiff: (prNumber: number) => Promise<Result<string>>;
  createReview: (
    prNumber: number,
    event: ReviewEvent,
    body: string,
    comments?: { path: string; line: number; body: string }[]
  ) => Promise<Result<void>>;
  listReviews: (prNumber: number) => Promise<Result<{ user: string; body: string }[]>>;
  addComment: (prNumber: number, body: string) => Promise<Result<void>>;
};

/** Plane task adapter — subset used by orchestrators */
export type PlaneTaskAdapter = {
  addComment: (projectId: string, issueId: string, body: string) => Promise<unknown>;
  updateIssue: (projectId: string, issueId: string, data: { state?: string }) => Promise<unknown>;
  findIssueBySequenceId: (
    projectId: string,
    sequenceId: number
  ) => Promise<{ id: string; name: string; description_html?: string | null } | null>;
  parseIssueIdentifier: (identifier: string) => { sequenceId: number } | null;
};
