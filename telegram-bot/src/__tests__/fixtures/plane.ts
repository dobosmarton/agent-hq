import type { PlaneComment, PlaneConfig, PlaneIssue, PlaneProject, PlaneState } from "../../types";

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
  description_html: "<p>Task description</p>",
  description: "Task description",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  project: "proj-uuid-1",
  ...overrides,
});

export const makeComment = (overrides?: Partial<PlaneComment>): PlaneComment => ({
  id: "comment-uuid-1",
  comment_html: "<p>This is a comment</p>",
  created_at: "2024-01-01T00:00:00Z",
  updated_at: "2024-01-01T00:00:00Z",
  created_by: "user-uuid-1",
  actor_detail: {
    first_name: "John",
    last_name: "Doe",
    display_name: "John Doe",
  },
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
