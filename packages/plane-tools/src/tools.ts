import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlaneClient } from "@agent-hq/plane-client";
import { addLabelsToTaskExecutor, removeLabelsFromTaskExecutor } from "./executors";

export const createPlaneTools = (plane: PlaneClient, planeBaseUrl: string) => ({
  listProjects: createTool({
    id: "list_projects",
    description:
      "List all projects in the workspace with their names and identifiers. Use this to discover available projects or resolve a project name to its identifier.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      projects: z.array(
        z.object({
          name: z.string(),
          identifier: z.string(),
        })
      ),
    }),
    execute: async () => {
      const projects = await plane.listProjects();
      return {
        projects: projects.map((p) => ({
          name: p.name,
          identifier: p.identifier,
        })),
      };
    },
  }),

  listTasks: createTool({
    id: "list_tasks",
    description:
      "List tasks for a specific project, showing task ID, title, state, and priority. By default returns open tasks (Backlog, Todo, In Progress). Can optionally filter by specific state names (e.g. 'Plan Review', 'Done').",
    inputSchema: z.object({
      project_identifier: z
        .string()
        .describe("The project identifier code (e.g. 'VERDANDI', 'STYLESWIPE'). Case-insensitive."),
      state_names: z
        .array(z.string())
        .optional()
        .describe(
          "Optional array of state names to filter by (e.g. ['Plan Review', 'Done']). Case-insensitive. If not provided, shows open tasks."
        ),
    }),
    outputSchema: z.object({
      tasks: z.array(
        z.object({
          id: z.string(),
          title: z.string(),
          state: z.string(),
          priority: z.string(),
        })
      ),
      error: z.string().optional(),
    }),
    execute: async ({ project_identifier, state_names }) => {
      const project = await plane.findProjectByIdentifier(project_identifier);
      if (!project) {
        return { tasks: [], error: `Project "${project_identifier}" not found` };
      }

      const states = await plane.listStates(project.id);
      const stateMap = new Map(states.map((s) => [s.id, s.name]));

      const params: Record<string, string> = {};
      if (state_names && state_names.length > 0) {
        const normalizedNames = state_names.map((n) => n.toLowerCase().trim());
        const stateIds = states
          .filter((s) => normalizedNames.includes(s.name.toLowerCase().trim()))
          .map((s) => s.id);

        if (stateIds.length === 0) {
          const availableStates = states.map((s) => s.name).join(", ");
          return {
            tasks: [],
            error: `No matching states found. Available states: ${availableStates}`,
          };
        }

        params["state"] = stateIds.join(",");
      } else {
        params["state_group"] = "backlog,unstarted,started";
      }

      const issues = await plane.listIssues(project.id, params);

      return {
        tasks: issues.map((issue) => ({
          id: `${project.identifier}-${issue.sequence_id}`,
          title: issue.name,
          state: stateMap.get(issue.state) ?? "Unknown",
          priority: issue.priority,
        })),
      };
    },
  }),

  createTask: createTool({
    id: "create_task",
    description:
      "Create a new task/issue in a project. Always provide a rich description_html with acceptance criteria and technical considerations.",
    inputSchema: z.object({
      project_identifier: z.string().describe("The project identifier code (e.g. 'VERDANDI')."),
      title: z.string().describe("Concise task title in imperative mood, under 80 characters."),
      description_html: z
        .string()
        .describe(
          "Detailed HTML description with sections: Description, Acceptance Criteria, Technical Considerations. Use <h3>, <p>, <ul>, <li>, <strong>, <code> tags."
        ),
    }),
    outputSchema: z.object({
      id: z.string().optional(),
      title: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ project_identifier, title, description_html }) => {
      const project = await plane.findProjectByIdentifier(project_identifier);
      if (!project) {
        return { error: `Project "${project_identifier}" not found` };
      }

      const issue = await plane.createIssue(project.id, title, description_html);
      return {
        id: `${project.identifier}-${issue.sequence_id}`,
        title: issue.name,
      };
    },
  }),

  getProjectStates: createTool({
    id: "get_project_states",
    description:
      "List the available workflow states for a project (e.g. Backlog, Todo, In Progress, Done).",
    inputSchema: z.object({
      project_identifier: z.string().describe("The project identifier code."),
    }),
    outputSchema: z.object({
      states: z.array(
        z.object({
          name: z.string(),
          group: z.string(),
        })
      ),
      error: z.string().optional(),
    }),
    execute: async ({ project_identifier }) => {
      const project = await plane.findProjectByIdentifier(project_identifier);
      if (!project) {
        return { states: [], error: `Project "${project_identifier}" not found` };
      }

      const states = await plane.listStates(project.id);
      return {
        states: states.map((s) => ({ name: s.name, group: s.group })),
      };
    },
  }),

  getTaskDetails: createTool({
    id: "get_task_details",
    description:
      "Get full details of a specific task including description, timestamps, state, priority, and a link to view it on the board.",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5', 'HQ-42')."),
    }),
    outputSchema: z.object({
      id: z.string().optional(),
      title: z.string().optional(),
      description_html: z.string().optional(),
      state: z.string().optional(),
      priority: z.string().optional(),
      created_at: z.string().optional(),
      updated_at: z.string().optional(),
      url: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return { error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)` };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { error: `Task ${task_id} not found` };
      }

      const fullIssue = await plane.getIssue(project.id, issue.id);
      const stateMap = await plane.buildStateMap(project.id);

      return {
        id: task_id,
        title: fullIssue.name,
        description_html: fullIssue.description_html ?? undefined,
        state: stateMap.get(fullIssue.state)?.name ?? "Unknown",
        priority: fullIssue.priority,
        created_at: fullIssue.created_at,
        updated_at: fullIssue.updated_at,
        url: `${planeBaseUrl}/projects/${project.identifier.toLowerCase()}/issues/${parsed.sequenceId}`,
      };
    },
  }),

  listTaskComments: createTool({
    id: "list_task_comments",
    description:
      "List all comments on a specific task, including status updates, human feedback, and agent notes. For retrieving the agent's implementation plan specifically, prefer get_task_plan instead.",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5')."),
    }),
    outputSchema: z.object({
      comments: z.array(
        z.object({
          id: z.string(),
          comment_html: z.string(),
          created_at: z.string(),
          author: z.string(),
        })
      ),
      error: z.string().optional(),
    }),
    execute: async ({ task_id }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          comments: [],
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { comments: [], error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { comments: [], error: `Task ${task_id} not found` };
      }

      const comments = await plane.listComments(project.id, issue.id);

      return {
        comments: comments.map((c) => ({
          id: c.id,
          comment_html: c.comment_html,
          created_at: c.created_at,
          author: c.actor_detail?.display_name ?? "Unknown",
        })),
      };
    },
  }),

  getTaskPlan: createTool({
    id: "get_task_plan",
    description:
      "Get the agent's implementation plan for a task. Returns the full plan posted during the planning phase. Present the complete plan content to the user without summarizing. Returns has_plan: false if no plan exists yet.",
    inputSchema: z.object({
      task_id: z.string().describe("The task identifier in format PROJECT-NUMBER (e.g. 'HQ-42')."),
    }),
    outputSchema: z.object({
      plan_html: z.string().optional(),
      has_plan: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          has_plan: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { has_plan: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { has_plan: false, error: `Task ${task_id} not found` };
      }

      const comments = await plane.listComments(project.id, issue.id);
      const PLAN_MARKER = "<!-- AGENT_PLAN -->";
      const planComment = comments.find((c) => c.comment_html.includes(PLAN_MARKER));

      if (!planComment) {
        return { has_plan: false };
      }

      const markerIndex = planComment.comment_html.indexOf(PLAN_MARKER);
      const planContent = planComment.comment_html.slice(markerIndex + PLAN_MARKER.length).trim();

      return {
        has_plan: true,
        plan_html: planContent,
      };
    },
  }),

  addTaskComment: createTool({
    id: "add_task_comment",
    description:
      "Add a comment to a specific task. Use HTML for formatting (<p>, <ul>, <li>, <strong>, <code>).",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5')."),
      comment_html: z.string().describe("The comment content in HTML format."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      comment_id: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id, comment_html }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      try {
        const comment = await plane.addComment(project.id, issue.id, comment_html);
        return {
          success: true,
          comment_id: comment.id,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add comment",
        };
      }
    },
  }),

  moveTaskState: createTool({
    id: "move_task_state",
    description:
      "Move a task to a different workflow state (e.g. from 'Todo' to 'In Progress' or 'Done').",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5')."),
      state_name: z
        .string()
        .describe("The target state name (e.g. 'Plan Review', 'Done'). Case-insensitive."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      new_state: z.string().optional(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id, state_name }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      const states = await plane.listStates(project.id);
      const targetState = states.find(
        (s) => s.name.toLowerCase().trim() === state_name.toLowerCase().trim()
      );

      if (!targetState) {
        const availableStates = states.map((s) => s.name).join(", ");
        return {
          success: false,
          error: `State "${state_name}" not found. Available states: ${availableStates}`,
        };
      }

      try {
        await plane.updateIssue(project.id, issue.id, { state: targetState.id });
        return {
          success: true,
          new_state: targetState.name,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to update state",
        };
      }
    },
  }),

  listLabels: createTool({
    id: "list_labels",
    description:
      "List all available labels for a project. Use this to discover which labels exist before adding them to tasks.",
    inputSchema: z.object({
      project_identifier: z
        .string()
        .describe("The project identifier (e.g. 'AGENTHQ', 'VERDANDI')."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      labels: z.array(z.object({ name: z.string(), color: z.string().optional() })).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ project_identifier }) => {
      const project = await plane.findProjectByIdentifier(project_identifier);
      if (!project) {
        return { success: false, error: `Project "${project_identifier}" not found` };
      }

      try {
        const labels = await plane.listLabels(project.id);
        return {
          success: true,
          labels: labels.map((l) => ({ name: l.name, color: l.color })),
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to list labels",
        };
      }
    },
  }),

  addLabelsToTask: createTool({
    id: "add_labels_to_task",
    description:
      "Add one or more labels to a task. Labels must exist in the project. This operation is idempotent (adding the same label twice is safe).",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5')."),
      label_names: z
        .array(z.string())
        .describe(
          "Array of label names to add (e.g. ['agent', 'bug', 'urgent']). Case-insensitive."
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      added_labels: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id, label_names }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      try {
        const result = await addLabelsToTaskExecutor(plane, project.id, issue.id, label_names);
        if (!result.success) {
          return {
            success: false,
            error: `Labels not found: ${result.notFound.join(", ")}. Available labels: ${result.availableLabelNames.join(", ")}`,
          };
        }
        return {
          success: true,
          added_labels: label_names,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to add labels",
        };
      }
    },
  }),

  removeLabelsFromTask: createTool({
    id: "remove_labels_from_task",
    description:
      "Remove one or more labels from a task. This operation is idempotent (removing a non-existent label is safe).",
    inputSchema: z.object({
      task_id: z
        .string()
        .describe("The task identifier in format PROJECT-NUMBER (e.g. 'VERDANDI-5')."),
      label_names: z
        .array(z.string())
        .describe("Array of label names to remove (e.g. ['agent', 'bug']). Case-insensitive."),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      removed_labels: z.array(z.string()).optional(),
      error: z.string().optional(),
    }),
    execute: async ({ task_id, label_names }) => {
      const parsed = plane.parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await plane.findProjectByIdentifier(parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await plane.findIssueBySequenceId(project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      try {
        const result = await removeLabelsFromTaskExecutor(plane, project.id, issue.id, label_names);
        return {
          success: true,
          removed_labels: result.removedLabelNames,
        };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to remove labels",
        };
      }
    },
  }),
});
