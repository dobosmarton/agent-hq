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
  AGENT_RUNNER_URL: z.string().url().optional(),
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

export const PlaneLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
  description: z.string().optional(),
});

export type PlaneLabel = z.infer<typeof PlaneLabelSchema>;

export const PlaneIssueSchema = z.object({
  id: z.string(),
  name: z.string(),
  priority: z.string(),
  state: z.string(),
  sequence_id: z.number(),
  description_html: z.string().optional(),
  description: z.string().optional(),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
  project: z.string().optional(),
  labels: z.array(z.string()).optional(),
});

export type PlaneIssue = z.infer<typeof PlaneIssueSchema>;

export const PlaneCommentSchema = z.object({
  id: z.string(),
  comment_html: z.string(),
  created_at: z.string(),
  updated_at: z.string(),
  created_by: z.string(),
  actor_detail: z
    .object({
      first_name: z.string(),
      last_name: z.string(),
      display_name: z.string(),
    })
    .optional(),
});

export type PlaneComment = z.infer<typeof PlaneCommentSchema>;

export const PlanePaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total_count: z.number(),
    results: z.array(itemSchema),
  });
