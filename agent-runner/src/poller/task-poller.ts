import type { PlaneConfig } from "../config.js";
import type { Config } from "../config.js";
import type { AgentTask } from "../types.js";
import {
  listProjects,
  listIssues,
  listLabels,
  listStates,
  updateIssue,
} from "../plane/client.js";
import type { PlaneProject } from "../plane/types.js";

type ProjectCache = {
  project: PlaneProject;
  agentLabelId: string;
  todoStateId: string;
  inProgressStateId: string;
  inReviewStateId: string | null;
  doneStateId: string | null;
};

export const createTaskPoller = (planeConfig: PlaneConfig, config: Config) => {
  const projectCaches = new Map<string, ProjectCache>();
  const claimedIssues = new Set<string>();

  const initialize = async (): Promise<void> => {
    console.log("Initializing task poller...");
    const projects = await listProjects(planeConfig);

    for (const [identifier, _projectConfig] of Object.entries(
      config.projects,
    )) {
      const project = projects.find(
        (p) => p.identifier === identifier.toUpperCase(),
      );
      if (!project) {
        console.warn(`Project "${identifier}" not found in Plane, skipping`);
        continue;
      }

      // Find the "agent" label
      const labels = await listLabels(planeConfig, project.id);
      const agentLabel = labels.find(
        (l) => l.name.toLowerCase() === config.agent.labelName.toLowerCase(),
      );
      if (!agentLabel) {
        console.warn(
          `Label "${config.agent.labelName}" not found in project ${identifier}`,
        );
        continue;
      }

      // Find state IDs
      const states = await listStates(planeConfig, project.id);
      const todoState = states.find((s) => s.group === "unstarted");
      const inProgressState = states.find((s) => s.group === "started");
      const inReviewState = states.find(
        (s) => s.group === "started" && s.name.toLowerCase().includes("review"),
      );
      const doneState = states.find((s) => s.group === "completed");

      if (!todoState || !inProgressState) {
        console.warn(`Missing required states in project ${identifier}`);
        continue;
      }

      projectCaches.set(identifier.toUpperCase(), {
        project,
        agentLabelId: agentLabel.id,
        todoStateId: todoState.id,
        inProgressStateId: inProgressState.id,
        inReviewStateId: inReviewState?.id ?? null,
        doneStateId: doneState?.id ?? null,
      });

      console.log(
        `Registered project ${identifier}: label=${agentLabel.name}, todo=${todoState.name}, inProgress=${inProgressState.name}`,
      );
    }

    console.log(`Task poller initialized with ${projectCaches.size} projects`);
  };

  const pollForTasks = async (maxTasks: number): Promise<AgentTask[]> => {
    const tasks: AgentTask[] = [];

    for (const [identifier, cache] of projectCaches) {
      if (tasks.length >= maxTasks) break;

      try {
        const issues = await listIssues(planeConfig, cache.project.id, {
          state: cache.todoStateId,
        });

        for (const issue of issues) {
          if (tasks.length >= maxTasks) break;
          if (claimedIssues.has(issue.id)) continue;

          // Check if issue has the agent label
          const hasAgentLabel = issue.label_ids.includes(cache.agentLabelId);
          if (!hasAgentLabel) continue;

          tasks.push({
            issueId: issue.id,
            projectId: cache.project.id,
            projectIdentifier: identifier,
            sequenceId: issue.sequence_id,
            title: issue.name,
            descriptionHtml: issue.description_html ?? "",
            stateId: issue.state,
            labelIds: issue.label_ids,
          });
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Error polling project ${identifier}: ${msg}`);
      }
    }

    return tasks;
  };

  const claimTask = async (task: AgentTask): Promise<boolean> => {
    const cache = projectCaches.get(task.projectIdentifier);
    if (!cache) return false;

    try {
      await updateIssue(planeConfig, task.projectId, task.issueId, {
        state: cache.inProgressStateId,
      });
      claimedIssues.add(task.issueId);
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to claim task ${task.issueId}: ${msg}`);
      return false;
    }
  };

  const releaseTask = (issueId: string): void => {
    claimedIssues.delete(issueId);
  };

  const getProjectCache = (identifier: string): ProjectCache | undefined => {
    return projectCaches.get(identifier.toUpperCase());
  };

  return { initialize, pollForTasks, claimTask, releaseTask, getProjectCache };
};

export type TaskPoller = ReturnType<typeof createTaskPoller>;
