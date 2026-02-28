import { describe, it, expect, beforeEach } from "vitest";
import { createMetricsCollector, type TaskExecution } from "../collector";

describe("createMetricsCollector", () => {
  let collector: ReturnType<typeof createMetricsCollector>;

  beforeEach(() => {
    collector = createMetricsCollector();
  });

  it("should start with empty metrics", () => {
    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.successfulTasks).toBe(0);
    expect(metrics.failedTasks).toBe(0);
    expect(metrics.successRate).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
    expect(metrics.avgDurationMs).toBe(0);
    expect(metrics.uptime).toBeGreaterThanOrEqual(0);
  });

  it("should record successful execution", () => {
    const execution: TaskExecution = {
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
    };

    collector.recordExecution(execution);
    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(1);
    expect(metrics.successfulTasks).toBe(1);
    expect(metrics.failedTasks).toBe(0);
    expect(metrics.successRate).toBe(1);
    expect(metrics.totalCostUsd).toBe(0.5);
    expect(metrics.avgDurationMs).toBe(5000);
  });

  it("should record failed execution", () => {
    const execution: TaskExecution = {
      issueId: "issue-2",
      projectIdentifier: "TEST",
      sequenceId: 2,
      title: "Failed task",
      phase: "implementation",
      startedAt: Date.now() - 3000,
      completedAt: Date.now(),
      durationMs: 3000,
      costUsd: 0.2,
      success: false,
      errorType: "timeout",
      retryCount: 1,
    };

    collector.recordExecution(execution);
    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(1);
    expect(metrics.successfulTasks).toBe(0);
    expect(metrics.failedTasks).toBe(1);
    expect(metrics.successRate).toBe(0);
    expect(metrics.totalCostUsd).toBe(0.2);
    expect(metrics.avgDurationMs).toBe(3000);
  });

  it("should calculate success rate correctly", () => {
    const successful: TaskExecution = {
      issueId: "issue-1",
      projectIdentifier: "TEST",
      sequenceId: 1,
      title: "Success",
      phase: "implementation",
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
      durationMs: 5000,
      costUsd: 0.5,
      success: true,
      retryCount: 0,
    };

    const failed: TaskExecution = {
      ...successful,
      issueId: "issue-2",
      sequenceId: 2,
      title: "Failed",
      success: false,
      errorType: "error",
    };

    collector.recordExecution(successful);
    collector.recordExecution(successful);
    collector.recordExecution(failed);

    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(3);
    expect(metrics.successfulTasks).toBe(2);
    expect(metrics.failedTasks).toBe(1);
    expect(metrics.successRate).toBeCloseTo(2 / 3);
  });

  it("should accumulate costs and durations", () => {
    const task1: TaskExecution = {
      issueId: "issue-1",
      projectIdentifier: "TEST",
      sequenceId: 1,
      title: "Task 1",
      phase: "implementation",
      startedAt: Date.now() - 5000,
      completedAt: Date.now(),
      durationMs: 5000,
      costUsd: 0.5,
      success: true,
      retryCount: 0,
    };

    const task2: TaskExecution = {
      ...task1,
      issueId: "issue-2",
      sequenceId: 2,
      durationMs: 3000,
      costUsd: 0.3,
    };

    collector.recordExecution(task1);
    collector.recordExecution(task2);

    const metrics = collector.getMetrics();

    expect(metrics.totalCostUsd).toBe(0.8);
    expect(metrics.avgDurationMs).toBe(4000);
  });

  it("should reset metrics", () => {
    const execution: TaskExecution = {
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
    };

    collector.recordExecution(execution);
    collector.reset();

    const metrics = collector.getMetrics();

    expect(metrics.totalTasks).toBe(0);
    expect(metrics.successfulTasks).toBe(0);
    expect(metrics.failedTasks).toBe(0);
    expect(metrics.totalCostUsd).toBe(0);
    expect(metrics.avgDurationMs).toBe(0);
  });
});
