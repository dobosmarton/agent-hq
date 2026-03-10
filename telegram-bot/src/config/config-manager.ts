import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { randomUUID } from "node:crypto";

export type ProjectEntry = {
  repoPath: string;
  repoUrl: string;
  defaultBranch: string;
  planeProjectId: string;
  planeIdentifier: string;
};

export type AgentConfig = {
  projects: Record<string, ProjectEntry>;
  [key: string]: unknown;
};

/**
 * Read agent-runner config.json. Returns null if file missing or unparseable.
 */
export const readAgentConfig = (configPath: string): AgentConfig | null => {
  if (!existsSync(configPath)) {
    return null;
  }

  try {
    const raw = readFileSync(configPath, "utf-8");
    const parsed = JSON.parse(raw) as unknown;
    if (typeof parsed !== "object" || parsed === null) {
      return null;
    }
    const config = parsed as Record<string, unknown>;
    return {
      ...config,
      projects: (config["projects"] as Record<string, ProjectEntry> | undefined) ?? {},
    };
  } catch {
    return null;
  }
};

/**
 * Add a new project entry to the config. Idempotent — does not overwrite an existing identifier.
 * Returns a new config object (does not mutate input).
 */
export const addProjectToConfig = (
  config: AgentConfig,
  identifier: string,
  entry: ProjectEntry
): { config: AgentConfig; status: "added" | "already_exists" } => {
  if (identifier in config.projects) {
    return { config, status: "already_exists" };
  }

  return {
    config: {
      ...config,
      projects: {
        ...config.projects,
        [identifier]: entry,
      },
    },
    status: "added",
  };
};

/**
 * Write config atomically using a temp file + rename.
 * Throws on failure.
 */
export const writeAgentConfig = (configPath: string, config: AgentConfig): void => {
  const tempPath = join(tmpdir(), `agent-config-${randomUUID()}.json`);
  writeFileSync(tempPath, JSON.stringify(config, null, 2), "utf-8");
  renameSync(tempPath, configPath);
};
