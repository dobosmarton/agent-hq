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
      "List open tasks (backlog, todo, in progress) for a specific project. Returns task ID, title, state, and priority.",
    inputSchema: z.object({
      project_identifier: z
        .string()
        .describe("The project identifier code (e.g. 'VERDANDI', 'STYLESWIPE'). Case-insensitive."),
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
    execute: async ({ project_identifier }) => {
      const project = await findProjectByIdentifier(config, project_identifier);
      if (!project) {
        return { tasks: [], error: `Project "${project_identifier}" not found` };
      }

      const [issues, stateMap] = await Promise.all([
        listIssues(config, project.id),
        buildStateMap(config, project.id),
      ]);

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
});
