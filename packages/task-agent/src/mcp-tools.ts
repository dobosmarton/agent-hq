import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { exec } from "node:child_process";
import { join } from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { PlaneClient } from "@agent-hq/plane-client";
import { addLabelsToTaskExecutor, removeLabelsFromTaskExecutor } from "@agent-hq/plane-tools";

// Default exec implementation — can be overridden via McpToolsDeps for testing
const defaultExecAsync = promisify(exec);
import {
  createSkillFile,
  stripSkillMetadata,
  clearSkillCache,
  SkillCategorySchema,
  SkillPhaseSchema,
} from "@agent-hq/skills";
import type { Skill } from "@agent-hq/skills";

type McpToolsContext = {
  plane: PlaneClient;
  projectId: string;
  issueId: string;
  taskDisplayId: string;
  planReviewStateId: string | null;
  inReviewStateId: string | null;
  doneStateId: string | null;
  skills: Skill[];
  projectRepoPath: string;
  agentRunnerRoot: string;
  ciCommands: string[];
};

type ExecAsyncFn = (
  cmd: string,
  opts: { cwd?: string; timeout?: number }
) => Promise<{ stdout: string; stderr: string }>;

type McpToolsDeps = {
  /** Override the exec implementation — primarily for testing. */
  execAsync?: ExecAsyncFn;
};

export const createAgentMcpServer = (ctx: McpToolsContext, deps?: McpToolsDeps) => {
  const execAsync = deps?.execAsync ?? (defaultExecAsync as ExecAsyncFn);
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

          await ctx.plane.updateIssue(ctx.projectId, ctx.issueId, {
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
        }
      ),

      tool(
        "add_task_comment",
        "Add a progress comment to the current Plane task. Use HTML formatting: <p>, <ul>, <li>, <code>, <strong>. Call this at key milestones to keep the human informed of progress.",
        { comment_html: z.string().describe("HTML-formatted comment content") },
        async ({ comment_html }) => {
          await ctx.plane.addComment(ctx.projectId, ctx.issueId, comment_html);
          return {
            content: [
              {
                type: "text" as const,
                text: `Comment added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        }
      ),

      tool(
        "list_task_comments",
        "Retrieve all comments on the current task with timestamps and content. Use this to review feedback and understand the task's history.",
        {},
        async () => {
          const comments = await ctx.plane.listComments(ctx.projectId, ctx.issueId);

          if (comments.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No comments found on this task.",
                },
              ],
            };
          }

          return {
            content: [
              {
                type: "text" as const,
                text: JSON.stringify(comments, null, 2),
              },
            ],
          };
        }
      ),

      tool(
        "add_task_link",
        "Add a link to the current Plane task. Use this to attach the Pull Request URL after creating a PR.",
        {
          title: z.string().describe("Display title for the link"),
          url: z.string().url().describe("The URL to link"),
        },
        async ({ title, url }) => {
          await ctx.plane.addLink(ctx.projectId, ctx.issueId, title, url);
          return {
            content: [
              {
                type: "text" as const,
                text: `Link "${title}" added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        }
      ),

      tool(
        "list_labels",
        "List all available labels in the current project. Returns label names, colors, and descriptions.",
        {},
        async () => {
          const labels = await ctx.plane.listLabels(ctx.projectId);

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
        }
      ),

      tool(
        "add_labels_to_task",
        "Add one or more labels to the current task. Label names are case-insensitive.",
        {
          label_names: z.array(z.string()).describe("Array of label names to add"),
        },
        async ({ label_names }) => {
          const result = await addLabelsToTaskExecutor(
            ctx.plane,
            ctx.projectId,
            ctx.issueId,
            label_names
          );
          if (!result.success) {
            const availableList = result.availableLabelNames.join(", ");
            return {
              content: [
                {
                  type: "text" as const,
                  text: `Label(s) not found: ${result.notFound.join(", ")}.\nAvailable labels: ${availableList}`,
                },
              ],
            };
          }
          return {
            content: [
              {
                type: "text" as const,
                text: `Added label(s) ${label_names.join(", ")} to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        }
      ),

      tool(
        "remove_labels_from_task",
        "Remove one or more labels from the current task. Label names are case-insensitive.",
        {
          label_names: z.array(z.string()).describe("Array of label names to remove"),
        },
        async ({ label_names }) => {
          const result = await removeLabelsFromTaskExecutor(
            ctx.plane,
            ctx.projectId,
            ctx.issueId,
            label_names
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Removed label(s) ${label_names.join(", ")} from task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        }
      ),

      tool(
        "load_skill",
        "Load the full content of a coding standards skill. Call this at the start of your work to load skills relevant to the project's language and task. Use the skill IDs from the Available Coding Skills section in your instructions.",
        {
          skill_id: z.string().describe("The skill ID from the available skills list"),
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
        }
      ),

      tool(
        "validate_quality_gate",
        "Run all CI quality checks (formatting, type checking, tests) in the project directory and return a structured pass/fail report. Call this before creating a PR to verify all checks pass. Returns per-command results so you can fix failures before pushing.",
        {},
        async () => {
          if (ctx.ciCommands.length === 0) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: "No CI commands configured. Run quality checks manually using Bash.",
                },
              ],
            };
          }

          type CommandResult = {
            command: string;
            passed: boolean;
            output: string;
          };
          const results: CommandResult[] = [];

          for (const cmd of ctx.ciCommands) {
            try {
              const { stdout, stderr } = await execAsync(cmd, {
                cwd: ctx.projectRepoPath,
                timeout: 120_000,
              });
              results.push({
                command: cmd,
                passed: true,
                output: (stdout + stderr).slice(0, 500),
              });
            } catch (err) {
              const execError = err as { stdout?: string; stderr?: string; message?: string };
              // Use || (not ??) for stderr so that an empty string falls through to err.message,
              // ensuring timeout and other error messages are surfaced to the user.
              const output = (
                (execError.stdout ?? "") + (execError.stderr || execError.message || "")
              ).slice(0, 500);
              results.push({ command: cmd, passed: false, output });
            }
          }

          const allPassed = results.every((r) => r.passed);
          const summary = results
            .map((r) => `${r.passed ? "✓" : "✗"} ${r.command}\n${r.output}`)
            .join("\n\n");

          return {
            content: [
              {
                type: "text" as const,
                text: `Quality gate ${allPassed ? "PASSED" : "FAILED"} (${results.filter((r) => r.passed).length}/${results.length} checks passed)\n\n${summary}`,
              },
            ],
          };
        }
      ),

      tool(
        "create_skill",
        "Record a learning or best practice as a reusable skill file. Use this when you discover a project-specific pattern, convention, workaround, or important context that would help future agents working on the same codebase. The skill is saved as a markdown file and automatically loaded for future tasks. Prefer project scope for project-specific learnings.",
        {
          name: z.string().min(3).max(80).describe("Short descriptive name for this learning"),
          description: z
            .string()
            .min(10)
            .max(200)
            .describe("One-sentence description of what this skill covers"),
          content: z
            .string()
            .min(20)
            .describe(
              "Full markdown content explaining the learning, pattern, or best practice. Include code examples where helpful."
            ),
          category: SkillCategorySchema.optional().describe("Category (defaults to 'learned')"),
          priority: z
            .number()
            .int()
            .min(0)
            .max(100)
            .optional()
            .describe("Priority 0-100 (defaults to 30)"),
          applies_to: SkillPhaseSchema.optional().describe(
            "When to apply: 'planning', 'implementation', or 'both' (defaults to 'both')"
          ),
          scope: z
            .enum(["project", "global"])
            .optional()
            .describe(
              "Where to save: 'project' for this repo only, 'global' for all repos (defaults to 'project')"
            ),
        },
        async ({ name, description, content, category, priority, applies_to, scope }) => {
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
              { baseDir, subdirectory: "learned" }
            );

            clearSkillCache();

            const scopeLabel = effectiveScope === "project" ? "project" : "global";
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
        }
      ),
    ],
  });
};
