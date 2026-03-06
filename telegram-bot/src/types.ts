import { z } from "zod";

// --- Environment config ---

export const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_USER_ID: z.string().min(1),
  PLANE_API_KEY: z.string().min(1),
  PLANE_BASE_URL: z.url(),
  PLANE_WORKSPACE_SLUG: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
  AGENT_RUNNER_URL: z.string().url().optional(),
  GITHUB_PAT: z.string().min(1).optional(),
  PROGRESS_FEEDBACK_ENABLED: z
    .string()
    .default("true")
    .transform((v) => v === "true"),
  PROGRESS_UPDATE_INTERVAL_MS: z.coerce.number().default(2500),
});

export type Env = z.infer<typeof EnvSchema>;

export type GitHubConfig = {
  pat: string;
};

// --- Plane types (re-exported from shared package) ---

export type {
  PlaneClient,
  PlaneComment,
  PlaneConfig,
  PlaneIssue,
  PlaneLabel,
  PlaneProject,
  PlaneState,
} from "@agent-hq/plane-client";
