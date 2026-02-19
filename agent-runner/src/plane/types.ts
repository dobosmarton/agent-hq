import { z } from "zod";

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
  description_html: z.string().nullable().optional(),
  label_ids: z.array(z.string()).optional().default([]),
});

export type PlaneIssue = z.infer<typeof PlaneIssueSchema>;

export const PlaneLabelSchema = z.object({
  id: z.string(),
  name: z.string(),
  color: z.string().optional(),
});

export type PlaneLabel = z.infer<typeof PlaneLabelSchema>;

export const PlaneCommentSchema = z.object({
  id: z.string(),
  comment_html: z.string(),
  created_at: z.string(),
});

export type PlaneComment = z.infer<typeof PlaneCommentSchema>;

export const PlanePaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total_count: z.number(),
    results: z.array(itemSchema),
  });
