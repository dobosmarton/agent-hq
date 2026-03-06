import type {
  PlaneComment,
  PlaneConfig,
  PlaneIssue,
  PlaneLabel,
  PlaneLink,
  PlaneProject,
  PlaneState,
} from "./types";
import {
  PlaneCommentSchema,
  PlaneIssueSchema,
  PlaneLabelSchema,
  PlaneLinkSchema,
  PlanePaginatedSchema,
  PlaneProjectSchema,
  PlaneStateSchema,
} from "./schemas";

const headers = (config: PlaneConfig): Record<string, string> => ({
  "X-API-Key": config.apiKey,
  "Content-Type": "application/json",
});

const workspaceUrl = (config: PlaneConfig): string =>
  `${config.baseUrl}/workspaces/${config.workspaceSlug}`;

const planeRequest = async (
  url: string,
  config: PlaneConfig,
  init?: RequestInit
): Promise<unknown> => {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(config), ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  return res.json();
};

// --- Projects ---

const listProjects = async (config: PlaneConfig): Promise<PlaneProject[]> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/`, config);
  return PlanePaginatedSchema(PlaneProjectSchema).parse(data).results;
};

const findProjectByIdentifier = async (
  config: PlaneConfig,
  identifier: string
): Promise<PlaneProject | null> => {
  const projects = await listProjects(config);
  const upper = identifier.toUpperCase();
  return projects.find((p) => p.identifier === upper) ?? null;
};

const createProject = async (
  config: PlaneConfig,
  name: string,
  identifier: string,
  description?: string
): Promise<PlaneProject> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/`, config, {
    method: "POST",
    body: JSON.stringify({
      name,
      identifier: identifier.toUpperCase(),
      description: description ?? "",
    }),
  });
  return PlaneProjectSchema.parse(data);
};

// --- States ---

const listStates = async (config: PlaneConfig, projectId: string): Promise<PlaneState[]> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/${projectId}/states/`, config);
  return PlanePaginatedSchema(PlaneStateSchema).parse(data).results;
};

const buildStateMap = async (
  config: PlaneConfig,
  projectId: string
): Promise<Map<string, PlaneState>> => {
  const states = await listStates(config, projectId);
  return new Map(states.map((s) => [s.id, s]));
};

const findStateByGroupAndName = async (
  config: PlaneConfig,
  projectId: string,
  group: string,
  name?: string
): Promise<PlaneState | null> => {
  const states = await listStates(config, projectId);
  return (
    states.find(
      (s) =>
        s.group === group && (name === undefined || s.name.toLowerCase() === name.toLowerCase())
    ) ?? null
  );
};

// --- Labels ---

const listLabels = async (config: PlaneConfig, projectId: string): Promise<PlaneLabel[]> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/${projectId}/labels/`, config);
  return PlanePaginatedSchema(PlaneLabelSchema).parse(data).results;
};

const findLabelByName = async (
  config: PlaneConfig,
  projectId: string,
  name: string
): Promise<PlaneLabel | null> => {
  const labels = await listLabels(config, projectId);
  return labels.find((l) => l.name.toLowerCase().trim() === name.toLowerCase().trim()) ?? null;
};

const createLabel = async (
  config: PlaneConfig,
  projectId: string,
  label: { name: string; color?: string; description?: string }
): Promise<PlaneLabel> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/${projectId}/labels/`, config, {
    method: "POST",
    body: JSON.stringify({
      name: label.name,
      color: label.color ?? "#000000",
      description: label.description ?? "",
    }),
  });
  return PlaneLabelSchema.parse(data);
};

// --- Issues ---

const listIssues = async (
  config: PlaneConfig,
  projectId: string,
  params?: Record<string, string>
): Promise<PlaneIssue[]> => {
  const searchParams = new URLSearchParams({
    per_page: "50",
    ...params,
  });

  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/?${searchParams.toString()}`,
    config
  );
  return PlanePaginatedSchema(PlaneIssueSchema).parse(data).results;
};

const getIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config
  );
  return PlaneIssueSchema.parse(data);
};

const createIssue = async (
  config: PlaneConfig,
  projectId: string,
  name: string,
  descriptionHtml?: string
): Promise<PlaneIssue> => {
  const body: Record<string, string> = { name };
  if (descriptionHtml) {
    body["description_html"] = descriptionHtml;
  }

  const data = await planeRequest(`${workspaceUrl(config)}/projects/${projectId}/issues/`, config, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return PlaneIssueSchema.parse(data);
};

const updateIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  update: Record<string, unknown>
): Promise<PlaneIssue> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config,
    {
      method: "PATCH",
      body: JSON.stringify(update),
    }
  );
  return PlaneIssueSchema.parse(data);
};

const findIssueBySequenceId = async (
  config: PlaneConfig,
  projectId: string,
  sequenceId: number
): Promise<PlaneIssue | null> => {
  const issues = await listIssues(config, projectId, { per_page: "100" });
  return issues.find((issue) => issue.sequence_id === sequenceId) ?? null;
};

// --- Comments ---

const addComment = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<PlaneComment> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ comment_html: commentHtml }),
    }
  );
  return PlaneCommentSchema.parse(data);
};

const listComments = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config
  );
  return PlanePaginatedSchema(PlaneCommentSchema).parse(data).results;
};

// --- Links ---

const addLink = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  title: string,
  url: string
): Promise<PlaneLink> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/links/`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ title, url }),
    }
  );
  return PlaneLinkSchema.parse(data);
};

// --- Utilities ---

const parseIssueIdentifier = (
  taskId: string
): { projectIdentifier: string; sequenceId: number } | null => {
  const match = taskId.match(/^([A-Z]+)-(\d+)$/i);
  if (!match) return null;
  return {
    projectIdentifier: match[1]!.toUpperCase(),
    sequenceId: parseInt(match[2]!, 10),
  };
};

const cloneProjectConfiguration = async (
  config: PlaneConfig,
  templateProjectId: string,
  newProjectId: string
): Promise<void> => {
  const templateLabels = await listLabels(config, templateProjectId);

  for (const label of templateLabels) {
    try {
      await createLabel(config, newProjectId, {
        name: label.name,
        color: label.color,
        description: label.description,
      });
    } catch (error) {
      console.warn(`Failed to create label "${label.name}":`, error);
    }
  }
};

// --- Factory ---

export type PlaneClient = ReturnType<typeof createPlaneClient>;

export const createPlaneClient = (config: PlaneConfig) => ({
  // Projects
  listProjects: () => listProjects(config),
  findProjectByIdentifier: (identifier: string) => findProjectByIdentifier(config, identifier),
  createProject: (name: string, identifier: string, description?: string) =>
    createProject(config, name, identifier, description),

  // States
  listStates: (projectId: string) => listStates(config, projectId),
  buildStateMap: (projectId: string) => buildStateMap(config, projectId),
  findStateByGroupAndName: (projectId: string, group: string, name?: string) =>
    findStateByGroupAndName(config, projectId, group, name),

  // Labels
  listLabels: (projectId: string) => listLabels(config, projectId),
  findLabelByName: (projectId: string, name: string) => findLabelByName(config, projectId, name),
  createLabel: (projectId: string, label: { name: string; color?: string; description?: string }) =>
    createLabel(config, projectId, label),

  // Issues
  listIssues: (projectId: string, params?: Record<string, string>) =>
    listIssues(config, projectId, params),
  getIssue: (projectId: string, issueId: string) => getIssue(config, projectId, issueId),
  createIssue: (projectId: string, name: string, descriptionHtml?: string) =>
    createIssue(config, projectId, name, descriptionHtml),
  updateIssue: (projectId: string, issueId: string, update: Record<string, unknown>) =>
    updateIssue(config, projectId, issueId, update),
  findIssueBySequenceId: (projectId: string, sequenceId: number) =>
    findIssueBySequenceId(config, projectId, sequenceId),

  // Comments
  addComment: (projectId: string, issueId: string, commentHtml: string) =>
    addComment(config, projectId, issueId, commentHtml),
  listComments: (projectId: string, issueId: string) => listComments(config, projectId, issueId),

  // Links
  addLink: (projectId: string, issueId: string, title: string, url: string) =>
    addLink(config, projectId, issueId, title, url),

  // Utilities
  parseIssueIdentifier,
  cloneProjectConfiguration: (templateProjectId: string, newProjectId: string) =>
    cloneProjectConfiguration(config, templateProjectId, newProjectId),
});
