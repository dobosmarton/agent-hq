/**
 * GitHub webhook payload types for pull request events
 * https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request
 */

export type GitHubUser = {
  login: string;
  id: number;
};

export type GitHubRepository = {
  id: number;
  name: string;
  full_name: string;
  owner: GitHubUser;
};

export type GitHubCommit = {
  sha: string;
  message: string;
  author: {
    name: string;
    email: string;
  };
};

export type GitHubPullRequest = {
  id: number;
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  merged: boolean;
  merged_at: string | null;
  head: {
    ref: string; // branch name
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  user: GitHubUser;
  html_url: string;
};

export type GitHubPullRequestEvent = {
  action: "opened" | "closed" | "reopened" | "synchronize" | "edited";
  number: number;
  pull_request: GitHubPullRequest;
  repository: GitHubRepository;
  sender: GitHubUser;
};

export type WebhookProcessResult = {
  success: boolean;
  taskIds: string[];
  updatedTasks: string[];
  skippedTasks: string[];
  errors: string[];
};
