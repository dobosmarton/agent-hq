import type { PlaneConfig } from "../config.js";
import {
  type PlaneProject,
  type PlaneState,
  type PlaneIssue,
  type PlaneLabel,
  type PlaneComment,
  PlaneProjectSchema,
  PlaneStateSchema,
  PlaneIssueSchema,
  PlaneLabelSchema,
  PlaneCommentSchema,
  PlanePaginatedSchema,
} from "./types.js";

const headers = (config: PlaneConfig): Record<string, string> => ({
  "X-API-Key": config.apiKey,
  "Content-Type": "application/json",
});

const workspaceUrl = (config: PlaneConfig): string =>
  `${config.baseUrl}/workspaces/${config.workspaceSlug}`;

async function planeRequest(url: string, config: PlaneConfig, init?: RequestInit): Promise<unknown> {
  const res = await fetch(url, {
    ...init,
    headers: { ...headers(config), ...init?.headers },
  });

  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Plane API error: ${res.status} ${body}`);
  }

  return res.json();
}

// --- Projects ---

export async function listProjects(config: PlaneConfig): Promise<PlaneProject[]> {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/`, config);
  return PlanePaginatedSchema(PlaneProjectSchema).parse(data).results;
}

export async function findProjectByIdentifier(
  config: PlaneConfig,
  identifier: string
): Promise<PlaneProject | null> {
  const projects = await listProjects(config);
  const upper = identifier.toUpperCase();
  return projects.find((p) => p.identifier === upper) ?? null;
}

// --- States ---

export async function listStates(config: PlaneConfig, projectId: string): Promise<PlaneState[]> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/states/`,
    config
  );
  return PlanePaginatedSchema(PlaneStateSchema).parse(data).results;
}

export async function buildStateMap(
  config: PlaneConfig,
  projectId: string
): Promise<Map<string, PlaneState>> {
  const states = await listStates(config, projectId);
  const map = new Map<string, PlaneState>();
  for (const state of states) {
    map.set(state.id, state);
  }
  return map;
}

export async function findStateByGroupAndName(
  config: PlaneConfig,
  projectId: string,
  group: string,
  name?: string
): Promise<PlaneState | null> {
  const states = await listStates(config, projectId);
  return (
    states.find(
      (s) => s.group === group && (name === undefined || s.name.toLowerCase() === name.toLowerCase())
    ) ?? null
  );
}

// --- Labels ---

export async function listLabels(config: PlaneConfig, projectId: string): Promise<PlaneLabel[]> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/labels/`,
    config
  );
  return PlanePaginatedSchema(PlaneLabelSchema).parse(data).results;
}

export async function findLabelByName(
  config: PlaneConfig,
  projectId: string,
  name: string
): Promise<PlaneLabel | null> {
  const labels = await listLabels(config, projectId);
  return labels.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? null;
}

// --- Issues ---

export async function listIssues(
  config: PlaneConfig,
  projectId: string,
  params?: Record<string, string>
): Promise<PlaneIssue[]> {
  const searchParams = new URLSearchParams({
    per_page: "50",
    ...params,
  });

  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/?${searchParams.toString()}`,
    config
  );
  return PlanePaginatedSchema(PlaneIssueSchema).parse(data).results;
}

export async function getIssue(
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config
  );
  return PlaneIssueSchema.parse(data);
}

export async function updateIssue(
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  update: Record<string, unknown>
): Promise<PlaneIssue> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config,
    {
      method: "PATCH",
      body: JSON.stringify(update),
    }
  );
  return PlaneIssueSchema.parse(data);
}

// --- Comments ---

export async function addComment(
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<PlaneComment> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ comment_html: commentHtml }),
    }
  );
  return PlaneCommentSchema.parse(data);
}

export async function listComments(
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config
  );
  return PlanePaginatedSchema(PlaneCommentSchema).parse(data).results;
}
