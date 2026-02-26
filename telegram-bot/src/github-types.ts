import { z } from "zod";

/**
 * GitHub repository information returned from API
 */
export const GitHubRepoSchema = z.object({
  id: z.number(),
  name: z.string(),
  full_name: z.string(),
  owner: z.object({
    login: z.string(),
    type: z.string(),
  }),
  html_url: z.string(),
  description: z.string().nullable(),
  stargazers_count: z.number(),
  language: z.string().nullable(),
  private: z.boolean(),
  default_branch: z.string(),
});

export type GitHubRepo = z.infer<typeof GitHubRepoSchema>;

/**
 * GitHub configuration for API access
 */
export type GitHubConfig = {
  pat: string; // Personal Access Token
};
