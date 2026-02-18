import {
  type PlaneConfig,
  type PlaneProject,
  type PlaneState,
  type PlaneIssue,
  PlaneProjectSchema,
  PlaneStateSchema,
  PlaneIssueSchema,
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

export const listIssues = async (config: PlaneConfig, projectId: string): Promise<PlaneIssue[]> => {
  const params = new URLSearchParams({
    state_group: "backlog,unstarted,started",
    per_page: "50",
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
