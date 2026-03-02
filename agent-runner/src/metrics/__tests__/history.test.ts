import { describe, it, expect, beforeEach } from "vitest";
import { createExecutionHistory } from "../history";
import type { TaskExecution } from "../collector";

describe("createExecutionHistory", () => {
  let history: ReturnType<typeof createExecutionHistory>;

  beforeEach(() => {
    history = createExecutionHistory();
  });

  const createExecution = (
    overrides: Partial<TaskExecution> = {},
  ): TaskExecution => ({
    issueId: "issue-1",
    projectIdentifier: "TEST",
    sequenceId: 1,
    title: "Test task",
    phase: "implementation",
    startedAt: Date.now() - 5000,
    completedAt: Date.now(),
    durationMs: 5000,
    costUsd: 0.5,
    success: true,
    retryCount: 0,
    ...overrides,
  });

  it("should start with empty history", () => {
    expect(history.getAll()).toHaveLength(0);
    expect(history.getRecent(10)).toHaveLength(0);
  });

  it("should add execution to history", () => {
    const execution = createExecution();
    history.add(execution);

    const all = history.getAll();
    expect(all).toHaveLength(1);
    expect(all[0]).toEqual(execution);
  });

  it("should return recent executions in reverse order", () => {
    const exec1 = createExecution({ issueId: "issue-1", completedAt: 1000 });
    const exec2 = createExecution({ issueId: "issue-2", completedAt: 2000 });
    const exec3 = createExecution({ issueId: "issue-3", completedAt: 3000 });

    history.add(exec1);
    history.add(exec2);
    history.add(exec3);

    const recent = history.getRecent(10);
    expect(recent).toHaveLength(3);
    expect(recent[0]!.issueId).toBe("issue-3");
    expect(recent[1]!.issueId).toBe("issue-2");
    expect(recent[2]!.issueId).toBe("issue-1");
  });

  it("should limit recent executions", () => {
    for (let i = 0; i < 10; i++) {
      history.add(createExecution({ issueId: `issue-${i}` }));
    }

    const recent = history.getRecent(5);
    expect(recent).toHaveLength(5);
  });

  it("should filter by time range", () => {
    const now = Date.now();
    history.add(createExecution({ completedAt: now - 10000 }));
    history.add(createExecution({ completedAt: now - 5000 }));
    history.add(createExecution({ completedAt: now }));

    const filtered = history.getByTimeRange(now - 7000, now);
    expect(filtered).toHaveLength(2);
  });

  it("should filter by project", () => {
    history.add(createExecution({ projectIdentifier: "PROJ1" }));
    history.add(createExecution({ projectIdentifier: "PROJ2" }));
    history.add(createExecution({ projectIdentifier: "PROJ1" }));

    const proj1 = history.getByProject("PROJ1");
    expect(proj1).toHaveLength(2);
    expect(proj1.every((e) => e.projectIdentifier === "PROJ1")).toBe(true);
  });

  it("should return only errors", () => {
    history.add(createExecution({ success: true }));
    history.add(createExecution({ success: false, errorType: "timeout" }));
    history.add(createExecution({ success: false, errorType: "crash" }));

    const errors = history.getErrors();
    expect(errors).toHaveLength(2);
    expect(errors.every((e) => !e.success)).toBe(true);
  });

  it("should maintain circular buffer", () => {
    // Add 1100 executions (max is 1000)
    for (let i = 0; i < 1100; i++) {
      history.add(createExecution({ issueId: `issue-${i}`, sequenceId: i }));
    }

    const all = history.getAll();
    expect(all).toHaveLength(1000);

    // First 100 should be dropped
    expect(all[0]!.sequenceId).toBe(100);
    expect(all[999]!.sequenceId).toBe(1099);
  });

  it("should serialize to JSON", () => {
    const exec1 = createExecution({ issueId: "issue-1" });
    const exec2 = createExecution({ issueId: "issue-2" });

    history.add(exec1);
    history.add(exec2);

    const json = history.toJSON();
    expect(json).toHaveLength(2);
    expect(json[0]).toEqual(exec1);
    expect(json[1]).toEqual(exec2);
  });

  it("should hydrate from saved data", () => {
    const savedData = [
      createExecution({ issueId: "issue-1" }),
      createExecution({ issueId: "issue-2" }),
    ];

    history.hydrate(savedData);

    const all = history.getAll();
    expect(all).toHaveLength(2);
    expect(all[0]!.issueId).toBe("issue-1");
    expect(all[1]!.issueId).toBe("issue-2");
  });

  it("should truncate when hydrating more than max size", () => {
    const savedData = Array.from({ length: 1100 }, (_, i) =>
      createExecution({ issueId: `issue-${i}`, sequenceId: i }),
    );

    history.hydrate(savedData);

    const all = history.getAll();
    expect(all).toHaveLength(1000);
    expect(all[0]!.sequenceId).toBe(100);
  });
});
