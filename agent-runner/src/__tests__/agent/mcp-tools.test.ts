import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePlaneConfig } from "../fixtures/config.js";
import { makeIssue, makeComment } from "../fixtures/plane.js";

vi.mock("../../plane/client.js", () => ({
  updateIssue: vi.fn(),
  addComment: vi.fn(),
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

import { updateIssue, addComment } from "../../plane/client.js";
import { createAgentMcpServer } from "../../agent/mcp-tools.js";

const mockedUpdateIssue = vi.mocked(updateIssue);
const mockedAddComment = vi.mocked(addComment);

beforeEach(() => {
  vi.resetAllMocks();
  toolHandlers.clear();
});

const makeContext = (overrides?: Record<string, unknown>) => ({
  planeConfig: makePlaneConfig(),
  projectId: "proj-1",
  issueId: "issue-1",
  taskDisplayId: "HQ-42",
  inReviewStateId: "review-state" as string | null,
  doneStateId: "done-state" as string | null,
  telegramBridge: {
    startAnswerServer: vi.fn(),
    askAndWait: vi.fn().mockResolvedValue("Human answer"),
    stop: vi.fn(),
  },
  ...overrides,
});

describe("update_task_status", () => {
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
    const ctx = makeContext({ inReviewStateId: null });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("update_task_status")!;
    const result = await handler({ state: "in_review" });

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

describe("ask_human", () => {
  it("calls bridge.askAndWait and returns answer", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("ask_human")!;
    const result = await handler({ question: "What DB?" });

    expect(ctx.telegramBridge.askAndWait).toHaveBeenCalledWith(
      "HQ-42",
      "What DB?",
    );
    expect(result.content[0].text).toContain("Human answered: Human answer");
  });
});
