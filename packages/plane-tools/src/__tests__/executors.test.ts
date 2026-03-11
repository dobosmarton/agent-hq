import { beforeEach, describe, expect, it, vi } from "vitest";
import type { PlaneClient } from "@agent-hq/plane-client";
import { addLabelsToTaskExecutor, removeLabelsFromTaskExecutor } from "../executors";
import { makeIssue, makeLabel } from "./fixtures";

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

beforeEach(() => {
  vi.resetAllMocks();
});

describe("addLabelsToTaskExecutor", () => {
  it("adds a single label to the task", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    expect(result.success).toBe(true);
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: ["label-1"] });
  });

  it("adds multiple labels to the task", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["agent", "bug"]);

    expect(result.success).toBe(true);
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1", "label-2"],
    });
  });

  it("performs case-insensitive label matching", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["AGENT"]);

    expect(result.success).toBe(true);
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: ["label-1"] });
  });

  it("merges with existing labels without duplicating", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["bug"]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.mergedLabelIds).toEqual(["label-1", "label-2"]);
    }
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", {
      labels: ["label-1", "label-2"],
    });
  });

  it("deduplicates when adding an existing label", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.mergedLabelIds).toEqual(["label-1"]);
    }
  });

  it("returns failure when label not found", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: [] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["nonexistent"]);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.notFound).toContain("nonexistent");
      expect(result.availableLabelNames).toContain("agent");
    }
    expect(plane.updateIssue).not.toHaveBeenCalled();
  });

  it("handles empty label names array", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", []);

    expect(result.success).toBe(true);
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: ["label-1"] });
  });

  it("handles issue with undefined labels", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: undefined }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    expect(result.success).toBe(true);
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: ["label-1"] });
  });

  it("fetches issue and labels in parallel", async () => {
    const plane = makeMockPlane();
    const callOrder: string[] = [];
    vi.mocked(plane.getIssue).mockImplementation(async () => {
      callOrder.push("getIssue");
      return makeIssue({ labels: [] });
    });
    vi.mocked(plane.listLabels).mockImplementation(async () => {
      callOrder.push("listLabels");
      return [makeLabel({ id: "label-1", name: "agent" })];
    });
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    await addLabelsToTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    // Both should have been called
    expect(plane.getIssue).toHaveBeenCalledOnce();
    expect(plane.listLabels).toHaveBeenCalledOnce();
  });
});

describe("removeLabelsFromTaskExecutor", () => {
  it("removes a single label from the task", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1", "label-2"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    expect(result.updatedLabelIds).toEqual(["label-2"]);
    expect(result.removedLabelNames).toContain("agent");
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: ["label-2"] });
  });

  it("removes multiple labels from the task", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(
      makeIssue({ labels: ["label-1", "label-2", "label-3"] })
    );
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
      makeLabel({ id: "label-3", name: "feature" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["agent", "bug"]);

    expect(result.updatedLabelIds).toEqual(["label-3"]);
    expect(result.removedLabelNames).toEqual(expect.arrayContaining(["agent", "bug"]));
  });

  it("performs case-insensitive label matching", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["AGENT"]);

    expect(result.updatedLabelIds).toEqual([]);
    expect(result.removedLabelNames).toContain("AGENT");
  });

  it("handles non-existent labels gracefully (idempotent)", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["nonexistent"]);

    expect(result.updatedLabelIds).toEqual(["label-1"]);
    expect(result.removedLabelNames).toEqual([]);
  });

  it("handles empty label names array", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", []);

    expect(result.updatedLabelIds).toEqual(["label-1"]);
    expect(result.removedLabelNames).toEqual([]);
  });

  it("handles issue with undefined labels", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: undefined }));
    vi.mocked(plane.listLabels).mockResolvedValue([makeLabel({ id: "label-1", name: "agent" })]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["agent"]);

    expect(result.updatedLabelIds).toEqual([]);
    expect(result.removedLabelNames).toEqual([]);
  });

  it("removes all labels when all are specified", async () => {
    const plane = makeMockPlane();
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1", "label-2"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["agent", "bug"]);

    expect(result.updatedLabelIds).toEqual([]);
    expect(result.removedLabelNames).toEqual(expect.arrayContaining(["agent", "bug"]));
    expect(plane.updateIssue).toHaveBeenCalledWith("proj-1", "issue-1", { labels: [] });
  });

  it("only marks label as removed when it was on the issue", async () => {
    const plane = makeMockPlane();
    // label-1 is on the issue, label-2 exists but not on the issue
    vi.mocked(plane.getIssue).mockResolvedValue(makeIssue({ labels: ["label-1"] }));
    vi.mocked(plane.listLabels).mockResolvedValue([
      makeLabel({ id: "label-1", name: "agent" }),
      makeLabel({ id: "label-2", name: "bug" }),
    ]);
    vi.mocked(plane.updateIssue).mockResolvedValue(makeIssue());

    const result = await removeLabelsFromTaskExecutor(plane, "proj-1", "issue-1", ["agent", "bug"]);

    expect(result.removedLabelNames).toContain("agent");
    expect(result.removedLabelNames).not.toContain("bug");
  });
});
