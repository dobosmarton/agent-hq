import { SkillsConfigSchema } from "@agent-hq/skills";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { z } from "zod";

const ExternalMcpServerSchema = z.object({
  command: z.string(),
  args: z.array(z.string()).optional(),
  env: z.record(z.string(), z.string()).optional(),
});

const ProjectConfigSchema = z.object({
  repoPath: z.string().optional(),
  repoUrl: z.url(),
  defaultBranch: z.string().default("main"),
  ciChecks: z.array(z.string()).optional(),
  planeProjectId: z.string().optional(),
  planeIdentifier: z.string().optional(),
  mcpServers: z.record(z.string(), ExternalMcpServerSchema).optional(),
});

export type ProjectConfig = z.infer<typeof ProjectConfigSchema>;

const WebhookConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().positive().default(3000),
  path: z.string().default("/webhooks/github/pr"),
  taskIdPattern: z.string().default("([A-Z]+-\\d+)"),
});

const ReviewConfigSchema = z.object({
  enabled: z.boolean().default(true),
  triggerOnOpened: z.boolean().default(true),
  triggerOnSynchronize: z.boolean().default(true),
  severityThreshold: z.enum(["critical", "major", "minor", "suggestion"]).default("major"),
  skipIfLabelPresent: z.string().optional(),
  maxDiffSizeKb: z.number().int().positive().default(100),
  claudeModel: z.string().default("claude-sonnet-4-6"),
  useParallelReview: z.boolean().default(true),
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
  progressFeedbackEnabled: z.boolean().default(true),
  progressUpdateIntervalMs: z.number().int().positive().default(2500),
  skills: SkillsConfigSchema,
  mcpServers: z.record(z.string(), ExternalMcpServerSchema).optional(),
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
    progressFeedbackEnabled: true,
    progressUpdateIntervalMs: 2500,
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
  review: ReviewConfigSchema.optional().default({
    enabled: true,
    triggerOnOpened: true,
    triggerOnSynchronize: true,
    severityThreshold: "major",
    maxDiffSizeKb: 100,
    claudeModel: "claude-sonnet-4-6",
    useParallelReview: true,
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
  GITHUB_APP_ID: z.coerce.number().int().positive().optional(),
  GITHUB_APP_PRIVATE_KEY_PATH: z.string().min(1).optional(),
  GITHUB_APP_INSTALLATION_ID: z.coerce.number().int().positive().optional(),
  GITHUB_WEBHOOK_SECRET: z.string().min(1).optional(),
  CONFIG_PATH: z.string().optional(),
  STATE_PATH: z.string().optional(),
});

export type Env = z.infer<typeof EnvSchema>;

const deepMerge = (target: Record<string, unknown>, source: Record<string, unknown>): void => {
  for (const key of Object.keys(source)) {
    const sourceVal = source[key];
    const targetVal = target[key];
    if (
      sourceVal !== null &&
      typeof sourceVal === "object" &&
      !Array.isArray(sourceVal) &&
      targetVal !== null &&
      typeof targetVal === "object" &&
      !Array.isArray(targetVal)
    ) {
      deepMerge(targetVal as Record<string, unknown>, sourceVal as Record<string, unknown>);
    } else {
      target[key] = sourceVal;
    }
  }
};

export const loadConfig = (configPath?: string): Config => {
  const path = configPath ?? process.env.CONFIG_PATH ?? resolve(process.cwd(), "config.json");
  const raw = JSON.parse(readFileSync(path, "utf-8")) as Record<string, unknown>;

  // Deep-merge local overrides if present
  const localPath = path.replace(/\.json$/, ".local.json");
  if (existsSync(localPath)) {
    const localRaw = JSON.parse(readFileSync(localPath, "utf-8")) as Record<string, unknown>;
    deepMerge(raw, localRaw);
    console.log(`Loaded config overrides from ${localPath}`);
  }

  return ConfigSchema.parse(raw);
};

export const loadEnv = (): Env => {
  return EnvSchema.parse(process.env);
};

import type { PlaneConfig } from "@agent-hq/plane-client";
import { createPlaneClient } from "@agent-hq/plane-client";
export type { PlaneClient, PlaneConfig } from "@agent-hq/plane-client";

export const buildPlaneConfig = (config: Config, env: Env): PlaneConfig => ({
  apiKey: env.PLANE_API_KEY,
  baseUrl: env.PLANE_BASE_URL ?? config.plane.baseUrl,
  workspaceSlug: config.plane.workspaceSlug,
});

export const buildPlaneClient = (config: Config, env: Env) =>
  createPlaneClient(buildPlaneConfig(config, env));
