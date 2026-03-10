import { describe, expect, it, vi, beforeEach } from "vitest";
import type { GitHubConfig } from "../../types";

// Mock dependencies
vi.mock("../../github", () => ({
  getRepository: vi.fn(),
}));

vi.mock("../../config/config-manager", () => ({
  readAgentConfig: vi.fn(),
  addProjectToConfig: vi.fn(),
  writeAgentConfig: vi.fn(),
}));

vi.mock("node:path", () => ({
  resolve: vi.fn((...parts: string[]) => parts.join("/")),
}));

import { getRepository } from "../../github";
import {
  readAgentConfig,
  addProjectToConfig,
  writeAgentConfig,
  type AgentConfig,
} from "../../config/config-manager";
import { linkProject } from "../../config/project-linker";

const mockGetRepository = vi.mocked(getRepository);
const mockReadAgentConfig = vi.mocked(readAgentConfig);
const mockAddProjectToConfig = vi.mocked(addProjectToConfig);
const mockWriteAgentConfig = vi.mocked(writeAgentConfig);

const githubConfig: GitHubConfig = { pat: "test-token" };

const baseParams = {
  githubOwner: "testowner",
  githubRepo: "testrepo",
  githubUrl: "https://github.com/testowner/testrepo",
  planeIdentifier: "TESTREPO",
  planeProjectId: "uuid-1234",
  githubConfig,
  configPath: "/path/to/config.json",
};

const sampleConfig: AgentConfig = {
  projects: {},
  plane: { baseUrl: "http://localhost", workspaceSlug: "test" },
};

const mockGitHubRepo = {
  id: 1,
  name: "testrepo",
  full_name: "testowner/testrepo",
  html_url: "https://github.com/testowner/testrepo",
  description: null,
  language: null,
  stargazers_count: 0,
  owner: { login: "testowner" },
};

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env["AGENT_RUNNER_CONFIG_PATH"];
});

describe("linkProject", () => {
  it("returns success and linked status when all steps succeed", async () => {
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(sampleConfig);
    mockAddProjectToConfig.mockReturnValue({
      config: { ...sampleConfig, projects: { TESTREPO: {} as never } },
      status: "added",
    });
    mockWriteAgentConfig.mockReturnValue(undefined);

    const result = await linkProject(baseParams);

    expect(result).toEqual({ success: true, status: "linked" });
    expect(mockGetRepository).toHaveBeenCalledWith("testowner", "testrepo", githubConfig);
    expect(mockWriteAgentConfig).toHaveBeenCalledOnce();
  });

  it("returns failure when GitHub repo does not exist", async () => {
    mockGetRepository.mockResolvedValue(null);

    const result = await linkProject(baseParams);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("testowner/testrepo");
      expect(result.reason).toContain("not found");
    }
    expect(mockReadAgentConfig).not.toHaveBeenCalled();
    expect(mockWriteAgentConfig).not.toHaveBeenCalled();
  });

  it("returns failure when GitHub API throws", async () => {
    mockGetRepository.mockRejectedValue(new Error("GitHub API error: rate limit exceeded"));

    const result = await linkProject(baseParams);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("rate limit exceeded");
    }
  });

  it("returns failure when config.json cannot be read", async () => {
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(null);

    const result = await linkProject(baseParams);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("config.json");
    }
    expect(mockWriteAgentConfig).not.toHaveBeenCalled();
  });

  it("returns already_exists when identifier is already in config", async () => {
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(sampleConfig);
    mockAddProjectToConfig.mockReturnValue({
      config: sampleConfig,
      status: "already_exists",
    });

    const result = await linkProject(baseParams);

    expect(result).toEqual({ success: true, status: "already_exists" });
    expect(mockWriteAgentConfig).not.toHaveBeenCalled();
  });

  it("returns failure when config write fails", async () => {
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(sampleConfig);
    mockAddProjectToConfig.mockReturnValue({
      config: { ...sampleConfig, projects: { TESTREPO: {} as never } },
      status: "added",
    });
    mockWriteAgentConfig.mockImplementation(() => {
      throw new Error("Permission denied");
    });

    const result = await linkProject(baseParams);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.reason).toContain("Permission denied");
    }
  });

  it("uses AGENT_RUNNER_CONFIG_PATH env var when configPath not provided", async () => {
    process.env["AGENT_RUNNER_CONFIG_PATH"] = "/custom/path/config.json";
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(sampleConfig);
    mockAddProjectToConfig.mockReturnValue({
      config: { ...sampleConfig, projects: { TESTREPO: {} as never } },
      status: "added",
    });
    mockWriteAgentConfig.mockReturnValue(undefined);

    await linkProject({ ...baseParams, configPath: undefined });

    expect(mockReadAgentConfig).toHaveBeenCalledWith("/custom/path/config.json");
  });

  it("passes correct entry to addProjectToConfig", async () => {
    mockGetRepository.mockResolvedValue(mockGitHubRepo as never);
    mockReadAgentConfig.mockReturnValue(sampleConfig);
    mockAddProjectToConfig.mockReturnValue({
      config: { ...sampleConfig, projects: { TESTREPO: {} as never } },
      status: "added",
    });
    mockWriteAgentConfig.mockReturnValue(undefined);

    await linkProject(baseParams);

    expect(mockAddProjectToConfig).toHaveBeenCalledWith(sampleConfig, "TESTREPO", {
      repoPath: "/repos/testrepo",
      repoUrl: "https://github.com/testowner/testrepo",
      defaultBranch: "main",
      planeProjectId: "uuid-1234",
      planeIdentifier: "TESTREPO",
    });
  });
});
