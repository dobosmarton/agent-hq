import type { PlaneProject, PlaneState, PlaneIssue, PlaneConfig } from "../../types.js";

export const makeProject = (overrides?: Partial<PlaneProject>): PlaneProject => ({
  id: "proj-uuid-1",
  name: "Agent HQ",
  identifier: "HQ",
  ...overrides,
});

export const makeState = (overrides?: Partial<PlaneState>): PlaneState => ({
  id: "state-uuid-1",
  name: "Todo",
  group: "unstarted",
  ...overrides,
});

export const makeIssue = (overrides?: Partial<PlaneIssue>): PlaneIssue => ({
  id: "issue-uuid-1",
  name: "Fix the bug",
  priority: "high",
  state: "state-uuid-1",
  sequence_id: 42,
  ...overrides,
});

export const makePlaneConfig = (overrides?: Partial<PlaneConfig>): PlaneConfig => ({
  apiKey: "test-api-key",
  baseUrl: "http://localhost/api/v1",
  workspaceSlug: "test-ws",
  ...overrides,
});

export const paginate = <T>(results: T[]) => ({
  total_count: results.length,
  results,
});
