import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlaneConfig } from "../fixtures/config";
import { makeComment, makeIssue, makeLabel, paginate } from "../fixtures/plane";

vi.mock("../../plane/client", () => ({
  updateIssue: vi.fn(),
  addComment: vi.fn(),
  addLink: vi.fn(),
  listLabels: vi.fn(),
  getIssue: vi.fn(),
}));

// Mock the SDK so we can capture the tool handlers
const toolHandlers = new Map<string, (...args: any[]) => any>();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  createSdkMcpServer: vi.fn((config: any) => config),
  tool: vi.fn((name: string, _desc: string, _schema: any, handler: any) => {
    toolHandlers.set(name, handler);
    return { name, handler };
  }),
}));

import { createAgentMcpServer } from "../../agent/mcp-tools";
import {
  addComment,
  addLink,
  getIssue,
  listLabels,
  updateIssue,
} from "../../plane/client";

const mockedUpdateIssue = vi.mocked(updateIssue);
const mockedAddComment = vi.mocked(addComment);
const mockedAddLink = vi.mocked(addLink);
const mockedListLabels = vi.mocked(listLabels);
const mockedGetIssue = vi.mocked(getIssue);

beforeEach(() => {
  vi.resetAllMocks();
  toolHandlers.clear();
});

const makeContext = (overrides?: Record<string, unknown>) => ({
  planeConfig: makePlaneConfig(),
  projectId: "proj-1",
  issueId: "issue-1",
  taskDisplayId: "HQ-42",
  planReviewStateId: "plan-review-state" as string | null,
  inReviewStateId: "review-state" as string | null,
  doneStateId: "done-state" as string | null,
  ...overrides,
});

describe("update_task_status", () => {
  it("maps 'plan_review' to planReviewStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status")!;
    const result = await handler({ state: "plan_review" });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { state: "plan-review-state" },
    );
    expect(result.content[0].text).toContain("moved to plan_review");
  });

  it("maps 'in_review' to inReviewStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status")!;
    const result = await handler({ state: "in_review" });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { state: "review-state" },
    );
    expect(result.content[0].text).toContain("moved to in_review");
  });

  it("maps 'done' to doneStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status")!;
    await handler({ state: "done" });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { state: "done-state" },
    );
  });

  it("returns error when stateId is null", async () => {
    const ctx = makeContext({ planReviewStateId: null });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("update_task_status")!;
    const result = await handler({ state: "plan_review" });

    expect(result.content[0].text).toContain("not available");
    expect(mockedUpdateIssue).not.toHaveBeenCalled();
  });
});

describe("add_task_comment", () => {
  it("calls addComment with correct params", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedAddComment.mockResolvedValue(makeComment());

    const handler = toolHandlers.get("add_task_comment")!;
    const result = await handler({ comment_html: "<p>Progress</p>" });

    expect(mockedAddComment).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      "<p>Progress</p>",
    );
    expect(result.content[0].text).toContain("Comment added");
  });
});

describe("add_task_link", () => {
  it("calls addLink with correct params", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedAddLink.mockResolvedValue({
      id: "link-1",
      title: "Pull Request",
      url: "https://github.com/test/repo/pull/1",
    });

    const handler = toolHandlers.get("add_task_link")!;
    const result = await handler({
      title: "Pull Request",
      url: "https://github.com/test/repo/pull/1",
    });

    expect(mockedAddLink).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      "Pull Request",
      "https://github.com/test/repo/pull/1",
    );
    expect(result.content[0].text).toContain("Link");
  });
});

describe("tool registration", () => {
  it("does not register ask_human tool", () => {
    createAgentMcpServer(makeContext());
    expect(toolHandlers.has("ask_human")).toBe(false);
  });

  it("registers all expected tools", () => {
    createAgentMcpServer(makeContext());
    expect(toolHandlers.has("update_task_status")).toBe(true);
    expect(toolHandlers.has("add_task_comment")).toBe(true);
    expect(toolHandlers.has("add_task_link")).toBe(true);
    expect(toolHandlers.has("list_labels")).toBe(true);
    expect(toolHandlers.has("add_labels_to_task")).toBe(true);
    expect(toolHandlers.has("remove_labels_from_task")).toBe(true);
  });
});

describe("list_labels", () => {
  it("returns formatted list of labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "1", name: "agent", color: "#FF6B6B" }),
      makeLabel({
        id: "2",
        name: "bug",
        color: "#FF0000",
        description: "Bug reports",
      }),
    ]);

    const handler = toolHandlers.get("list_labels")!;
    const result = await handler({});

    expect(mockedListLabels).toHaveBeenCalledWith(ctx.planeConfig, "proj-1");
    expect(result.content[0].text).toContain("Available labels");
    expect(result.content[0].text).toContain("agent");
    expect(result.content[0].text).toContain("bug");
  });

  it("handles empty label list", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedListLabels.mockResolvedValue([]);

    const handler = toolHandlers.get("list_labels")!;
    const result = await handler({});

    expect(result.content[0].text).toContain("No labels found");
  });

  it("includes color and description in output", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedListLabels.mockResolvedValue([
      makeLabel({
        name: "feature",
        color: "#00FF00",
        description: "New features",
      }),
    ]);

    const handler = toolHandlers.get("list_labels")!;
    const result = await handler({});

    expect(result.content[0].text).toContain("#00FF00");
    expect(result.content[0].text).toContain("New features");
  });
});

describe("add_labels_to_task", () => {
  it("adds single label to task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: [] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    const result = await handler({ label_names: ["agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
    expect(result.content[0].text).toContain("Added label(s) agent");
  });

  it("adds multiple labels to task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: [] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: ["agent", "bug"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1", "label-2"] },
    );
  });

  it("performs case-insensitive matching", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: [] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: ["Agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
  });

  it("merges with existing labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: ["bug"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1", "label-2"] },
    );
  });

  it("deduplicates labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: ["agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
  });

  it("returns error when label not found", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: [] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);

    const handler = toolHandlers.get("add_labels_to_task")!;
    const result = await handler({ label_names: ["nonexistent"] });

    expect(result.content[0].text).toContain("Label(s) not found");
    expect(result.content[0].text).toContain("nonexistent");
    expect(result.content[0].text).toContain("Available labels");
    expect(mockedUpdateIssue).not.toHaveBeenCalled();
  });

  it("handles empty label array gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: [] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
  });

  it("handles issue with undefined labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: undefined }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task")!;
    await handler({ label_names: ["agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
  });
});

describe("remove_labels_from_task", () => {
  it("removes single label from task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(
      makeIssue({ labels: ["label-1", "label-2"] }),
    );
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    const result = await handler({ label_names: ["agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-2"] },
    );
    expect(result.content[0].text).toContain("Removed label(s) agent");
  });

  it("removes multiple labels from task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(
      makeIssue({ labels: ["label-1", "label-2", "label-3"] }),
    );
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
      makeLabel({ id: "label-3", name: "feature" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    await handler({ label_names: ["agent", "bug"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-3"] },
    );
  });

  it("performs case-insensitive matching", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    await handler({ label_names: ["Agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: [] },
    );
  });

  it("handles non-existent labels gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    const result = await handler({ label_names: ["nonexistent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
    expect(result.content[0].text).toContain("Removed label(s)");
  });

  it("handles empty label array gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    await handler({ label_names: [] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: ["label-1"] },
    );
  });

  it("handles issue with undefined labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(makeIssue({ labels: undefined }));
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    await handler({ label_names: ["agent"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: [] },
    );
  });

  it("removes all labels when all are specified", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    mockedGetIssue.mockResolvedValue(
      makeIssue({ labels: ["label-1", "label-2"] }),
    );
    mockedListLabels.mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task")!;
    await handler({ label_names: ["agent", "bug"] });

    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      ctx.planeConfig,
      "proj-1",
      "issue-1",
      { labels: [] },
    );
  });
});
