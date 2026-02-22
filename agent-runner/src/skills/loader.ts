import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, resolve, basename } from "node:path";
import type { Skill, SkillPhase, SkillsConfig } from "./types";
import { SkillSchema } from "./types";

/**
 * Cache for loaded skills to avoid repeated file I/O
 */
interface SkillCache {
  skills: Skill[];
  timestamp: number;
}

const globalCache = new Map<string, SkillCache>();
const projectCache = new Map<string, SkillCache>();
const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/**
 * Parse skill metadata from markdown frontmatter-style comments
 * Expected format at top of file:
 * <!-- skill:name = Skill Name -->
 * <!-- skill:description = Description text -->
 * <!-- skill:category = best-practices -->
 * <!-- skill:priority = 80 -->
 * <!-- skill:appliesTo = both -->
 */
const parseSkillMetadata = (
  content: string,
  id: string,
  filePath: string,
  isProjectSkill: boolean,
): Skill => {
  const metadata: Record<string, string> = {};
  const lines = content.split("\n");

  for (const line of lines) {
    const match = line.match(/<!--\s*skill:(\w+)\s*=\s*(.+?)\s*-->/);
    if (match) {
      const [, key, value] = match;
      if (key && value) {
        metadata[key] = value.trim();
      }
    }
  }

  // Build skill object with defaults
  const skill = {
    id,
    name: metadata.name || id,
    description: metadata.description || "No description provided",
    category: metadata.category || "best-practices",
    priority: metadata.priority ? parseInt(metadata.priority, 10) : 50,
    content,
    appliesTo: (metadata.appliesTo as SkillPhase) || "both",
    enabled: metadata.enabled !== "false",
    filePath,
    isProjectSkill,
  };

  return SkillSchema.parse(skill);
};

/**
 * Load all skill files from a directory
 */
const loadSkillsFromDir = (dir: string, isProjectSkill: boolean): Skill[] => {
  try {
    const absolutePath = resolve(dir);
    const files = readdirSync(absolutePath);
    const skills: Skill[] = [];

    for (const file of files) {
      // Only process .md files
      if (!file.endsWith(".md")) continue;

      const filePath = join(absolutePath, file);
      const stat = statSync(filePath);

      if (!stat.isFile()) continue;

      const content = readFileSync(filePath, "utf-8");
      const id = basename(file, ".md");

      try {
        const skill = parseSkillMetadata(content, id, filePath, isProjectSkill);
        if (skill.enabled) {
          skills.push(skill);
        }
      } catch (err) {
        console.warn(
          `Failed to parse skill from ${filePath}:`,
          err instanceof Error ? err.message : String(err),
        );
      }
    }

    return skills;
  } catch (err) {
    // Directory doesn't exist or can't be read
    if ((err as NodeJS.ErrnoException).code === "ENOENT") {
      return [];
    }
    console.error(`Error loading skills from ${dir}:`, err);
    return [];
  }
};

/**
 * Load global skills with caching
 */
const loadGlobalSkills = (globalSkillsPath: string): Skill[] => {
  const cached = globalCache.get(globalSkillsPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.skills;
  }

  const skills = loadSkillsFromDir(globalSkillsPath, false);
  globalCache.set(globalSkillsPath, { skills, timestamp: Date.now() });
  return skills;
};

/**
 * Load project-level skills with caching
 */
const loadProjectSkills = (projectRepoPath: string): Skill[] => {
  const projectSkillsPath = join(projectRepoPath, ".claude", "skills");
  const cached = projectCache.get(projectSkillsPath);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    return cached.skills;
  }

  const skills = loadSkillsFromDir(projectSkillsPath, true);
  projectCache.set(projectSkillsPath, { skills, timestamp: Date.now() });
  return skills;
};

/**
 * Merge global and project skills
 * Project skills override global skills with the same ID
 */
const mergeSkills = (
  globalSkills: Skill[],
  projectSkills: Skill[],
): Skill[] => {
  const skillMap = new Map<string, Skill>();

  // Add global skills first
  for (const skill of globalSkills) {
    skillMap.set(skill.id, skill);
  }

  // Override with project skills
  for (const skill of projectSkills) {
    skillMap.set(skill.id, skill);
  }

  return Array.from(skillMap.values());
};

/**
 * Filter skills by phase and sort by priority
 */
const filterAndSortSkills = (
  skills: Skill[],
  phase: SkillPhase,
  maxSkills: number,
): Skill[] => {
  const filtered = skills.filter(
    (skill) => skill.appliesTo === phase || skill.appliesTo === "both",
  );

  // Sort by priority (descending), then by name (ascending)
  filtered.sort((a, b) => {
    if (a.priority !== b.priority) {
      return b.priority - a.priority;
    }
    return a.name.localeCompare(b.name);
  });

  return filtered.slice(0, maxSkills);
};

/**
 * Load and filter skills for a specific phase
 */
export const loadSkills = (
  phase: SkillPhase,
  projectRepoPath: string,
  config: SkillsConfig,
): Skill[] => {
  if (!config.enabled) {
    return [];
  }

  // Resolve global skills path relative to agent-runner directory
  const agentRunnerRoot = resolve(process.cwd());
  const globalSkillsPath = resolve(agentRunnerRoot, config.globalSkillsPath);

  const globalSkills = loadGlobalSkills(globalSkillsPath);
  const projectSkills = loadProjectSkills(projectRepoPath);

  const merged = mergeSkills(globalSkills, projectSkills);
  const filtered = filterAndSortSkills(
    merged,
    phase,
    config.maxSkillsPerPrompt,
  );

  return filtered;
};

/**
 * Clear all caches (useful for testing)
 */
export const clearSkillCache = (): void => {
  globalCache.clear();
  projectCache.clear();
};

/**
 * List all available skills (for CLI)
 */
export const listAllSkills = (
  projectRepoPath: string,
  config: SkillsConfig,
): { global: Skill[]; project: Skill[] } => {
  const agentRunnerRoot = resolve(process.cwd());
  const globalSkillsPath = resolve(agentRunnerRoot, config.globalSkillsPath);

  const global = loadGlobalSkills(globalSkillsPath);
  const project = loadProjectSkills(projectRepoPath);

  return { global, project };
};
