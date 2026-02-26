import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import {
  addIssueComment,
  buildStateMap,
  cloneProjectConfiguration,
  createIssue,
  createProject,
  findIssueBySequenceId,
  findLabelByName,
  findProjectByIdentifier,
  getIssue,
  listIssueComments,
  listIssues,
  listLabels,
  listProjects,
  listStates,
  parseIssueIdentifier,
  updateIssue,
  updateIssueState,
} from "../plane";
import type { GitHubConfig, PlaneConfig } from "../types";
import {
  getRepository,
  parseGitHubUrl,
  searchRepositories,
  searchUserRepositories,
} from "../github";

export const createRunnerTools = (runnerUrl: string) => ({
  agentQueueStatus: createTool({
    id: "agent_queue_status",
    description:
      "Get the current agent runner status: queued tasks, active agents, and daily spend. Use when the user asks about the agent queue, running agents, or agent status.",
    inputSchema: z.object({}),
    outputSchema: z.object({
      queue: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          retryCount: z.number(),
          waitingUntil: z.string().optional(),
        })
      ),
      active: z.array(
        z.object({
          taskId: z.string(),
          title: z.string(),
          phase: z.string(),
          status: z.string(),
          runtimeMinutes: z.number(),
          costUsd: z.number().optional(),
          retryCount: z.number(),
        })
      ),
      dailySpend: z.number(),
      dailyBudget: z.number(),
      error: z.string().optional(),
    }),
    execute: async () => {
      try {
        const res = await fetch(`${runnerUrl}/status`);
        if (!res.ok) {
          return {
            queue: [],
            active: [],
            dailySpend: 0,
            dailyBudget: 0,
            error: `Agent runner returned ${res.status}`,
          };
        }
        const data = (await res.json()) as {
          queue: Array<{
            projectIdentifier: string;
            sequenceId: number;
            title: string;
            retryCount: number;
            nextAttemptAt: number;
          }>;
          active: Array<{
            projectIdentifier: string;
            sequenceId: number;
            title: string;
            phase: string;
            status: string;
            startedAt: number;
            costUsd?: number;
            retryCount: number;
          }>;
          dailySpend: number;
          dailyBudget: number;
        };

        const now = Date.now();
        return {
          queue: data.queue.map((q) => ({
            taskId: `${q.projectIdentifier}-${q.sequenceId}`,
            title: q.title,
            retryCount: q.retryCount,
            waitingUntil:
              q.nextAttemptAt > now ? new Date(q.nextAttemptAt).toISOString() : undefined,
          })),
          active: data.active.map((a) => ({
            taskId: `${a.projectIdentifier}-${a.sequenceId}`,
            title: a.title,
            phase: a.phase,
            status: a.status,
            runtimeMinutes: Math.round((now - a.startedAt) / 60000),
            costUsd: a.costUsd,
            retryCount: a.retryCount,
          })),
          dailySpend: data.dailySpend,
          dailyBudget: data.dailyBudget,
        };
      } catch (error) {
        return {
          queue: [],
          active: [],
          dailySpend: 0,
          dailyBudget: 0,
          error: error instanceof Error ? error.message : "Failed to reach agent runner",
        };
      }
    },
  }),

  removeFromAgentQueue: createTool({
    id: "remove_from_agent_queue",
    description:
      "Remove a task from the agent queue. Only works if the task is queued (not currently running). Use when the user wants to cancel a queued agent task.",
    inputSchema: z.object({
      issue_id: z
        .string()
        .describe(
          "The Plane issue UUID to remove from the queue. Get this from agent_queue_status first."
        ),
    }),
    outputSchema: z.object({
      success: z.boolean(),
      error: z.string().optional(),
    }),
    execute: async ({ issue_id }) => {
      try {
        const res = await fetch(`${runnerUrl}/queue/${issue_id}`, {
          method: "DELETE",
        });
        const data = (await res.json()) as {
          ok?: boolean;
          error?: string;
        };
        if (res.ok) {
          return { success: true };
        }
        return { success: false, error: data.error ?? `HTTP ${res.status}` };
      } catch (error) {
        return {
          success: false,
          error: error instanceof Error ? error.message : "Failed to reach agent runner",
        };
      }
    },
  }),
});

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
      const project = await findProjectByIdentifier(config, project_identifier);
      if (!project) {
        return { success: false, error: `Project "${project_identifier}" not found` };
      }

      try {
        const labels = await listLabels(config, project.id);
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

      // Fetch full issue details to get current labels
      const fullIssue = await getIssue(config, project.id, issue.id);
      const currentLabelIds = new Set(fullIssue.labels ?? []);

      // Validate and resolve label names to IDs
      const labelsToAdd: string[] = [];
      const notFound: string[] = [];

      for (const labelName of label_names) {
        const label = await findLabelByName(config, project.id, labelName);
        if (!label) {
          notFound.push(labelName);
        } else {
          labelsToAdd.push(label.name);
          currentLabelIds.add(label.id);
        }
      }

      if (notFound.length > 0) {
        const allLabels = await listLabels(config, project.id);
        const availableLabels = allLabels.map((l) => l.name).join(", ");
        return {
          success: false,
          error: `Labels not found: ${notFound.join(", ")}. Available labels: ${availableLabels}`,
        };
      }

      // Update issue with merged label IDs
      try {
        await updateIssue(config, project.id, issue.id, {
          labels: Array.from(currentLabelIds),
        });
        return {
          success: true,
          added_labels: labelsToAdd,
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

      // Fetch full issue details to get current labels
      const fullIssue = await getIssue(config, project.id, issue.id);
      const currentLabelIds = new Set(fullIssue.labels ?? []);

      // Resolve label names to IDs and remove them
      const labelsToRemove: string[] = [];
      for (const labelName of label_names) {
        const label = await findLabelByName(config, project.id, labelName);
        if (label && currentLabelIds.has(label.id)) {
          currentLabelIds.delete(label.id);
          labelsToRemove.push(label.name);
        }
      }

      // Update issue with remaining labels
      try {
        await updateIssue(config, project.id, issue.id, {
          labels: Array.from(currentLabelIds),
        });
        return {
          success: true,
          removed_labels: labelsToRemove,
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

export const createProjectManagementTools = (
  planeConfig: PlaneConfig,
  githubConfig: GitHubConfig
) => {
  return {
    searchGitHubProjects: createTool({
      id: "search_github_projects",
      description:
        "Search for GitHub repositories by name or URL. Returns top 5 results sorted by stars. Use this when user mentions adding a project or searching for a GitHub repo.",
      inputSchema: z.object({
        query: z
          .string()
          .describe(
            "Search query - can be a project name (e.g. 'verdandi') or GitHub URL (e.g. 'github.com/user/repo')"
          ),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        repositories: z
          .array(
            z.object({
              full_name: z.string(),
              description: z.string().nullable(),
              html_url: z.string(),
              language: z.string().nullable(),
              stargazers_count: z.number(),
              owner: z.string(),
              repo: z.string(),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async ({ query }) => {
        try {
          // Check if query is a URL
          const parsed = parseGitHubUrl(query);
          if (parsed) {
            // Direct lookup by URL
            const repo = await getRepository(parsed.owner, parsed.repo, githubConfig);
            if (!repo) {
              return {
                success: false,
                error: `Repository not found: ${parsed.owner}/${parsed.repo}`,
              };
            }
            return {
              success: true,
              repositories: [
                {
                  full_name: repo.full_name,
                  description: repo.description,
                  html_url: repo.html_url,
                  language: repo.language,
                  stargazers_count: repo.stargazers_count,
                  owner: repo.owner.login,
                  repo: repo.name,
                },
              ],
            };
          }

          // Search by name across user's accessible repos
          const repos = await searchUserRepositories(query, githubConfig);

          if (repos.length === 0) {
            // Fall back to global search if no user repos found
            const globalRepos = await searchRepositories(query, githubConfig);
            if (globalRepos.length === 0) {
              return {
                success: false,
                error: `No repositories found for "${query}". Try a more specific search term or GitHub URL.`,
              };
            }
            return {
              success: true,
              repositories: globalRepos.map((r) => ({
                full_name: r.full_name,
                description: r.description,
                html_url: r.html_url,
                language: r.language,
                stargazers_count: r.stargazers_count,
                owner: r.owner.login,
                repo: r.name,
              })),
            };
          }

          return {
            success: true,
            repositories: repos.map((r) => ({
              full_name: r.full_name,
              description: r.description,
              html_url: r.html_url,
              language: r.language,
              stargazers_count: r.stargazers_count,
              owner: r.owner.login,
              repo: r.name,
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to search GitHub",
          };
        }
      },
    }),

    searchPlaneProjects: createTool({
      id: "search_plane_projects",
      description:
        "Search for Plane projects by name (case-insensitive, fuzzy match). Use this to find existing Plane projects.",
      inputSchema: z.object({
        query: z.string().describe("Project name to search for (e.g. 'verdandi', 'agent hq')"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        projects: z
          .array(
            z.object({
              id: z.string(),
              name: z.string(),
              identifier: z.string(),
            })
          )
          .optional(),
        error: z.string().optional(),
      }),
      execute: async ({ query }) => {
        try {
          const allProjects = await listProjects(planeConfig);
          const normalizedQuery = query.toLowerCase().trim();

          // Fuzzy match on name or identifier
          const matches = allProjects.filter(
            (p) =>
              p.name.toLowerCase().includes(normalizedQuery) ||
              p.identifier.toLowerCase().includes(normalizedQuery)
          );

          if (matches.length === 0) {
            return {
              success: false,
              error: `No Plane projects found matching "${query}". Available projects: ${allProjects.map((p) => p.identifier).join(", ")}`,
            };
          }

          return {
            success: true,
            projects: matches.map((p) => ({
              id: p.id,
              name: p.name,
              identifier: p.identifier,
            })),
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to search Plane projects",
          };
        }
      },
    }),

    createPlaneProject: createTool({
      id: "create_plane_project",
      description:
        "Create a new Plane project with configuration cloned from a template project (default: AGENTHQ). Use this after confirming with the user.",
      inputSchema: z.object({
        name: z.string().describe("Project name (e.g. 'Verdandi', 'StyleSwipe')"),
        identifier: z
          .string()
          .describe("Project identifier code (e.g. 'VERDANDI', 'STYLESWIPE'). Must be uppercase."),
        description: z.string().optional().describe("Project description"),
        template_identifier: z
          .string()
          .optional()
          .describe("Template project identifier to clone labels from (default: 'AGENTHQ')"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        project: z
          .object({
            id: z.string(),
            name: z.string(),
            identifier: z.string(),
            url: z.string(),
          })
          .optional(),
        error: z.string().optional(),
      }),
      execute: async ({ name, identifier, description, template_identifier }) => {
        try {
          // Create the project
          const project = await createProject(
            planeConfig,
            name,
            identifier.toUpperCase(),
            description
          );

          // Clone configuration from template
          const templateId = template_identifier ?? "AGENTHQ";
          const templateProject = await findProjectByIdentifier(planeConfig, templateId);

          if (templateProject) {
            try {
              await cloneProjectConfiguration(planeConfig, templateProject.id, project.id);
            } catch (error) {
              console.warn("Failed to clone project configuration:", error);
              // Continue even if cloning fails
            }
          }

          // Build Plane web URL
          const baseUrl = planeConfig.baseUrl.replace("/api/v1", "");
          const projectUrl = `${baseUrl}/projects/${project.identifier.toLowerCase()}`;

          return {
            success: true,
            project: {
              id: project.id,
              name: project.name,
              identifier: project.identifier,
              url: projectUrl,
            },
          };
        } catch (error) {
          return {
            success: false,
            error: error instanceof Error ? error.message : "Failed to create Plane project",
          };
        }
      },
    }),

    findGitHubPlaneMatch: createTool({
      id: "find_github_plane_match",
      description:
        "Auto-search for a Plane project that matches a GitHub repository name. Use this after finding a GitHub repo to check if a Plane project already exists.",
      inputSchema: z.object({
        github_repo_name: z
          .string()
          .describe("GitHub repository name (e.g. 'verdandi', 'agent-hq')"),
      }),
      outputSchema: z.object({
        found: z.boolean(),
        plane_project: z
          .object({
            id: z.string(),
            name: z.string(),
            identifier: z.string(),
          })
          .optional(),
        suggestions: z.array(z.string()).optional(),
      }),
      execute: async ({ github_repo_name }) => {
        try {
          const allProjects = await listProjects(planeConfig);

          // Normalize GitHub repo name (remove hyphens, underscores)
          const normalized = github_repo_name.toLowerCase().replace(/[-_]/g, "");

          // Try exact match first
          const exactMatch = allProjects.find(
            (p) =>
              p.name.toLowerCase().replace(/[-_]/g, "") === normalized ||
              p.identifier.toLowerCase().replace(/[-_]/g, "") === normalized
          );

          if (exactMatch) {
            return {
              found: true,
              plane_project: {
                id: exactMatch.id,
                name: exactMatch.name,
                identifier: exactMatch.identifier,
              },
            };
          }

          // Try fuzzy match
          const fuzzyMatches = allProjects.filter(
            (p) =>
              p.name.toLowerCase().includes(normalized.substring(0, 5)) ||
              normalized.includes(p.name.toLowerCase().substring(0, 5))
          );

          if (fuzzyMatches.length > 0) {
            return {
              found: false,
              suggestions: fuzzyMatches.map((p) => p.identifier),
            };
          }

          return { found: false };
        } catch (error) {
          return { found: false };
        }
      },
    }),

    getProjectMapping: createTool({
      id: "get_project_mapping",
      description:
        "Get the current GitHub ↔ Plane project mappings from config. Use this to see which projects are already linked.",
      inputSchema: z.object({}),
      outputSchema: z.object({
        mappings: z.array(
          z.object({
            identifier: z.string(),
            github_url: z.string().optional(),
            plane_project: z.string().optional(),
          })
        ),
        note: z.string(),
      }),
      execute: async () => {
        try {
          const projects = await listProjects(planeConfig);
          return {
            mappings: projects.map((p) => ({
              identifier: p.identifier,
              plane_project: p.name,
            })),
            note: "Full GitHub ↔ Plane mappings are stored in agent-runner config.json. The bot currently shows all Plane projects.",
          };
        } catch (error) {
          return {
            mappings: [],
            note: error instanceof Error ? error.message : "Failed to get mappings",
          };
        }
      },
    }),

    linkGitHubPlaneProject: createTool({
      id: "link_github_plane_project",
      description:
        "Guide user to link GitHub and Plane projects by updating config.json. Use this after finding both GitHub repo and Plane project.",
      inputSchema: z.object({
        github_owner: z.string().describe("GitHub repository owner"),
        github_repo: z.string().describe("GitHub repository name"),
        github_url: z.string().describe("Full GitHub repository URL"),
        plane_identifier: z.string().describe("Plane project identifier"),
        plane_project_id: z.string().describe("Plane project UUID"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        instructions: z.string(),
        config_snippet: z.string(),
      }),
      execute: async ({
        github_owner,
        github_repo,
        github_url,
        plane_identifier,
        plane_project_id,
      }) => {
        const configSnippet = JSON.stringify(
          {
            [plane_identifier]: {
              repoUrl: github_url,
              planeProjectId: plane_project_id,
              planeIdentifier: plane_identifier,
              defaultBranch: "main",
            },
          },
          null,
          2
        );

        const instructions = `To complete the linking:

1. Add this to agent-runner/config.json under "projects":

${configSnippet}

2. Restart both agent-runner and telegram-bot services:
   cd agent-runner && docker compose restart
   cd telegram-bot && docker compose restart

The projects will then be fully linked and the agent can work on tasks in this project.`;

        return {
          success: true,
          instructions,
          config_snippet: configSnippet,
        };
      },
    }),
  };
};
