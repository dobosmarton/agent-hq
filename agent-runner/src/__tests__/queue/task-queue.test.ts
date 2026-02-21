import { beforeEach, describe, expect, it, vi } from "vitest";
import { createTaskQueue } from "../../queue/task-queue";
import type { AgentTask } from "../../types";

const makeTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  issueId: "issue-1",
  projectId: "proj-1",
  projectIdentifier: "HQ",
  sequenceId: 42,
  title: "Test task",
  descriptionHtml: "<p>Test</p>",
  stateId: "state-1",
  labelIds: ["label-1"],
  ...overrides,
});

describe("createTaskQueue", () => {
  const RETRY_BASE_DELAY = 60000;
  let queue: ReturnType<typeof createTaskQueue>;

  beforeEach(() => {
    queue = createTaskQueue(RETRY_BASE_DELAY);
  });

  describe("enqueue", () => {
    it("adds a task to the queue", () => {
      const result = queue.enqueue(makeTask());
      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it("returns false for duplicate issue", () => {
      queue.enqueue(makeTask());
      const result = queue.enqueue(makeTask());
      expect(result).toBe(false);
      expect(queue.size()).toBe(1);
    });

    it("allows different issues", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      expect(queue.size()).toBe(2);
    });
  });

  describe("dequeue", () => {
    it("returns the first ready task", () => {
      queue.enqueue(makeTask());
      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.task.issueId).toBe("issue-1");
      expect(entry!.retryCount).toBe(0);
    });

    it("returns null when queue is empty", () => {
      expect(queue.dequeue()).toBeNull();
    });

    it("removes task from queue after dequeue", () => {
      queue.enqueue(makeTask());
      queue.dequeue();
      expect(queue.size()).toBe(0);
    });

    it("skips tasks not yet ready", () => {
      queue.requeue(makeTask(), 1);
      // Task has future nextAttemptAt, should not be dequeued now
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe("requeue", () => {
    it("adds task with exponential backoff delay", () => {
      vi.useFakeTimers();
      const now = Date.now();

      queue.requeue(makeTask(), 1);
      expect(queue.size()).toBe(1);

      // Not ready yet
      expect(queue.dequeue()).toBeNull();

      // Advance past base delay (60s for retry 1)
      vi.advanceTimersByTime(RETRY_BASE_DELAY + 100);
      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.retryCount).toBe(1);

      vi.useRealTimers();
    });

    it("doubles delay for each retry", () => {
      vi.useFakeTimers();

      queue.requeue(makeTask(), 2);

      // Should wait 2x base delay for retry 2
      vi.advanceTimersByTime(RETRY_BASE_DELAY);
      expect(queue.dequeue()).toBeNull();

      vi.advanceTimersByTime(RETRY_BASE_DELAY + 100);
      expect(queue.dequeue()).not.toBeNull();

      vi.useRealTimers();
    });

    it("overwrites existing entry for same issue", () => {
      queue.enqueue(makeTask());
      queue.requeue(makeTask(), 1);
      expect(queue.size()).toBe(1);
      // The entry should now have retryCount 1
      const entries = queue.entries();
      expect(entries[0]!.retryCount).toBe(1);
    });
  });

  describe("remove", () => {
    it("removes a queued task", () => {
      queue.enqueue(makeTask());
      const result = queue.remove("issue-1");
      expect(result).toBe(true);
      expect(queue.size()).toBe(0);
    });

    it("returns false for non-existent task", () => {
      expect(queue.remove("unknown")).toBe(false);
    });
  });

  describe("has", () => {
    it("returns true for queued task", () => {
      queue.enqueue(makeTask());
      expect(queue.has("issue-1")).toBe(true);
    });

    it("returns false for non-existent task", () => {
      expect(queue.has("unknown")).toBe(false);
    });

    it("returns false after removal", () => {
      queue.enqueue(makeTask());
      queue.remove("issue-1");
      expect(queue.has("issue-1")).toBe(false);
    });
  });

  describe("entries", () => {
    it("returns all queued entries", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      const entries = queue.entries();
      expect(entries).toHaveLength(2);
    });

    it("returns empty array for empty queue", () => {
      expect(queue.entries()).toHaveLength(0);
    });
  });

  describe("toJSON / hydrate", () => {
    it("toJSON returns serializable queue entries", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      const json = queue.toJSON();
      expect(json).toHaveLength(2);
      expect(json[0]!.task.issueId).toBe("a");
      expect(json[1]!.task.issueId).toBe("b");
    });

    it("hydrate restores queue from saved entries", () => {
      const saved = [
        {
          task: makeTask({ issueId: "x" }),
          retryCount: 1,
          nextAttemptAt: Date.now() + 60000,
          enqueuedAt: Date.now(),
        },
        {
          task: makeTask({ issueId: "y" }),
          retryCount: 0,
          nextAttemptAt: Date.now(),
          enqueuedAt: Date.now(),
        },
      ];

      queue.hydrate(saved);
      expect(queue.size()).toBe(2);
      expect(queue.has("x")).toBe(true);
      expect(queue.has("y")).toBe(true);
    });

    it("hydrate preserves retry state", () => {
      vi.useFakeTimers();
      const saved = [
        {
          task: makeTask(),
          retryCount: 2,
          nextAttemptAt: Date.now() + 30000,
          enqueuedAt: Date.now(),
        },
      ];

      queue.hydrate(saved);

      // Not ready yet
      expect(queue.dequeue()).toBeNull();

      // Advance past delay
      vi.advanceTimersByTime(31000);
      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.retryCount).toBe(2);

      vi.useRealTimers();
    });

    it("roundtrips through toJSON and hydrate", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.requeue(makeTask({ issueId: "b" }), 1);

      const json = queue.toJSON();
      const newQueue = createTaskQueue(RETRY_BASE_DELAY);
      newQueue.hydrate(json);

      expect(newQueue.size()).toBe(2);
      expect(newQueue.has("a")).toBe(true);
      expect(newQueue.has("b")).toBe(true);
    });
  });
});
