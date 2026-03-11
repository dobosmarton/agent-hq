import { createTool } from "@mastra/core/tools";
import { z } from "zod";
import type { GitHubConfig, PlaneClient } from "../types";
import {
  getRepository,
  parseGitHubUrl,
  searchRepositories,
  searchUserRepositories,
} from "../github";
import { linkProject } from "../config/project-linker";
export { createPlaneTools } from "@agent-hq/plane-tools";

// Zod schemas for agent-runner API responses (validated at boundary)
const AgentStatusResponseSchema = z
  .object({
    queue: z.array(
      z
        .object({
          projectIdentifier: z.string(),
          sequenceId: z.number(),
          title: z.string(),
          retryCount: z.number(),
          nextAttemptAt: z.number(),
        })
        .passthrough()
    ),
    active: z.array(
      z
        .object({
          projectIdentifier: z.string(),
          sequenceId: z.number(),
          title: z.string(),
          phase: z.string(),
          status: z.string(),
          startedAt: z.number(),
          costUsd: z.number().optional(),
          retryCount: z.number(),
        })
        .passthrough()
    ),
    dailySpend: z.number(),
    dailyBudget: z.number(),
  })
  .passthrough();

const AgentRemoveResponseSchema = z
  .object({
    ok: z.boolean().optional(),
    error: z.string().optional(),
  })
  .passthrough();

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
        const data = AgentStatusResponseSchema.parse(await res.json());

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
        const data = AgentRemoveResponseSchema.parse(await res.json());
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

export const createProjectManagementTools = (
  plane: PlaneClient,
  planeBaseUrl: string,
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
          const allProjects = await plane.listProjects();
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
        "Create a new Plane project with configuration cloned from a template project (default: AGENTHQ). Optionally provide a GitHub repo to automatically link the project. Use this after confirming with the user.",
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
        github_repo: z
          .string()
          .optional()
          .describe(
            "GitHub repository in 'owner/repo' format (e.g. 'dobosmarton/verdandi'). If provided, automatically links the GitHub repo to the new Plane project."
          ),
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
        linking: z
          .object({
            success: z.boolean(),
            status: z.string().optional(),
            error: z.string().optional(),
          })
          .optional(),
        error: z.string().optional(),
      }),
      execute: async ({ name, identifier, description, template_identifier, github_repo }) => {
        try {
          // Create the project
          const project = await plane.createProject(name, identifier.toUpperCase(), description);

          // Clone configuration from template
          const templateId = template_identifier ?? "AGENTHQ";
          const templateProject = await plane.findProjectByIdentifier(templateId);

          if (templateProject) {
            try {
              await plane.cloneProjectConfiguration(templateProject.id, project.id);
            } catch (error) {
              console.warn("Failed to clone project configuration:", error);
              // Continue even if cloning fails
            }
          }

          // Build Plane web URL
          const projectUrl = `${planeBaseUrl}/projects/${project.identifier.toLowerCase()}`;

          // Auto-link GitHub repo if provided
          if (github_repo) {
            const parsed = parseGitHubUrl(github_repo);
            if (!parsed) {
              return {
                success: true,
                project: {
                  id: project.id,
                  name: project.name,
                  identifier: project.identifier,
                  url: projectUrl,
                },
                linking: {
                  success: false,
                  error: `Invalid GitHub repo format: "${github_repo}". Expected "owner/repo".`,
                },
              };
            }

            const githubUrl = `https://github.com/${parsed.owner}/${parsed.repo}`;
            const linkResult = await linkProject({
              githubOwner: parsed.owner,
              githubRepo: parsed.repo,
              githubUrl,
              planeIdentifier: project.identifier,
              planeProjectId: project.id,
              githubConfig,
            });

            return {
              success: true,
              project: {
                id: project.id,
                name: project.name,
                identifier: project.identifier,
                url: projectUrl,
              },
              linking: linkResult.success
                ? { success: true, status: linkResult.status }
                : { success: false, error: linkResult.reason },
            };
          }

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
          const allProjects = await plane.listProjects();

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
          const projects = await plane.listProjects();
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
        "Automatically link a GitHub repository to a Plane project by updating agent-runner config.json. Use this after finding both GitHub repo and Plane project.",
      inputSchema: z.object({
        github_owner: z.string().describe("GitHub repository owner"),
        github_repo: z.string().describe("GitHub repository name"),
        github_url: z.string().describe("Full GitHub repository URL"),
        plane_identifier: z.string().describe("Plane project identifier"),
        plane_project_id: z.string().describe("Plane project UUID"),
      }),
      outputSchema: z.object({
        success: z.boolean(),
        message: z.string(),
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
              repoPath: `/repos/${github_repo}`,
              repoUrl: github_url,
              defaultBranch: "main",
              planeProjectId: plane_project_id,
              planeIdentifier: plane_identifier,
            },
          },
          null,
          2
        );

        const result = await linkProject({
          githubOwner: github_owner,
          githubRepo: github_repo,
          githubUrl: github_url,
          planeIdentifier: plane_identifier,
          planeProjectId: plane_project_id,
          githubConfig,
        });

        if (!result.success) {
          const fallback = `Automatic linking failed: ${result.reason}

Please manually add this to agent-runner/config.json under "projects":

${configSnippet}

Then restart the agent-runner service.`;

          return {
            success: false,
            message: fallback,
            config_snippet: configSnippet,
          };
        }

        if (result.status === "already_exists") {
          return {
            success: true,
            message: `✅ Project ${plane_identifier} is already linked to ${github_owner}/${github_repo} in config.json.`,
            config_snippet: configSnippet,
          };
        }

        return {
          success: true,
          message: `✅ Successfully linked ${github_owner}/${github_repo} → ${plane_identifier}!\n\nconfig.json has been updated automatically. The project is ready for agent tasks.`,
          config_snippet: configSnippet,
        };
      },
    }),
  };
};
