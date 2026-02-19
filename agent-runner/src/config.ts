import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const ProjectConfigSchema = z.object({
  repoPath: z.string(),
  repoUrl: z.string().url(),
  defaultBranch: z.string().default("main"),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

const AgentConfigSchema = z.object({
  maxConcurrent: z.number().int().min(1).default(2),
  maxBudgetPerTask: z.number().positive().default(5.0),
  maxDailyBudget: z.number().positive().default(20.0),
  maxTurns: z.number().int().positive().default(200),
  pollIntervalMs: z.number().int().positive().default(30000),
  labelName: z.string().default("agent"),
});

const ConfigSchema = z.object({
  plane: z.object({
    baseUrl: z.string(),
    workspaceSlug: z.string().min(1),
  }),
  projects: z.record(z.string(), ProjectConfigSchema),
  agent: AgentConfigSchema.default({}),
});

export type Config = z.infer<typeof ConfigSchema>;

const EnvSchema = z.object({
  PLANE_API_KEY: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  TELEGRAM_CHAT_ID: z.string().min(1),
  GITHUB_PAT: z.string().min(1),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadConfig = (configPath?: string): Config => {
  const path = configPath ?? resolve(process.cwd(), "config.json");
  const raw = readFileSync(path, "utf-8");
  return ConfigSchema.parse(JSON.parse(raw));
};

export const loadEnv = (): Env => {
  return EnvSchema.parse(process.env);
};

export type PlaneConfig = {
  apiKey: string;
  baseUrl: string;
  workspaceSlug: string;
};

export const buildPlaneConfig = (config: Config, env: Env): PlaneConfig => ({
  apiKey: env.PLANE_API_KEY,
  baseUrl: config.plane.baseUrl,
  workspaceSlug: config.plane.workspaceSlug,
});
