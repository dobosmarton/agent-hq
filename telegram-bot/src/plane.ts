import { createPlaneClient } from "@agent-hq/plane-client";
import type {
  PlaneComment,
  PlaneConfig,
  PlaneIssue,
  PlaneLabel,
  PlaneProject,
  PlaneState,
} from "@agent-hq/plane-client";

// Re-export standalone functions that delegate to the shared client.
// Function names match the telegram-bot's existing API surface.

// --- Projects ---

export const listProjects = async (config: PlaneConfig): Promise<PlaneProject[]> =>
  createPlaneClient(config).listProjects();

export const findProjectByIdentifier = async (
  config: PlaneConfig,
  identifier: string
): Promise<PlaneProject | null> => createPlaneClient(config).findProjectByIdentifier(identifier);

export const createProject = async (
  config: PlaneConfig,
  name: string,
  identifier: string,
  description?: string
): Promise<PlaneProject> => createPlaneClient(config).createProject(name, identifier, description);

// --- States ---

export const listStates = async (config: PlaneConfig, projectId: string): Promise<PlaneState[]> =>
  createPlaneClient(config).listStates(projectId);

export const buildStateMap = async (
  config: PlaneConfig,
  projectId: string
): Promise<Map<string, PlaneState>> => createPlaneClient(config).buildStateMap(projectId);

// --- Labels ---

export const listLabels = async (config: PlaneConfig, projectId: string): Promise<PlaneLabel[]> =>
  createPlaneClient(config).listLabels(projectId);

export const findLabelByName = async (
  config: PlaneConfig,
  projectId: string,
  labelName: string
): Promise<PlaneLabel | null> => createPlaneClient(config).findLabelByName(projectId, labelName);

// --- Issues ---

export const listIssues = async (
  config: PlaneConfig,
  projectId: string,
  options?: { stateIds?: string[] }
): Promise<PlaneIssue[]> => {
  const params: Record<string, string> = {};

  if (!options?.stateIds || options.stateIds.length === 0) {
    params["state_group"] = "backlog,unstarted,started";
  } else {
    params["state"] = options.stateIds.join(",");
  }

  return createPlaneClient(config).listIssues(projectId, params);
};

export const createIssue = async (
  config: PlaneConfig,
  projectId: string,
  name: string,
  descriptionHtml?: string
): Promise<PlaneIssue> => createPlaneClient(config).createIssue(projectId, name, descriptionHtml);

export const getIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> => createPlaneClient(config).getIssue(projectId, issueId);

export const updateIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  updates: Record<string, unknown>
): Promise<PlaneIssue> => createPlaneClient(config).updateIssue(projectId, issueId, updates);

export const findIssueBySequenceId = async (
  config: PlaneConfig,
  projectId: string,
  sequenceId: number
): Promise<PlaneIssue | null> =>
  createPlaneClient(config).findIssueBySequenceId(projectId, sequenceId);

export const updateIssueState = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  stateId: string
): Promise<PlaneIssue> =>
  createPlaneClient(config).updateIssue(projectId, issueId, { state: stateId });

// --- Comments ---

export const listIssueComments = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> => createPlaneClient(config).listComments(projectId, issueId);

export const addIssueComment = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<PlaneComment> => createPlaneClient(config).addComment(projectId, issueId, commentHtml);

// --- Utilities ---

export const parseIssueIdentifier = createPlaneClient({
  apiKey: "",
  baseUrl: "",
  workspaceSlug: "",
}).parseIssueIdentifier;

export const cloneProjectConfiguration = async (
  config: PlaneConfig,
  templateProjectId: string,
  newProjectId: string
): Promise<void> =>
  createPlaneClient(config).cloneProjectConfiguration(templateProjectId, newProjectId);
