import { z } from "zod";

/**
 * GitHub API types for PR review operations
 */

export type GitHubConfig = {
  token: string;
  owner: string;
  repo: string;
};

/**
 * File change information from GitHub PR
 */
export type GitHubPRFile = {
  filename: string;
  status: "added" | "removed" | "modified" | "renamed";
  additions: number;
  deletions: number;
  changes: number;
  patch?: string;
};

/**
 * Pull request details from GitHub API
 */
export type GitHubPRDetails = {
  number: number;
  title: string;
  body: string | null;
  state: "open" | "closed";
  head: {
    ref: string;
    sha: string;
  };
  base: {
    ref: string;
    sha: string;
  };
  html_url: string;
};

/**
 * Review comment to post on PR
 */
export type GitHubReviewComment = {
  path: string;
  line: number;
  body: string;
};

/**
 * Review event type
 */
export type GitHubReviewEvent = "APPROVE" | "REQUEST_CHANGES" | "COMMENT";

/**
 * Zod schemas for validation at API boundaries
 */

export const GitHubPRFileSchema = z
  .object({
    filename: z.string(),
    status: z.enum(["added", "removed", "modified", "renamed"]),
    additions: z.number(),
    deletions: z.number(),
    changes: z.number(),
    patch: z.string().optional(),
  })
  .passthrough();

export const GitHubPRDetailsSchema = z
  .object({
    number: z.number(),
    title: z.string(),
    body: z.string().nullable(),
    state: z.enum(["open", "closed"]),
    head: z.object({ ref: z.string(), sha: z.string() }).passthrough(),
    base: z.object({ ref: z.string(), sha: z.string() }).passthrough(),
    html_url: z.string(),
  })
  .passthrough();

/**
 * Result types for GitHub operations
 */

export type GitHubClientResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
