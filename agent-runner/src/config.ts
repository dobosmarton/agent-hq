import { z } from "zod";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SkillsConfigSchema } from "./skills/types";

const ProjectConfigSchema = z.object({
  repoPath: z.string().optional(),
  repoUrl: z.string().url(),
  defaultBranch: z.string().default("main"),
  ciChecks: z.array(z.string()).optional(),
  planeProjectId: z.string().optional(),
  planeIdentifier: z.string().optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().positive().default(3000),
  path: z.string().default("/webhooks/github/pr"),
  taskIdPattern: z.string().default("([A-Z]+-\\d+)"),
});

const AgentConfigSchema = z.object({
  maxConcurrent: z.number().int().min(1).default(2),
  maxBudgetPerTask: z.number().positive().default(5.0),
  maxDailyBudget: z.number().positive().default(20.0),
  maxTurns: z.number().int().positive().default(200),
  pollIntervalMs: z.number().int().positive().default(30000),
  spawnDelayMs: z.number().int().positive().default(15000),
  maxRetries: z.number().int().min(0).default(2),
  retryBaseDelayMs: z.number().int().positive().default(60000),
  labelName: z.string().default("agent"),
  skills: SkillsConfigSchema,
});

const ConfigSchema = z.object({
  plane: z.object({
    baseUrl: z.string(),
    workspaceSlug: z.string().min(1),
  }),
  projects: z.record(z.string(), ProjectConfigSchema),
  agent: AgentConfigSchema.optional().default({
    maxConcurrent: 2,
    maxBudgetPerTask: 5.0,
    maxDailyBudget: 20.0,
    maxTurns: 200,
    pollIntervalMs: 30000,
    spawnDelayMs: 15000,
    maxRetries: 2,
    retryBaseDelayMs: 60000,
    labelName: "agent",
    skills: {
      enabled: true,
      maxSkillsPerPrompt: 10,
      globalSkillsPath: "skills/global",
    },
  }),
  webhook: WebhookConfigSchema.optional().default({
    enabled: true,
    port: 3000,
    path: "/webhooks/github/pr",
    taskIdPattern: "([A-Z]+-\\d+)",
  }),
});

export type Config = z.infer<typeof ConfigSchema>;

const EnvSchema = z.object({
  PLANE_API_KEY: z.string().min(1),
  PLANE_BASE_URL: z.string().url().optional(),
  ANTHROPIC_API_KEY: z.string().min(1),
  TELEGRAM_BOT_TOKEN: z.string().min(1).optional(),
  TELEGRAM_CHAT_ID: z.string().min(1).optional(),
  GITHUB_PAT: z.string().min(1),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
  CONFIG_PATH: z.string().optional(),
  STATE_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

export const loadConfig = (configPath?: string): Config => {
  const path =
    configPath ??
    process.env.CONFIG_PATH ??
    resolve(process.cwd(), "config.json");
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
  baseUrl: env.PLANE_BASE_URL ?? config.plane.baseUrl,
  workspaceSlug: config.plane.workspaceSlug,
});
