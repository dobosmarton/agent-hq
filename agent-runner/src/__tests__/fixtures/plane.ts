import type {
  PlaneProject,
  PlaneIssue,
  PlaneState,
  PlaneLabel,
  PlaneComment,
} from "../../plane/types.js";

export const makeProject = (
  overrides?: Partial<PlaneProject>,
): PlaneProject => ({
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
  description_html: "<p>Fix it</p>",
  label_ids: ["label-uuid-1"],
  ...overrides,
});

export const makeLabel = (overrides?: Partial<PlaneLabel>): PlaneLabel => ({
  id: "label-uuid-1",
  name: "agent",
  ...overrides,
});

export const makeComment = (
  overrides?: Partial<PlaneComment>,
): PlaneComment => ({
  id: "comment-uuid-1",
  comment_html: "<p>Progress update</p>",
  created_at: "2026-02-19T10:00:00Z",
  ...overrides,
});

export const paginate = <T>(results: T[]) => ({
  total_count: results.length,
  results,
});
