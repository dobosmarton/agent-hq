import type { PlaneConfig } from "../config";
import {
  type PlaneComment,
  PlaneCommentSchema,
  type PlaneIssue,
  PlaneIssueSchema,
  type PlaneLabel,
  PlaneLabelSchema,
  type PlaneLink,
  PlaneLinkSchema,
  PlanePaginatedSchema,
  type PlaneProject,
  PlaneProjectSchema,
  type PlaneState,
  PlaneStateSchema,
} from "./types";

const headers = (config: PlaneConfig): Record<string, string> => ({
  "X-API-Key": config.apiKey,
  "Content-Type": "application/json",
});

const workspaceUrl = (config: PlaneConfig): string =>
  `${config.baseUrl}/workspaces/${config.workspaceSlug}`;

const planeRequest = async (
  url: string,
  config: PlaneConfig,
  init?: RequestInit,
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

export const listProjects = async (
  config: PlaneConfig,
): Promise<PlaneProject[]> => {
  const data = await planeRequest(`${workspaceUrl(config)}/projects/`, config);
  return PlanePaginatedSchema(PlaneProjectSchema).parse(data).results;
};

export const findProjectByIdentifier = async (
  config: PlaneConfig,
  identifier: string,
): Promise<PlaneProject | null> => {
  const projects = await listProjects(config);
  const upper = identifier.toUpperCase();
  return projects.find((p) => p.identifier === upper) ?? null;
};

// --- States ---

export const listStates = async (
  config: PlaneConfig,
  projectId: string,
): Promise<PlaneState[]> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/states/`,
    config,
  );
  return PlanePaginatedSchema(PlaneStateSchema).parse(data).results;
};

export const buildStateMap = async (
  config: PlaneConfig,
  projectId: string,
): Promise<Map<string, PlaneState>> => {
  const states = await listStates(config, projectId);
  return new Map(states.map((s) => [s.id, s]));
};

export const findStateByGroupAndName = async (
  config: PlaneConfig,
  projectId: string,
  group: string,
  name?: string,
): Promise<PlaneState | null> => {
  const states = await listStates(config, projectId);
  return (
    states.find(
      (s) =>
        s.group === group &&
        (name === undefined || s.name.toLowerCase() === name.toLowerCase()),
    ) ?? null
  );
};

// --- Labels ---

export const listLabels = async (
  config: PlaneConfig,
  projectId: string,
): Promise<PlaneLabel[]> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/labels/`,
    config,
  );
  return PlanePaginatedSchema(PlaneLabelSchema).parse(data).results;
};

export const findLabelByName = async (
  config: PlaneConfig,
  projectId: string,
  name: string,
): Promise<PlaneLabel | null> => {
  const labels = await listLabels(config, projectId);
  return (
    labels.find((l) => l.name.toLowerCase() === name.toLowerCase()) ?? null
  );
};

// --- Issues ---

export const listIssues = async (
  config: PlaneConfig,
  projectId: string,
  params?: Record<string, string>,
): Promise<PlaneIssue[]> => {
  const searchParams = new URLSearchParams({
    per_page: "50",
    ...params,
  });

  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/?${searchParams.toString()}`,
    config,
  );
  return PlanePaginatedSchema(PlaneIssueSchema).parse(data).results;
};

export const getIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
): Promise<PlaneIssue> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config,
  );
  return PlaneIssueSchema.parse(data);
};

export const updateIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  update: Record<string, unknown>,
): Promise<PlaneIssue> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/`,
    config,
    {
      method: "PATCH",
      body: JSON.stringify(update),
    },
  );
  return PlaneIssueSchema.parse(data);
};

// --- Comments ---

export const addComment = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string,
): Promise<PlaneComment> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ comment_html: commentHtml }),
    },
  );
  return PlaneCommentSchema.parse(data);
};

export const listComments = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
): Promise<PlaneComment[]> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/comments/`,
    config,
  );
  return PlanePaginatedSchema(PlaneCommentSchema).parse(data).results;
};

// --- Links ---

export const addLink = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  title: string,
  url: string,
): Promise<PlaneLink> => {
  const data = await planeRequest(
    `${workspaceUrl(config)}/projects/${projectId}/issues/${issueId}/links/`,
    config,
    {
      method: "POST",
      body: JSON.stringify({ title, url }),
    },
  );
  return PlaneLinkSchema.parse(data);
};
