/**
 * GitHub webhook payload types for pull request events
 * https://docs.github.com/en/webhooks/webhook-events-and-payloads#pull_request
 */

import { z } from "zod";

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

/**
 * Zod schema for validating GitHub webhook PR event payloads at the boundary.
 * Uses .passthrough() to allow additional fields GitHub may add without breaking.
 */
const GitHubUserSchema = z
  .object({ login: z.string(), id: z.number() })
  .passthrough();

const GitHubPullRequestSchema = z
  .object({
    id: z.number(),
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.enum(["open", "closed"]),
    merged: z.boolean(),
    merged_at: z.string().nullable(),
    head: z.object({ ref: z.string(), sha: z.string() }).passthrough(),
    base: z.object({ ref: z.string(), sha: z.string() }).passthrough(),
    user: GitHubUserSchema,
    html_url: z.string(),
  })
  .passthrough();

export const GitHubPullRequestEventSchema = z
  .object({
    action: z.string(),
    number: z.number(),
    pull_request: GitHubPullRequestSchema,
    repository: z
      .object({
        id: z.number(),
        name: z.string(),
        full_name: z.string(),
        owner: GitHubUserSchema,
      })
      .passthrough(),
    sender: GitHubUserSchema,
  })
  .passthrough();

export type GitHubPullRequestEvent = z.infer<
  typeof GitHubPullRequestEventSchema
>;

export type WebhookProcessResult = {
  success: boolean;
  taskIds: string[];
  updatedTasks: string[];
  skippedTasks: string[];
  errors: string[];
};
