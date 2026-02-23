import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { SkillCategory, SkillPhase } from "./types";

export type CreateSkillInput = {
  name: string;
  description: string;
  content: string;
  category: SkillCategory;
  priority: number;
  appliesTo: SkillPhase;
};

export type CreateSkillTarget = {
  /** Base skills directory (e.g., "<repoPath>/.claude/skills" or "<agentRunnerRoot>/skills") */
  baseDir: string;
  /** Subdirectory within baseDir (e.g., "learned") */
  subdirectory: string;
};

/**
 * Convert a skill name to a filename-safe slug
 */
export const slugify = (name: string): string =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60);

/**
 * Generate skill markdown with metadata headers
 */
export const generateSkillMarkdown = (input: CreateSkillInput): string =>
  [
    `<!-- skill:name = ${input.name} -->`,
    `<!-- skill:description = ${input.description} -->`,
    `<!-- skill:category = ${input.category} -->`,
    `<!-- skill:priority = ${input.priority} -->`,
    `<!-- skill:appliesTo = ${input.appliesTo} -->`,
    "",
    input.content,
  ].join("\n");

/**
 * Create a skill file on disk with deduplication
 * Returns the path and slug of the created file
 */
export const createSkillFile = (
  input: CreateSkillInput,
  target: CreateSkillTarget,
): { filePath: string; slug: string } => {
  const slug = slugify(input.name);
  if (!slug) {
    throw new Error(
      "Could not generate a valid filename from the skill name. Use a name with alphanumeric characters.",
    );
  }

  const targetDir = join(target.baseDir, target.subdirectory);
  mkdirSync(targetDir, { recursive: true });

  let filePath = join(targetDir, `${slug}.md`);

  // Deduplicate if file already exists
  if (existsSync(filePath)) {
    const timestamp = Date.now();
    filePath = join(targetDir, `${slug}-${timestamp}.md`);
  }

  const markdown = generateSkillMarkdown(input);
  writeFileSync(filePath, markdown, "utf-8");

  return { filePath, slug };
};
