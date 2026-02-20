import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { PlaneConfig } from "../types.js";
import {
  listProjects,
  listIssues,
  buildStateMap,
  findProjectByIdentifier,
  createIssue,
  listStates,
  parseIssueIdentifier,
  findIssueBySequenceId,
  getIssue,
  listIssueComments,
  addIssueComment,
  updateIssueState,
} from "../plane.js";

export const createPlaneTools = (config: PlaneConfig) => ({
  listProjects: createTool({
    id: "list_projects",
    description:
      "List all projects in the workspace. Returns project name and identifier for each.",
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
      const projects = await listProjects(config);
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
      "List tasks for a specific project. By default shows open tasks (backlog, todo, in progress). Can optionally filter by specific state names.",
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
      const project = await findProjectByIdentifier(config, project_identifier);
      if (!project) {
        return { tasks: [], error: `Project "${project_identifier}" not found` };
      }

      const states = await listStates(config, project.id);
      const stateMap = new Map(states.map((s) => [s.id, s.name]));

      // If state names provided, find their IDs
      let stateIds: string[] | undefined;
      if (state_names && state_names.length > 0) {
        const normalizedNames = state_names.map((n) => n.toLowerCase().trim());
        stateIds = states
          .filter((s) => normalizedNames.includes(s.name.toLowerCase().trim()))
          .map((s) => s.id);

        if (stateIds.length === 0) {
          const availableStates = states.map((s) => s.name).join(", ");
          return {
            tasks: [],
            error: `No matching states found. Available states: ${availableStates}`,
          };
        }
      }

      const issues = await listIssues(config, project.id, { stateIds });

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
      const project = await findProjectByIdentifier(config, project_identifier);
      if (!project) {
        return { error: `Project "${project_identifier}" not found` };
      }

      const issue = await createIssue(config, project.id, title, description_html);
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
      const project = await findProjectByIdentifier(config, project_identifier);
      if (!project) {
        return { states: [], error: `Project "${project_identifier}" not found` };
      }

      const states = await listStates(config, project.id);
      return {
        states: states.map((s) => ({ name: s.name, group: s.group })),
      };
    },
  }),

  getTaskDetails: createTool({
    id: "get_task_details",
    description:
      "Get full details of a specific task including description, timestamps, and metadata. Use the task ID format like 'VERDANDI-5'.",
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
      const parsed = parseIssueIdentifier(task_id);
      if (!parsed) {
        return { error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)` };
      }

      const project = await findProjectByIdentifier(config, parsed.projectIdentifier);
      if (!project) {
        return { error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await findIssueBySequenceId(config, project.id, parsed.sequenceId);
      if (!issue) {
        return { error: `Task ${task_id} not found` };
      }

      // Fetch full details
      const fullIssue = await getIssue(config, project.id, issue.id);
      const stateMap = await buildStateMap(config, project.id);

      return {
        id: task_id,
        title: fullIssue.name,
        description_html: fullIssue.description_html,
        state: stateMap.get(fullIssue.state) ?? "Unknown",
        priority: fullIssue.priority,
        created_at: fullIssue.created_at,
        updated_at: fullIssue.updated_at,
        url: `${config.baseUrl.replace("/api/v1", "")}/projects/${project.identifier.toLowerCase()}/issues/${parsed.sequenceId}`,
      };
    },
  }),

  listTaskComments: createTool({
    id: "list_task_comments",
    description: "List all comments on a specific task. Use the task ID format like 'VERDANDI-5'.",
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
      const parsed = parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          comments: [],
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await findProjectByIdentifier(config, parsed.projectIdentifier);
      if (!project) {
        return { comments: [], error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await findIssueBySequenceId(config, project.id, parsed.sequenceId);
      if (!issue) {
        return { comments: [], error: `Task ${task_id} not found` };
      }

      const comments = await listIssueComments(config, project.id, issue.id);

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
      const parsed = parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await findProjectByIdentifier(config, parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await findIssueBySequenceId(config, project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      try {
        const comment = await addIssueComment(config, project.id, issue.id, comment_html);
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
      const parsed = parseIssueIdentifier(task_id);
      if (!parsed) {
        return {
          success: false,
          error: `Invalid task ID format. Expected format: PROJECT-NUMBER (e.g. HQ-42)`,
        };
      }

      const project = await findProjectByIdentifier(config, parsed.projectIdentifier);
      if (!project) {
        return { success: false, error: `Project "${parsed.projectIdentifier}" not found` };
      }

      const issue = await findIssueBySequenceId(config, project.id, parsed.sequenceId);
      if (!issue) {
        return { success: false, error: `Task ${task_id} not found` };
      }

      const states = await listStates(config, project.id);
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
        await updateIssueState(config, project.id, issue.id, targetState.id);
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
});
