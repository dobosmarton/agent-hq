import { resolve } from "node:path";
import type { GitHubConfig } from "../types";
import { getRepository } from "../github";
import { addProjectToConfig, readAgentConfig, writeAgentConfig } from "./config-manager";

export type LinkProjectParams = {
  githubOwner: string;
  githubRepo: string;
  githubUrl: string;
  planeIdentifier: string;
  planeProjectId: string;
  githubConfig: GitHubConfig;
  configPath?: string;
};

export type LinkProjectResult =
  | { success: true; status: "linked" | "already_exists" }
  | { success: false; reason: string };

const resolveConfigPath = (configPath?: string): string => {
  return (
    configPath ??
    process.env["AGENT_RUNNER_CONFIG_PATH"] ??
    resolve(process.cwd(), "../agent-runner/config.json")
  );
};

/**
 * Validate GitHub repo exists, then update agent-runner config.json atomically.
 */
export const linkProject = async (params: LinkProjectParams): Promise<LinkProjectResult> => {
  const {
    githubOwner,
    githubRepo,
    githubUrl,
    planeIdentifier,
    planeProjectId,
    githubConfig,
    configPath,
  } = params;

  // Step 1: Validate GitHub repo exists
  let repoExists: boolean;
  try {
    const repo = await getRepository(githubOwner, githubRepo, githubConfig);
    repoExists = repo !== null;
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Failed to validate GitHub repository",
    };
  }

  if (!repoExists) {
    return {
      success: false,
      reason: `GitHub repository not found: ${githubOwner}/${githubRepo}. Please create it first.`,
    };
  }

  // Step 2: Read existing config
  const resolvedPath = resolveConfigPath(configPath);
  const config = readAgentConfig(resolvedPath);

  if (config === null) {
    return {
      success: false,
      reason: `Could not read config.json at: ${resolvedPath}. File may be missing or invalid.`,
    };
  }

  // Step 3: Add project entry (idempotent)
  const { config: updatedConfig, status } = addProjectToConfig(config, planeIdentifier, {
    repoPath: `/repos/${githubRepo}`,
    repoUrl: githubUrl,
    defaultBranch: "main",
    planeProjectId,
    planeIdentifier,
  });

  if (status === "already_exists") {
    return { success: true, status: "already_exists" };
  }

  // Step 4: Write atomically
  try {
    writeAgentConfig(resolvedPath, updatedConfig);
  } catch (error) {
    return {
      success: false,
      reason: error instanceof Error ? error.message : "Failed to write config.json",
    };
  }

  return { success: true, status: "linked" };
};
