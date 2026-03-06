import { z } from "zod";

export const PlaneProjectSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    identifier: z.string(),
  })
  .passthrough();

export const PlaneStateSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    group: z.string(),
  })
  .passthrough();

export const PlaneIssueSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    priority: z.string(),
    state: z.string(),
    sequence_id: z.number(),
    description_html: z.string().nullable().optional(),
    description: z.string().optional(),
    created_at: z.string().optional(),
    updated_at: z.string().optional(),
    project: z.string().optional(),
    labels: z.array(z.string()).optional(),
  })
  .passthrough();

export const PlaneLabelSchema = z
  .object({
    id: z.string(),
    name: z.string(),
    color: z.string().optional(),
    description: z.string().optional(),
  })
  .passthrough();

export const PlaneCommentSchema = z
  .object({
    id: z.string(),
    comment_html: z.string(),
    created_at: z.string(),
    updated_at: z.string().optional(),
    created_by: z.string().optional(),
    actor_detail: z
      .object({
        first_name: z.string(),
        last_name: z.string(),
        display_name: z.string(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export const PlaneLinkSchema = z.object({
  id: z.string(),
  title: z.string(),
  url: z.string(),
});

export const PlanePaginatedSchema = <T extends z.ZodTypeAny>(itemSchema: T) =>
  z.object({
    total_count: z.number(),
    results: z.array(itemSchema),
  });
