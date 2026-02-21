import {
  type PlaneConfig,
  type PlaneProject,
  type PlaneState,
  type PlaneIssue,
  type PlaneComment,
  type PlaneLabel,
  PlaneProjectSchema,
  PlaneStateSchema,
  PlaneIssueSchema,
  PlaneCommentSchema,
  PlaneLabelSchema,
  PlanePaginatedSchema,
} from "./types.js";

const planeHeaders = (config: PlaneConfig): Record<string, string> => ({
  "X-API-Key": config.apiKey,
  "Content-Type": "application/json",
});

const workspaceUrl = (config: PlaneConfig): string =>
  `${config.baseUrl}/workspaces/${config.workspaceSlug}`;

export const listProjects = async (config: PlaneConfig): Promise<PlaneProject[]> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/`, {
    headers: planeHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneProjectSchema).parse(data);
  return parsed.results;
};

export const listStates = async (config: PlaneConfig, projectId: string): Promise<PlaneState[]> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/states/`, {
    headers: planeHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneStateSchema).parse(data);
  return parsed.results;
};

export const listIssues = async (
  config: PlaneConfig,
  projectId: string,
  options?: { stateIds?: string[] }
): Promise<PlaneIssue[]> => {
  const params = new URLSearchParams({
    per_page: "50",
  });

  // If no specific state IDs provided, use default groups
  if (!options?.stateIds || options.stateIds.length === 0) {
    params.set("state_group", "backlog,unstarted,started");
  } else {
    // Filter by specific state IDs
    params.set("state", options.stateIds.join(","));
  }

  const res = await fetch(
    `${workspaceUrl(config)}/projects/${projectId}/issues/?${params.toString()}`,
    { headers: planeHeaders(config) }
  );

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneIssueSchema).parse(data);
  return parsed.results;
};

export const createIssue = async (
  config: PlaneConfig,
  projectId: string,
  name: string,
  descriptionHtml?: string
): Promise<PlaneIssue> => {
  const body: Record<string, string> = { name };
  if (descriptionHtml) {
    body["description_html"] = descriptionHtml;
  }

  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/issues/`, {
    method: "POST",
    headers: planeHeaders(config),
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  const data: unknown = await res.json();
  return PlaneIssueSchema.parse(data);
};

export const findProjectByIdentifier = async (
  config: PlaneConfig,
  identifier: string
): Promise<PlaneProject | null> => {
  const projects = await listProjects(config);
  const upper = identifier.toUpperCase();
  return projects.find((p) => p.identifier === upper) ?? null;
};

export const buildStateMap = async (
  config: PlaneConfig,
  projectId: string
): Promise<Map<string, string>> => {
  const states = await listStates(config, projectId);
  const map = new Map<string, string>();
  for (const state of states) {
    map.set(state.id, state.name);
  }
  return map;
};

/**
 * Parse task identifier like "VERDANDI-5" into project identifier and sequence ID
 */
export const parseIssueIdentifier = (
  taskId: string
): { projectIdentifier: string; sequenceId: number } | null => {
  const match = taskId.match(/^([A-Z]+)-(\d+)$/i);
  if (!match) return null;
  return {
    projectIdentifier: match[1]!.toUpperCase(),
    sequenceId: parseInt(match[2]!, 10),
  };
};

/**
 * Find an issue by its sequence ID within a project
 */
export const findIssueBySequenceId = async (
  config: PlaneConfig,
  projectId: string,
  sequenceId: number
): Promise<PlaneIssue | null> => {
  const params = new URLSearchParams({
    per_page: "100",
  });

  const res = await fetch(
    `${workspaceUrl(config)}/projects/${projectId}/issues/?${params.toString()}`,
    { headers: planeHeaders(config) }
  );

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneIssueSchema).parse(data);
  return parsed.results.find((issue) => issue.sequence_id === sequenceId) ?? null;
};

/**
 * Get full details of a specific issue by ID
 */
export const getIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`, {
    headers: planeHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  return PlaneIssueSchema.parse(data);
};

/**
 * List comments for an issue
 */
export const listIssueComments = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> => {
  const res = await fetch(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    { headers: planeHeaders(config) }
  );

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneCommentSchema).parse(data);
  return parsed.results;
};

/**
 * Add a comment to an issue
 */
export const addIssueComment = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<PlaneComment> => {
  const res = await fetch(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    {
      method: "POST",
      headers: planeHeaders(config),
      body: JSON.stringify({ comment_html: commentHtml }),
    }
  );

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  const data: unknown = await res.json();
  return PlaneCommentSchema.parse(data);
};

/**
 * Update issue state
 */
export const updateIssueState = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  stateId: string
): Promise<PlaneIssue> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`, {
    method: "PATCH",
    headers: planeHeaders(config),
    body: JSON.stringify({ state: stateId }),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  const data: unknown = await res.json();
  return PlaneIssueSchema.parse(data);
};

/**
 * Generic function to update any issue fields
 */
export const updateIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  updates: Partial<PlaneIssue>
): Promise<PlaneIssue> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`, {
    method: "PATCH",
    headers: planeHeaders(config),
    body: JSON.stringify(updates),
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  const data: unknown = await res.json();
  return PlaneIssueSchema.parse(data);
};

/**
 * List all labels for a project
 */
export const listLabels = async (config: PlaneConfig, projectId: string): Promise<PlaneLabel[]> => {
  const res = await fetch(`${workspaceUrl(config)}/projects/${projectId}/issue-labels/`, {
    headers: planeHeaders(config),
  });

  if (!res.ok) {
    throw new Error(`Plane API error: ${res.status} ${res.statusText}`);
  }

  const data: unknown = await res.json();
  const parsed = PlanePaginatedSchema(PlaneLabelSchema).parse(data);
  return parsed.results;
};

/**
 * Find a label by name (case-insensitive)
 */
export const findLabelByName = async (
  config: PlaneConfig,
  projectId: string,
  labelName: string
): Promise<PlaneLabel | null> => {
  const labels = await listLabels(config, projectId);
  const normalizedName = labelName.toLowerCase().trim();
  return labels.find((l) => l.name.toLowerCase().trim() === normalizedName) ?? null;
};
