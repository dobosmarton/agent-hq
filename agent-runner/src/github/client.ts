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
 * GitHub API client for PR review operations
 */
export class GitHubClient {
  private readonly octokit: Octokit;
  private readonly owner: string;
  private readonly repo: string;

  constructor(config: GitHubConfig) {
    this.octokit = new Octokit({ auth: config.token });
    this.owner = config.owner;
    this.repo = config.repo;
  }

  /**
   * Get pull request details
   */
  public getPullRequest = async (
    prNumber: number,
  ): Promise<GitHubClientResult<GitHubPRDetails>> => {
    try {
      const response = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
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
  public listPullRequestFiles = async (
    prNumber: number,
  ): Promise<GitHubClientResult<GitHubPRFile[]>> => {
    try {
      const response = await this.octokit.pulls.listFiles({
        owner: this.owner,
        repo: this.repo,
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
  public getPullRequestDiff = async (
    prNumber: number,
  ): Promise<GitHubClientResult<string>> => {
    try {
      const response = await this.octokit.pulls.get({
        owner: this.owner,
        repo: this.repo,
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
  public createReview = async (
    prNumber: number,
    event: GitHubReviewEvent,
    body: string,
    comments?: GitHubReviewComment[],
  ): Promise<GitHubClientResult<void>> => {
    try {
      await this.octokit.pulls.createReview({
        owner: this.owner,
        repo: this.repo,
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
  public createReviewComment = async (
    prNumber: number,
    commitId: string,
    path: string,
    line: number,
    body: string,
  ): Promise<GitHubClientResult<void>> => {
    try {
      await this.octokit.pulls.createReviewComment({
        owner: this.owner,
        repo: this.repo,
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
  public addComment = async (
    prNumber: number,
    body: string,
  ): Promise<GitHubClientResult<void>> => {
    try {
      await this.octokit.issues.createComment({
        owner: this.owner,
        repo: this.repo,
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
}
