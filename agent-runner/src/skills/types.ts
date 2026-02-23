import { z } from "zod";

/**
 * Skill applies to planning phase, implementation phase, or both
 */
export const SkillPhaseSchema = z.enum(["planning", "implementation", "both"]);
export type SkillPhase = z.infer<typeof SkillPhaseSchema>;

/**
 * Skill categories for organization
 */
export const SkillCategorySchema = z.enum([
  "naming-conventions",
  "error-handling",
  "testing",
  "security",
  "documentation",
  "architecture",
  "best-practices",
  "patterns",
  "commit-standards",
  "api-usage",
  "learned",
]);
export type SkillCategory = z.infer<typeof SkillCategorySchema>;

/**
 * Parsed skill from markdown file
 */
export const SkillSchema = z.object({
  /** Unique identifier (derived from filename without extension) */
  id: z.string().min(1),
  /** Display name of the skill */
  name: z.string().min(1),
  /** Brief description of what the skill covers */
  description: z.string().min(1),
  /** Skill category for filtering */
  category: SkillCategorySchema,
  /** Priority for ordering (higher = more important) */
  priority: z.number().int().min(0).max(100).default(50),
  /** The full markdown content of the skill */
  content: z.string().min(1),
  /** When to apply this skill */
  appliesTo: SkillPhaseSchema.default("both"),
  /** Whether the skill is enabled */
  enabled: z.boolean().default(true),
  /** File path where skill was loaded from */
  filePath: z.string(),
  /** Whether this is a project-level skill (vs global) */
  isProjectSkill: z.boolean().default(false),
});

export type Skill = z.infer<typeof SkillSchema>;

/**
 * Skills configuration in config.json
 */
export const SkillsConfigSchema = z
  .object({
    /** Whether skills system is enabled */
    enabled: z.boolean().default(true),
    /** Maximum number of skills to inject per prompt */
    maxSkillsPerPrompt: z.number().int().min(1).max(20).default(10),
    /** Path to global skills directory (relative to agent-runner) */
    globalSkillsPath: z.string().default("skills/global"),
  })
  .default({});

export type SkillsConfig = z.infer<typeof SkillsConfigSchema>;
