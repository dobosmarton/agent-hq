import type { Config, Env, PlaneConfig } from "../../config";

export const makeConfig = (overrides?: Partial<Config>): Config => ({
  plane: {
    baseUrl: "http://localhost/api/v1",
    workspaceSlug: "test-ws",
  },
  projects: {
    HQ: {
      repoPath: "/repos/hq",
      repoUrl: "https://github.com/test/hq",
      defaultBranch: "main",
    },
  },
  agent: {
    maxConcurrent: 2,
    maxBudgetPerTask: 5,
    maxDailyBudget: 20,
    maxTurns: 200,
    pollIntervalMs: 30000,
    spawnDelayMs: 15000,
    maxRetries: 2,
    retryBaseDelayMs: 60000,
    labelName: "agent",
  },
  ...overrides,
});

export const makeEnv = (overrides?: Partial<Env>): Env => ({
  PLANE_API_KEY: "test-plane-key",
  ANTHROPIC_API_KEY: "test-anthropic-key",
  GITHUB_PAT: "test-github-pat",
  ...overrides,
});

export const makePlaneConfig = (
  overrides?: Partial<PlaneConfig>,
): PlaneConfig => ({
  apiKey: "test-api-key",
  baseUrl: "http://localhost/api/v1",
  workspaceSlug: "test-ws",
  ...overrides,
});
