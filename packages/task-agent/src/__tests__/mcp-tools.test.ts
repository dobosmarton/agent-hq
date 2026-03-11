import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeComment, makeIssue, makeLabel, paginate } from "./fixtures/plane";
import type { PlaneClient } from "@agent-hq/plane-client";

// mockExecAsync is injected into createAgentMcpServer via the deps parameter.
// This avoids fragile module-level mocking of node:util/node:child_process.
const mockExecAsync =
  vi.fn<
    (
      cmd: string,
      opts: { cwd?: string; timeout?: number }
    ) => Promise<{ stdout: string; stderr: string }>
  >();

// Mock the SDK so we can capture the tool handlers
const toolHandlers = new Map<string, (...args: any[]) => any>();

vi.mock("@anthropic-ai/claude-agent-sdk", () => ({
  createSdkMcpServer: vi.fn((config: any) => config),
  tool: vi.fn((name: string, _desc: string, _schema: any, handler: any) => {
    toolHandlers.set(name, handler);
    return { name, handler };
  }),
}));

import { createAgentMcpServer } from "../mcp-tools";

// Use vi.resetAllMocks() globally: clears both call history and implementations,
// preventing any mock state from leaking between tests.
beforeEach(() => {
  vi.resetAllMocks();
  toolHandlers.clear();
});

const makeMockPlane = (): PlaneClient => ({
  listProjects: vi.fn(),
  findProjectByIdentifier: vi.fn(),
  createProject: vi.fn(),
  listStates: vi.fn(),
  buildStateMap: vi.fn(),
  findStateByGroupAndName: vi.fn(),
  listLabels: vi.fn(),
  findLabelByName: vi.fn(),
  createLabel: vi.fn(),
  listIssues: vi.fn(),
  getIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  findIssueBySequenceId: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn(),
  addLink: vi.fn(),
  parseIssueIdentifier: vi.fn() as any,
  cloneProjectConfiguration: vi.fn(),
});

const makeContext = (overrides?: Record<string, unknown>) => {
  const plane = makeMockPlane();
  return {
    plane,
    projectId: "proj-1",
    issueId: "issue-1",
    taskDisplayId: "HQ-42",
    planReviewStateId: "plan-review-state" as string | null,
    inReviewStateId: "review-state" as string | null,
    doneStateId: "done-state" as string | null,
    skills: [] as import("@agent-hq/skills").Skill[],
    projectRepoPath: "/tmp/test-repo",
    agentRunnerRoot: "/tmp/test-agent-runner",
    ciCommands: [] as string[],
    ...overrides,
  };
};

describe("update_task_status", () => {
  it("maps 'plan_review' to planReviewStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status");
    expect(handler).toBeDefined();
    const result = await handler!({ state: "plan_review" });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      state: "plan-review-state",
    });
    expect(result.content[0].text).toContain("moved to plan_review");
  });

  it("maps 'in_review' to inReviewStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status");
    expect(handler).toBeDefined();
    const result = await handler!({ state: "in_review" });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      state: "review-state",
    });
    expect(result.content[0].text).toContain("moved to in_review");
  });

  it("maps 'done' to doneStateId", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("update_task_status");
    expect(handler).toBeDefined();
    await handler!({ state: "done" });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      state: "done-state",
    });
  });

  it("returns error when stateId is null", async () => {
    const ctx = makeContext({ planReviewStateId: null });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("update_task_status");
    expect(handler).toBeDefined();
    const result = await handler!({ state: "plan_review" });

    expect(result.content[0].text).toContain("not available");
    expect(ctx.plane.updateIssue).not.toHaveBeenCalled();
  });
});

describe("add_task_comment", () => {
  it("calls addComment with correct params", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.addComment).mockResolvedValue(makeComment());

    const handler = toolHandlers.get("add_task_comment");
    expect(handler).toBeDefined();
    const result = await handler!({ comment_html: "<p>Progress</p>" });

    expect(ctx.plane.addComment).toHaveBeenCalledWith("proj-1", "issue-1", "<p>Progress</p>");
    expect(result.content[0].text).toContain("Comment added");
  });
});

describe("add_task_link", () => {
  it("calls addLink with correct params", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.addLink).mockResolvedValue({
      id: "link-1",
      title: "Pull Request",
      url: "https://github.com/test/repo/pull/1",
    });

    const handler = toolHandlers.get("add_task_link");
    expect(handler).toBeDefined();
    const result = await handler!({
      title: "Pull Request",
      url: "https://github.com/test/repo/pull/1",
    });

    expect(ctx.plane.addLink).toHaveBeenCalledWith(
      "proj-1",
      "issue-1",
      "Pull Request",
      "https://github.com/test/repo/pull/1"
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
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "1", name: "agent", color: "#FF6B6B" }),
      makeLabel({
        id: "2",
        name: "bug",
        color: "#FF0000",
        description: "Bug reports",
      }),
    ]);

    const handler = toolHandlers.get("list_labels");
    expect(handler).toBeDefined();
    const result = await handler!({});

    expect(ctx.plane.listLabels).toHaveBeenCalledWith("proj-1");
    expect(result.content[0].text).toContain("Available labels");
    expect(result.content[0].text).toContain("agent");
    expect(result.content[0].text).toContain("bug");
  });

  it("handles empty label list", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([]);

    const handler = toolHandlers.get("list_labels");
    expect(handler).toBeDefined();
    const result = await handler!({});

    expect(result.content[0].text).toContain("No labels found");
  });

  it("includes color and description in output", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({
        name: "feature",
        color: "#00FF00",
        description: "New features",
      }),
    ]);

    const handler = toolHandlers.get("list_labels");
    expect(handler).toBeDefined();
    const result = await handler!({});

    expect(result.content[0].text).toContain("#00FF00");
    expect(result.content[0].text).toContain("New features");
  });
});

describe("add_labels_to_task", () => {
  it("adds single label to task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    const result = await handler!({ label_names: ["agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
    expect(result.content[0].text).toContain("Added label(s) agent");
  });

  it("adds multiple labels to task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent", "bug"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1", "label-2"],
    });
  });

  it("performs case-insensitive matching", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["Agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
  });

  it("merges with existing labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["bug"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1", "label-2"],
    });
  });

  it("deduplicates labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
  });

  it("returns error when label not found", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    const result = await handler!({ label_names: ["nonexistent"] });

    expect(result.content[0].text).toContain("Label(s) not found");
    expect(result.content[0].text).toContain("nonexistent");
    expect(result.content[0].text).toContain("Available labels");
    expect(ctx.plane.updateIssue).not.toHaveBeenCalled();
  });

  it("handles empty label array gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: [] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
  });

  it("handles issue with undefined labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: undefined }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("add_labels_to_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
  });
});

describe("remove_labels_from_task", () => {
  it("removes single label from task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1", "label-2"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    const result = await handler!({ label_names: ["agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-2"],
    });
    expect(result.content[0].text).toContain("Removed label(s) agent");
  });

  it("removes multiple labels from task", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(
      makeIssue({ labels: ["label-1", "label-2", "label-3"] })
    );
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
      makeLabel({ id: "label-3", name: "feature" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent", "bug"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-3"],
    });
  });

  it("performs case-insensitive matching", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["Agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: [],
    });
  });

  it("handles non-existent labels gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    const result = await handler!({ label_names: ["nonexistent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
    expect(result.content[0].text).toContain("Removed label(s)");
  });

  it("handles empty label array gracefully", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: [] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1"],
    });
  });

  it("handles issue with undefined labels", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: undefined }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: [],
    });
  });

  it("removes all labels when all are specified", async () => {
    const ctx = makeContext();
    createAgentMcpServer(ctx);
    vi.mocked(ctx.plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1", "label-2"] }));
    vi.mocked(ctx.plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(ctx.plane.updateIssue).mockResolvedValue(makeIssue());

    const handler = toolHandlers.get("remove_labels_from_task");
    expect(handler).toBeDefined();
    await handler!({ label_names: ["agent", "bug"] });

    expect(ctx.plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: [],
    });
  });
});

describe("load_skill", () => {
  const makeSkill = (
    overrides?: Partial<import("@agent-hq/skills").Skill>
  ): import("@agent-hq/skills").Skill => ({
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    category: "best-practices",
    priority: 80,
    content: `---
name: Test Skill
description: A test skill
---

# Test Skill

This is the content.`,
    appliesTo: "both",
    enabled: true,
    filePath: "/path/to/test-skill.md",
    isProjectSkill: false,
    ...overrides,
  });

  it("returns full skill content with metadata stripped", async () => {
    const skill = makeSkill();
    const ctx = makeContext({ skills: [skill] });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("load_skill");
    expect(handler).toBeDefined();
    const result = await handler!({ skill_id: "test-skill" });

    expect(result.content[0].text).toContain("# Test Skill");
    expect(result.content[0].text).toContain("This is the content.");
    expect(result.content[0].text).not.toContain("name: Test Skill");
  });

  it("returns not found for unknown skill ID", async () => {
    const ctx = makeContext({ skills: [makeSkill()] });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("load_skill");
    expect(handler).toBeDefined();
    const result = await handler!({ skill_id: "unknown" });

    expect(result.content[0].text).toContain('Skill "unknown" not found');
    expect(result.content[0].text).toContain("test-skill");
  });

  it("returns not found with empty skills list", async () => {
    const ctx = makeContext({ skills: [] });
    createAgentMcpServer(ctx);

    const handler = toolHandlers.get("load_skill");
    expect(handler).toBeDefined();
    const result = await handler!({ skill_id: "test-skill" });

    expect(result.content[0].text).toContain("not found");
  });
});

describe("validate_quality_gate", () => {
  // Helper that creates the server with mockExecAsync injected via deps
  const makeQualityGateServer = (ctxOverrides?: Record<string, unknown>) => {
    const ctx = makeContext(ctxOverrides);
    createAgentMcpServer(ctx, { execAsync: mockExecAsync });
    const handler = toolHandlers.get("validate_quality_gate");
    expect(handler).toBeDefined();
    return { ctx, handler: handler! };
  };

  it("returns message when no CI commands configured", async () => {
    const { handler } = makeQualityGateServer({ ciCommands: [] });
    const result = await handler({});

    expect(result.content[0].text).toContain("No CI commands configured");
    // mockExecAsync should never be called when there are no commands
    expect(mockExecAsync).not.toHaveBeenCalled();
  });

  it("reports PASSED when all commands succeed", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "All good", stderr: "" });

    const { handler } = makeQualityGateServer({ ciCommands: ["pnpm test", "pnpm build"] });
    const result = await handler({});

    expect(result.content[0].text).toContain("PASSED");
    expect(result.content[0].text).toContain("2/2 checks passed");
    expect(result.content[0].text).toContain("✓ pnpm test");
    expect(result.content[0].text).toContain("✓ pnpm build");
    // Verify mockExecAsync was actually called (sanity check for dependency injection)
    expect(mockExecAsync).toHaveBeenCalled();
    expect(mockExecAsync).toHaveBeenCalledWith(
      "pnpm test",
      expect.objectContaining({ cwd: "/tmp/test-repo", timeout: 120_000 })
    );
    expect(mockExecAsync).toHaveBeenCalledWith(
      "pnpm build",
      expect.objectContaining({ cwd: "/tmp/test-repo", timeout: 120_000 })
    );
  });

  it("reports FAILED when a command fails", async () => {
    mockExecAsync
      .mockResolvedValueOnce({ stdout: "OK", stderr: "" })
      .mockRejectedValueOnce(
        Object.assign(new Error("Command failed"), { stdout: "", stderr: "Type error", code: 1 })
      );

    const { handler } = makeQualityGateServer({ ciCommands: ["pnpm build", "pnpm test"] });
    const result = await handler({});

    expect(result.content[0].text).toContain("FAILED");
    expect(result.content[0].text).toContain("1/2 checks passed");
    expect(result.content[0].text).toContain("✓ pnpm build");
    expect(result.content[0].text).toContain("✗ pnpm test");
    // Verify stderr error output is surfaced in the report
    expect(result.content[0].text).toContain("Type error");
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      1,
      "pnpm build",
      expect.objectContaining({ cwd: "/tmp/test-repo" })
    );
    expect(mockExecAsync).toHaveBeenNthCalledWith(
      2,
      "pnpm test",
      expect.objectContaining({ cwd: "/tmp/test-repo" })
    );
  });

  it("truncates long command output to 500 characters", async () => {
    const longOutput = "x".repeat(600);
    mockExecAsync.mockResolvedValue({ stdout: longOutput, stderr: "" });

    const { handler } = makeQualityGateServer({ ciCommands: ["pnpm test"] });
    const result = await handler({});

    const report = result.content[0].text as string;
    // Extract the output portion (everything after the command marker line)
    const afterMarker = report.split("✓ pnpm test\n")[1] ?? "";
    // The output section should be exactly 500 chars (the truncated x's)
    expect(afterMarker.trim().length).toBe(500);
    // Cross-check: 500 x's are present but not 501 consecutive x's
    expect(report).toContain("x".repeat(500));
    expect(report).not.toContain("x".repeat(501));
  });

  it("handles timeout errors gracefully", async () => {
    mockExecAsync.mockRejectedValueOnce(
      Object.assign(new Error("Command timed out"), { code: "ETIMEDOUT", stdout: "", stderr: "" })
    );

    const { handler } = makeQualityGateServer({ ciCommands: ["pnpm test"] });
    const result = await handler({});

    expect(result.content[0].text).toContain("FAILED");
    expect(result.content[0].text).toContain("0/1 checks passed");
    expect(result.content[0].text).toContain("✗ pnpm test");
    // Verify the timeout error message is surfaced to the user
    expect(result.content[0].text).toContain("Command timed out");
  });

  it("handles missing projectRepoPath gracefully", async () => {
    mockExecAsync.mockResolvedValue({ stdout: "ok", stderr: "" });

    const { handler } = makeQualityGateServer({
      ciCommands: ["pnpm test"],
      projectRepoPath: "",
    });
    const result = await handler({});

    // Should still attempt to run the command (passing empty cwd to exec)
    // and return a result (pass or fail) rather than throwing
    expect(result.content[0].text).toBeDefined();
    expect(mockExecAsync).toHaveBeenCalledWith("pnpm test", expect.objectContaining({ cwd: "" }));
  });
});
