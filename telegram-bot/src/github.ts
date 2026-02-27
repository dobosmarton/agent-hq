import { Octokit } from "@octokit/rest";
import { z } from "zod";
import { type GitHubConfig, type GitHubRepo, GitHubRepoSchema } from "./github-types";

const OctokitErrorSchema = z.object({ status: z.number() }).passthrough();

/**
 * Parse GitHub URL into owner and repo
 * Supports formats:
 * - https://github.com/owner/repo
 * - github.com/owner/repo
 * - owner/repo
 */
export const parseGitHubUrl = (url: string): { owner: string; repo: string } | null => {
  // Remove protocol and www if present
  const cleaned = url.replace(/^(https?:\/\/)?(www\.)?/, "");

  // Try to match github.com/owner/repo format
  const githubMatch = cleaned.match(/^github\.com\/([^\/]+)\/([^\/]+)/);
  if (githubMatch) {
    return {
      owner: githubMatch[1]!,
      repo: githubMatch[2]!.replace(/\.git$/, ""),
    };
  }

  // Try to match owner/repo format
  const shortMatch = cleaned.match(/^([^\/]+)\/([^\/]+)$/);
  if (shortMatch) {
    return {
      owner: shortMatch[1]!,
      repo: shortMatch[2]!.replace(/\.git$/, ""),
    };
  }

  return null;
};

/**
 * Search GitHub repositories by query string
 * Returns top 5 results sorted by stars
 */
export const searchRepositories = async (
  query: string,
  config: GitHubConfig
): Promise<GitHubRepo[]> => {
  const octokit = new Octokit({ auth: config.pat });

  try {
    const response = await octokit.search.repos({
      q: query,
      per_page: 5,
      sort: "stars",
      order: "desc",
    });

    // Validate and parse results
    const repos: GitHubRepo[] = [];
    for (const item of response.data.items) {
      const result = GitHubRepoSchema.safeParse(item);
      if (result.success) {
        repos.push(result.data);
      }
    }

    return repos;
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHub API error: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Get a specific GitHub repository by owner and repo name
 */
export const getRepository = async (
  owner: string,
  repo: string,
  config: GitHubConfig
): Promise<GitHubRepo | null> => {
  const octokit = new Octokit({ auth: config.pat });

  try {
    const response = await octokit.repos.get({
      owner,
      repo,
    });

    return GitHubRepoSchema.parse(response.data);
  } catch (error: unknown) {
    // Return null if repo not found
    const parsed = OctokitErrorSchema.safeParse(error);
    if (parsed.success && parsed.data.status === 404) {
      return null;
    }
    if (error instanceof Error) {
      throw new Error(`GitHub API error: ${error.message}`);
    }
    throw error;
  }
};

/**
 * Search repositories accessible to the authenticated user
 * Includes personal repos and repos from all accessible organizations
 */
export const searchUserRepositories = async (
  query: string,
  config: GitHubConfig
): Promise<GitHubRepo[]> => {
  const octokit = new Octokit({ auth: config.pat });

  try {
    // Get authenticated user info
    const { data: user } = await octokit.users.getAuthenticated();

    // Search with user qualifier to limit to user's accessible repos
    const response = await octokit.search.repos({
      q: `${query} user:${user.login}`,
      per_page: 5,
      sort: "stars",
      order: "desc",
    });

    // Also search in user's organizations
    const orgRepos: GitHubRepo[] = [];
    try {
      const { data: orgs } = await octokit.orgs.listForAuthenticatedUser({
        per_page: 10,
      });

      // Search in each org (up to 10 orgs)
      for (const org of orgs) {
        const orgResponse = await octokit.search.repos({
          q: `${query} org:${org.login}`,
          per_page: 3,
          sort: "stars",
          order: "desc",
        });

        for (const item of orgResponse.data.items) {
          const result = GitHubRepoSchema.safeParse(item);
          if (result.success) {
            orgRepos.push(result.data);
          }
        }
      }
    } catch (error) {
      console.warn("Failed to search org repos:", error);
      // Continue with just user repos
    }

    // Combine and deduplicate results
    const allRepos: GitHubRepo[] = [];
    const seen = new Set<number>();

    for (const item of [...response.data.items, ...orgRepos]) {
      const result = GitHubRepoSchema.safeParse(item);
      if (result.success && !seen.has(result.data.id)) {
        seen.add(result.data.id);
        allRepos.push(result.data);
      }
    }

    // Sort by stars and return top 5
    return allRepos.sort((a, b) => b.stargazers_count - a.stargazers_count).slice(0, 5);
  } catch (error) {
    if (error instanceof Error) {
      throw new Error(`GitHub API error: ${error.message}`);
    }
    throw error;
  }
};
