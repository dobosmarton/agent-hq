import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

export type CiContext = {
  /** Raw content of each CI workflow file, keyed by relative path */
  workflowFiles: Record<string, string>;
  /** Optional manual override commands from config */
  overrideCommands?: string[];
};

const MAX_TOTAL_BYTES = 50_000;

/**
 * Reads all GitHub Actions workflow YAML files from a repo.
 * Returns an empty workflowFiles map if the directory doesn't exist.
 */
export const readCiWorkflows = (repoPath: string): CiContext => {
  const workflowDir = join(repoPath, ".github", "workflows");

  if (!existsSync(workflowDir)) {
    return { workflowFiles: {} };
  }

  let entries: string[];
  try {
    entries = readdirSync(workflowDir);
  } catch (err) {
    console.warn(`Failed to read CI workflow directory ${workflowDir}:`, err);
    return { workflowFiles: {} };
  }

  const yamlFiles = entries.filter(
    (f) => f.endsWith(".yml") || f.endsWith(".yaml"),
  );

  const workflowFiles: Record<string, string> = {};
  let totalBytes = 0;

  for (const file of yamlFiles) {
    const fullPath = join(workflowDir, file);
    const relativePath = `.github/workflows/${file}`;

    try {
      const content = readFileSync(fullPath, "utf-8");

      if (totalBytes + content.length > MAX_TOTAL_BYTES) {
        console.warn(
          `CI workflow content exceeds ${MAX_TOTAL_BYTES} bytes, skipping remaining files`,
        );
        break;
      }

      workflowFiles[relativePath] = content;
      totalBytes += content.length;
    } catch (err) {
      console.warn(`Failed to read CI workflow file ${fullPath}:`, err);
    }
  }

  return { workflowFiles };
};
