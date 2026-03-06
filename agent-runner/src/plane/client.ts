import { createPlaneClient } from "@agent-hq/plane-client";
import type {
  PlaneComment,
  PlaneConfig,
  PlaneIssue,
  PlaneLabel,
  PlaneLink,
  PlaneProject,
  PlaneState,
} from "@agent-hq/plane-client";

// Standalone function wrappers that delegate to the shared client.
// These preserve the existing call-site API (config as first arg) while
// using @agent-hq/plane-client as the single implementation.

// --- Projects ---

export const listProjects = async (config: PlaneConfig): Promise<PlaneProject[]> =>
  createPlaneClient(config).listProjects();

export const findProjectByIdentifier = async (
  config: PlaneConfig,
  identifier: string
): Promise<PlaneProject | null> => createPlaneClient(config).findProjectByIdentifier(identifier);

// --- States ---

export const listStates = async (config: PlaneConfig, projectId: string): Promise<PlaneState[]> =>
  createPlaneClient(config).listStates(projectId);

export const buildStateMap = async (
  config: PlaneConfig,
  projectId: string
): Promise<Map<string, PlaneState>> => createPlaneClient(config).buildStateMap(projectId);

export const findStateByGroupAndName = async (
  config: PlaneConfig,
  projectId: string,
  group: string,
  name?: string
): Promise<PlaneState | null> =>
  createPlaneClient(config).findStateByGroupAndName(projectId, group, name);

// --- Labels ---

export const listLabels = async (config: PlaneConfig, projectId: string): Promise<PlaneLabel[]> =>
  createPlaneClient(config).listLabels(projectId);

export const findLabelByName = async (
  config: PlaneConfig,
  projectId: string,
  name: string
): Promise<PlaneLabel | null> => createPlaneClient(config).findLabelByName(projectId, name);

// --- Issues ---

export const listIssues = async (
  config: PlaneConfig,
  projectId: string,
  params?: Record<string, string>
): Promise<PlaneIssue[]> => createPlaneClient(config).listIssues(projectId, params);

export const getIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneIssue> => createPlaneClient(config).getIssue(projectId, issueId);

export const updateIssue = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  update: Record<string, unknown>
): Promise<PlaneIssue> => createPlaneClient(config).updateIssue(projectId, issueId, update);

// --- Comments ---

export const addComment = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  commentHtml: string
): Promise<PlaneComment> => createPlaneClient(config).addComment(projectId, issueId, commentHtml);

export const listComments = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string
): Promise<PlaneComment[]> => createPlaneClient(config).listComments(projectId, issueId);

// --- Links ---

export const addLink = async (
  config: PlaneConfig,
  projectId: string,
  issueId: string,
  title: string,
  url: string
): Promise<PlaneLink> => createPlaneClient(config).addLink(projectId, issueId, title, url);
