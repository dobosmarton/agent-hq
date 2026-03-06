import { Octokit } from "@octokit/rest";
import type {
  GitHubClientResult,
  GitHubConfig,
  GitHubPRDetails,
  GitHubPRFile,
  GitHubReviewComment,
  GitHubReviewEvent,
} from "./types";
import { GitHubPRDetailsSchema, GitHubPRFileSchema } from "./types";

/**
 * Creates a GitHub API client for PR review operations
 */
export const createGitHubClient = (config: GitHubConfig) => {
  const octokit = new Octokit({ auth: config.token });
  const { owner, repo } = config;

  /**
   * Get pull request details
   */
  const getPullRequest = async (
    prNumber: number,
  ): Promise<GitHubClientResult<GitHubPRDetails>> => {
    try {
      const response = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
      });

      const parsed = GitHubPRDetailsSchema.safeParse(response.data);
      if (!parsed.success) {
        return {
          success: false,
          error: `Invalid PR data: ${parsed.error.message}`,
        };
      }

      return { success: true, data: parsed.data };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error fetching PR" };
    }
  };

  /**
   * List files changed in a pull request
   */
  const listPullRequestFiles = async (
    prNumber: number,
  ): Promise<GitHubClientResult<GitHubPRFile[]>> => {
    try {
      const response = await octokit.pulls.listFiles({
        owner,
        repo,
        pull_number: prNumber,
        per_page: 100,
      });

      const files: GitHubPRFile[] = [];
      for (const file of response.data) {
        const parsed = GitHubPRFileSchema.safeParse(file);
        if (parsed.success) {
          files.push(parsed.data);
        }
      }

      return { success: true, data: files };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error listing PR files" };
    }
  };

  /**
   * Get the diff for a pull request
   */
  const getPullRequestDiff = async (
    prNumber: number,
  ): Promise<GitHubClientResult<string>> => {
    try {
      const response = await octokit.pulls.get({
        owner,
        repo,
        pull_number: prNumber,
        mediaType: {
          format: "diff",
        },
      });

      // When requesting diff format, the response data is a string
      const diff = response.data as unknown as string;

      return { success: true, data: diff };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error fetching PR diff" };
    }
  };

  /**
   * Create a review on a pull request
   */
  const createReview = async (
    prNumber: number,
    event: GitHubReviewEvent,
    body: string,
    comments?: GitHubReviewComment[],
  ): Promise<GitHubClientResult<void>> => {
    try {
      await octokit.pulls.createReview({
        owner,
        repo,
        pull_number: prNumber,
        event,
        body,
        comments: comments?.map((c) => ({
          path: c.path,
          line: c.line,
          body: c.body,
        })),
      });

      return { success: true, data: undefined };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error creating review" };
    }
  };

  /**
   * Create a review comment on a specific line
   */
  const createReviewComment = async (
    prNumber: number,
    commitId: string,
    path: string,
    line: number,
    body: string,
  ): Promise<GitHubClientResult<void>> => {
    try {
      await octokit.pulls.createReviewComment({
        owner,
        repo,
        pull_number: prNumber,
        commit_id: commitId,
        path,
        line,
        body,
      });

      return { success: true, data: undefined };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error creating comment" };
    }
  };

  /**
   * Add a comment to a pull request
   */
  const addComment = async (
    prNumber: number,
    body: string,
  ): Promise<GitHubClientResult<void>> => {
    try {
      await octokit.issues.createComment({
        owner,
        repo,
        issue_number: prNumber,
        body,
      });

      return { success: true, data: undefined };
    } catch (error: unknown) {
      if (error instanceof Error) {
        return { success: false, error: error.message };
      }
      return { success: false, error: "Unknown error adding comment" };
    }
  };

  return {
    getPullRequest,
    listPullRequestFiles,
    getPullRequestDiff,
    createReview,
    createReviewComment,
    addComment,
  };
};

export type GitHubClient = ReturnType<typeof createGitHubClient>;
