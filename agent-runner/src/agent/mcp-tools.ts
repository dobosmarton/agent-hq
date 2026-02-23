import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { join } from "node:path";
import { z } from "zod";
import type { PlaneConfig } from "../config";
import {
  addComment,
  addLink,
  getIssue,
  listLabels,
  updateIssue,
} from "../plane/client";
import { createSkillFile } from "../skills/creator";
import { stripSkillMetadata } from "../skills/formatter";
import { clearSkillCache } from "../skills/loader";
import type { Skill } from "../skills/types";
import { SkillCategorySchema, SkillPhaseSchema } from "../skills/types";

type McpToolsContext = {
  planeConfig: PlaneConfig;
  projectId: string;
  issueId: string;
  taskDisplayId: string;
  planReviewStateId: string | null;
  inReviewStateId: string | null;
  doneStateId: string | null;
  skills: Skill[];
  projectRepoPath: string;
  agentRunnerRoot: string;
};

export const createAgentMcpServer = (ctx: McpToolsContext) => {
  return createSdkMcpServer({
    name: "agent-plane-tools",
    tools: [
      tool(
        "update_task_status",
        "Move the current task to a different workflow state. Use 'plan_review' after posting an implementation plan. Use 'in_review' when implementation is complete and ready for human review. Use 'done' only if explicitly told the task needs no review.",
        { state: z.enum(["plan_review", "in_review", "done"]) },
        async ({ state }) => {
          const stateMap: Record<string, string | null> = {
            plan_review: ctx.planReviewStateId,
            in_review: ctx.inReviewStateId,
            done: ctx.doneStateId,
          };
          const stateId = stateMap[state];

          if (!stateId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `State "${state}" not available in this project.`,
                },
              ],
            };
          }

          await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, {
            state: stateId,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Task ${ctx.taskDisplayId} moved to ${state}.`,
              },
            ],
          };
        },
      ),

      tool(
        "add_task_comment",
        "Add a progress comment to the current Plane task. Use HTML formatting: <p>, <ul>, <li>, <code>, <strong>. Call this at key milestones to keep the human informed of progress.",
        { comment_html: z.string().describe("HTML-formatted comment content") },
        async ({ comment_html }) => {
          await addComment(
            ctx.planeConfig,
            ctx.projectId,
            ctx.issueId,
            comment_html,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Comment added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),

      tool(
        "add_task_link",
        "Add a link to the current Plane task. Use this to attach the Pull Request URL after creating a PR.",
        {
          title: z.string().describe("Display title for the link"),
          url: z.string().url().describe("The URL to link"),
        },
        async ({ title, url }) => {
          await addLink(
            ctx.planeConfig,
            ctx.projectId,
            ctx.issueId,
            title,
            url,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Link "${title}" added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),

      tool(
        "list_labels",
        "List all available labels in the current project. Returns label names, colors, and descriptions.",
        {},
        async () => {
          const labels = await listLabels(ctx.planeConfig, ctx.projectId);

          if (labels.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No labels found in this project.",
                },
              ],
            };
          }

          const labelList = labels
            .map((label) => {
              const parts = [`- ${label.name}`];
              if (label.color) {
                parts.push(` (color: ${label.color})`);
              }
              if (label.description) {
                parts.push(`: ${label.description}`);
              }
              return parts.join("");
            })
            .join("\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Available labels in this project:\n${labelList}`,
              },
            ],
          };
        },
      ),

      tool(
        "add_labels_to_task",
        "Add one or more labels to the current task. Label names are case-insensitive.",
        {
          label_names: z
            .array(z.string())
            .describe("Array of label names to add"),
        },
        async ({ label_names }) => {
          // Fetch current issue and available labels
          const [issue, availableLabels] = await Promise.all([
            getIssue(ctx.planeConfig, ctx.projectId, ctx.issueId),
            listLabels(ctx.planeConfig, ctx.projectId),
          ]);

          // Build lookup map (case-insensitive)
          const labelMap = new Map(
            availableLabels.map((l) => [l.name.toLowerCase(), l.id]),
          );

          // Find label IDs
          const notFound: string[] = [];
          const labelIdsToAdd: string[] = [];

          for (const name of label_names) {
            const labelId = labelMap.get(name.toLowerCase());
            if (labelId) {
              labelIdsToAdd.push(labelId);
            } else {
              notFound.push(name);
            }
          }

          // If any labels not found, return helpful error
          if (notFound.length > 0) {
            const availableList = availableLabels.map((l) => l.name).join(", ");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Label(s) not found: ${notFound.join(", ")}.\nAvailable labels: ${availableList}`,
                },
              ],
            };
          }

          // Merge with existing labels and deduplicate
          const currentLabels = issue.labels ?? [];
          const mergedLabels = Array.from(
            new Set([...currentLabels, ...labelIdsToAdd]),
          );

          // Update issue
          await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, {
            labels: mergedLabels,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `Added label(s) ${label_names.join(", ")} to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),

      tool(
        "remove_labels_from_task",
        "Remove one or more labels from the current task. Label names are case-insensitive.",
        {
          label_names: z
            .array(z.string())
            .describe("Array of label names to remove"),
        },
        async ({ label_names }) => {
          // Fetch current issue and available labels
          const [issue, availableLabels] = await Promise.all([
            getIssue(ctx.planeConfig, ctx.projectId, ctx.issueId),
            listLabels(ctx.planeConfig, ctx.projectId),
          ]);

          // Build lookup map (case-insensitive)
          const labelMap = new Map(
            availableLabels.map((l) => [l.name.toLowerCase(), l.id]),
          );

          // Find label IDs to remove
          const labelIdsToRemove = new Set(
            label_names
              .map((name) => labelMap.get(name.toLowerCase()))
              .filter((id): id is string => id !== undefined),
          );

          // Filter out labels to remove
          const currentLabels = issue.labels ?? [];
          const updatedLabels = currentLabels.filter(
            (id) => !labelIdsToRemove.has(id),
          );

          // Update issue
          await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, {
            labels: updatedLabels,
          });

          return {
            content: [
              {
                type: "text" as const,
                text: `Removed label(s) ${label_names.join(", ")} from task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),

      tool(
        "load_skill",
        "Load the full content of a coding standards skill. Call this at the start of your work to load skills relevant to the project's language and task. Use the skill IDs from the Available Coding Skills section in your instructions.",
        {
          skill_id: z
            .string()
            .describe("The skill ID from the available skills list"),
        },
        async ({ skill_id }) => {
          const skill = ctx.skills.find((s) => s.id === skill_id);
          if (!skill) {
            const available = ctx.skills.map((s) => s.id).join(", ");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Skill "${skill_id}" not found. Available skills: ${available}`,
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: stripSkillMetadata(skill.content),
              },
            ],
          };
        },
      ),

      tool(
        "create_skill",
        "Record a learning or best practice as a reusable skill file. Use this when you discover a project-specific pattern, convention, workaround, or important context that would help future agents working on the same codebase. The skill is saved as a markdown file and automatically loaded for future tasks. Prefer project scope for project-specific learnings.",
        {
          name: z
            .string()
            .min(3)
            .max(80)
            .describe("Short descriptive name for this learning"),
          description: z
            .string()
            .min(10)
            .max(200)
            .describe("One-sentence description of what this skill covers"),
          content: z
            .string()
            .min(20)
            .describe(
              "Full markdown content explaining the learning, pattern, or best practice. Include code examples where helpful.",
            ),
          category: SkillCategorySchema.optional().describe(
            "Category (defaults to 'learned')",
          ),
          priority: z
            .number()
            .int()
            .min(0)
            .max(100)
            .optional()
            .describe("Priority 0-100 (defaults to 30)"),
          applies_to: SkillPhaseSchema.optional().describe(
            "When to apply: 'planning', 'implementation', or 'both' (defaults to 'both')",
          ),
          scope: z
            .enum(["project", "global"])
            .optional()
            .describe(
              "Where to save: 'project' for this repo only, 'global' for all repos (defaults to 'project')",
            ),
        },
        async ({
          name,
          description,
          content,
          category,
          priority,
          applies_to,
          scope,
        }) => {
          const effectiveCategory = category ?? "learned";
          const effectivePriority = priority ?? 30;
          const effectiveAppliesTo = applies_to ?? "both";
          const effectiveScope = scope ?? "project";

          const baseDir =
            effectiveScope === "project"
              ? join(ctx.projectRepoPath, ".claude", "skills")
              : join(ctx.agentRunnerRoot, "skills");

          try {
            const { filePath } = createSkillFile(
              {
                name,
                description,
                content,
                category: effectiveCategory,
                priority: effectivePriority,
                appliesTo: effectiveAppliesTo,
              },
              { baseDir, subdirectory: "learned" },
            );

            clearSkillCache();

            const scopeLabel =
              effectiveScope === "project" ? "project" : "global";
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Skill "${name}" saved as ${scopeLabel} learned skill at ${filePath}. It will be automatically loaded for future tasks.`,
                },
              ],
            };
          } catch (err) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Failed to create skill: ${err instanceof Error ? err.message : String(err)}`,
                },
              ],
            };
          }
        },
      ),
    ],
  });
};
