import { z } from "zod";

// --- Environment config ---

export const EnvSchema = z.object({
  TELEGRAM_BOT_TOKEN: z.string().min(1),
  ALLOWED_USER_ID: z.string().min(1),
  PLANE_API_KEY: z.string().min(1),
  PLANE_BASE_URL: z.string().url(),
  PLANE_WORKSPACE_SLUG: z.string().min(1),
  ANTHROPIC_API_KEY: z.string().min(1),
  ANTHROPIC_MODEL: z.string().default("claude-haiku-4-5-20251001"),
});

export type Env = z.infer<typeof EnvSchema>;

export type PlaneConfig = {
  apiKey: string;
  baseUrl: string;
  workspaceSlug: string;
};

// --- Plane API response types ---

export const PlaneProjectSchema = z.object({
  id: z.string(),
  name: z.string(),
  identifier: z.string(),
});

export type PlaneProject = z.infer<typeof PlaneProjectSchema>;

export const PlaneStateSchema = z.object({
  id: z.string(),
  name: z.string(),
  group: z.string(),
});

export type PlaneState = z.infer<typeof PlaneStateSchema>;

export const PlaneIssueSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.string(),
  state: z.string(),
  sequence_id: z.number(),
});

export type PlaneIssue = z.infer<typeof PlaneIssueSchema>;

export const PlanePaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total_count: z.number(),
    results: z.array(itemSchema),
  });
