import { beforeEach, describe, expect, it, vi } from "vitest";
import { makePlaneConfig } from "../fixtures/config";
import { makeComment, makeIssue } from "../fixtures/plane";

vi.mock("../../plane/client", () => ({
  updateIssue: vi.fn(),
  addComment: vi.fn(),
  addLink: vi.fn(),
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
import { addComment, addLink, updateIssue } from "../../plane/client";

const mockedUpdateIssue = vi.mocked(updateIssue);
const mockedAddComment = vi.mocked(addComment);
const mockedAddLink = vi.mocked(addLink);

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
  });
});
