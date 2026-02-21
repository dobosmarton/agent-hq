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
    vi.useRealTimers();
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

    it("initializes entry with retryCount 0 and immediate readiness", () => {
      vi.useFakeTimers({ now: 1000000 });
      queue.enqueue(makeTask());

      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.retryCount).toBe(0);
      expect(entry!.nextAttemptAt).toBe(1000000);
      expect(entry!.enqueuedAt).toBe(1000000);
    });

    it("preserves all task fields", () => {
      const task = makeTask({
        issueId: "custom-id",
        projectId: "custom-proj",
        projectIdentifier: "PROJ",
        sequenceId: 99,
        title: "Custom title",
        descriptionHtml: "<p>Custom</p>",
        stateId: "custom-state",
        labelIds: ["l1", "l2"],
      });
      queue.enqueue(task);

      const entry = queue.dequeue();
      expect(entry!.task).toEqual(task);
    });

    it("allows re-enqueue after remove", () => {
      queue.enqueue(makeTask());
      queue.remove("issue-1");
      const result = queue.enqueue(makeTask());
      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
    });

    it("allows re-enqueue after dequeue", () => {
      queue.enqueue(makeTask());
      queue.dequeue();
      const result = queue.enqueue(makeTask());
      expect(result).toBe(true);
      expect(queue.size()).toBe(1);
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
      expect(queue.has("issue-1")).toBe(false);
    });

    it("skips tasks not yet ready", () => {
      queue.requeue(makeTask(), 1);
      expect(queue.dequeue()).toBeNull();
      // Task should still be in queue
      expect(queue.size()).toBe(1);
    });

    it("maintains FIFO order for ready tasks", () => {
      queue.enqueue(makeTask({ issueId: "first" }));
      queue.enqueue(makeTask({ issueId: "second" }));
      queue.enqueue(makeTask({ issueId: "third" }));

      expect(queue.dequeue()!.task.issueId).toBe("first");
      expect(queue.dequeue()!.task.issueId).toBe("second");
      expect(queue.dequeue()!.task.issueId).toBe("third");
      expect(queue.dequeue()).toBeNull();
    });

    it("drains all ready tasks one by one", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      queue.enqueue(makeTask({ issueId: "c" }));

      const results: string[] = [];
      let entry = queue.dequeue();
      while (entry) {
        results.push(entry.task.issueId);
        entry = queue.dequeue();
      }

      expect(results).toEqual(["a", "b", "c"]);
      expect(queue.size()).toBe(0);
    });

    it("returns ready tasks while skipping delayed ones", () => {
      vi.useFakeTimers();

      queue.enqueue(makeTask({ issueId: "ready-1" }));
      queue.requeue(makeTask({ issueId: "delayed" }), 1); // 60s delay
      queue.enqueue(makeTask({ issueId: "ready-2" }));

      // Should get ready-1 first (FIFO among ready)
      const first = queue.dequeue();
      expect(first!.task.issueId).toBe("ready-1");

      // delayed is not ready, so next should be ready-2
      const second = queue.dequeue();
      expect(second!.task.issueId).toBe("ready-2");

      // Only delayed remains
      expect(queue.size()).toBe(1);
      expect(queue.dequeue()).toBeNull();
    });

    it("returns previously delayed task once time passes", () => {
      vi.useFakeTimers();

      queue.requeue(makeTask(), 1); // 60s delay
      expect(queue.dequeue()).toBeNull();

      vi.advanceTimersByTime(RETRY_BASE_DELAY + 1);
      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.task.issueId).toBe("issue-1");
    });

    it("returns null after queue is fully drained", () => {
      queue.enqueue(makeTask());
      queue.dequeue();
      expect(queue.dequeue()).toBeNull();
      expect(queue.dequeue()).toBeNull();
    });
  });

  describe("requeue", () => {
    it("adds task with exponential backoff delay", () => {
      vi.useFakeTimers();

      queue.requeue(makeTask(), 1);
      expect(queue.size()).toBe(1);

      // Not ready yet
      expect(queue.dequeue()).toBeNull();

      // Advance past base delay (60s for retry 1)
      vi.advanceTimersByTime(RETRY_BASE_DELAY + 100);
      const entry = queue.dequeue();
      expect(entry).not.toBeNull();
      expect(entry!.retryCount).toBe(1);
    });

    it("doubles delay for each retry", () => {
      vi.useFakeTimers();

      queue.requeue(makeTask(), 2);

      // Should wait 2x base delay for retry 2
      vi.advanceTimersByTime(RETRY_BASE_DELAY);
      expect(queue.dequeue()).toBeNull();

      vi.advanceTimersByTime(RETRY_BASE_DELAY + 100);
      expect(queue.dequeue()).not.toBeNull();
    });

    it("calculates correct delays for retry levels 1 through 4", () => {
      vi.useFakeTimers();

      // retry 1: base * 2^0 = 60s
      // retry 2: base * 2^1 = 120s
      // retry 3: base * 2^2 = 240s
      // retry 4: base * 2^3 = 480s

      const expectedDelays = [60000, 120000, 240000, 480000];

      for (let retry = 1; retry <= 4; retry++) {
        const q = createTaskQueue(RETRY_BASE_DELAY);
        const start = Date.now();
        q.requeue(makeTask(), retry);

        // Not ready just before the delay
        vi.advanceTimersByTime(expectedDelays[retry - 1]! - 1);
        expect(q.dequeue()).toBeNull();

        // Ready right at the delay
        vi.advanceTimersByTime(1);
        const entry = q.dequeue();
        expect(entry).not.toBeNull();
        expect(entry!.retryCount).toBe(retry);
      }
    });

    it("overwrites existing entry for same issue", () => {
      queue.enqueue(makeTask());
      queue.requeue(makeTask(), 1);
      expect(queue.size()).toBe(1);
      const entries = queue.entries();
      expect(entries[0]!.retryCount).toBe(1);
    });

    it("can requeue a task that was previously dequeued", () => {
      vi.useFakeTimers();

      queue.enqueue(makeTask());
      const first = queue.dequeue();
      expect(first).not.toBeNull();
      expect(queue.size()).toBe(0);

      queue.requeue(makeTask(), 1);
      expect(queue.size()).toBe(1);
      expect(queue.has("issue-1")).toBe(true);

      vi.advanceTimersByTime(RETRY_BASE_DELAY + 1);
      const second = queue.dequeue();
      expect(second).not.toBeNull();
      expect(second!.retryCount).toBe(1);
    });

    it("sets enqueuedAt to current time", () => {
      vi.useFakeTimers({ now: 5000000 });
      queue.requeue(makeTask(), 1);
      const entries = queue.entries();
      expect(entries[0]!.enqueuedAt).toBe(5000000);
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

    it("removes a requeued task with pending delay", () => {
      queue.requeue(makeTask(), 2);
      const result = queue.remove("issue-1");
      expect(result).toBe(true);
      expect(queue.size()).toBe(0);
      expect(queue.has("issue-1")).toBe(false);
    });

    it("only removes the specified task", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      queue.enqueue(makeTask({ issueId: "c" }));

      queue.remove("b");

      expect(queue.size()).toBe(2);
      expect(queue.has("a")).toBe(true);
      expect(queue.has("b")).toBe(false);
      expect(queue.has("c")).toBe(true);
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

    it("returns false after dequeue", () => {
      queue.enqueue(makeTask());
      queue.dequeue();
      expect(queue.has("issue-1")).toBe(false);
    });

    it("returns true for requeued task with pending delay", () => {
      queue.requeue(makeTask(), 2);
      expect(queue.has("issue-1")).toBe(true);
    });
  });

  describe("size", () => {
    it("starts at 0", () => {
      expect(queue.size()).toBe(0);
    });

    it("tracks enqueue and dequeue", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      expect(queue.size()).toBe(1);
      queue.enqueue(makeTask({ issueId: "b" }));
      expect(queue.size()).toBe(2);
      queue.dequeue();
      expect(queue.size()).toBe(1);
      queue.dequeue();
      expect(queue.size()).toBe(0);
    });

    it("tracks remove", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      queue.remove("a");
      expect(queue.size()).toBe(1);
    });

    it("does not change on failed enqueue", () => {
      queue.enqueue(makeTask());
      queue.enqueue(makeTask()); // duplicate
      expect(queue.size()).toBe(1);
    });

    it("does not change on failed remove", () => {
      queue.enqueue(makeTask());
      queue.remove("nonexistent");
      expect(queue.size()).toBe(1);
    });

    it("counts delayed (not-ready) tasks", () => {
      queue.requeue(makeTask(), 3);
      expect(queue.size()).toBe(1);
    });

    it("stays consistent through mixed operations", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));
      queue.requeue(makeTask({ issueId: "c" }), 1);
      expect(queue.size()).toBe(3);

      queue.dequeue(); // removes "a"
      expect(queue.size()).toBe(2);

      queue.remove("c");
      expect(queue.size()).toBe(1);

      queue.enqueue(makeTask({ issueId: "d" }));
      expect(queue.size()).toBe(2);
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

    it("includes delayed tasks", () => {
      queue.enqueue(makeTask({ issueId: "ready" }));
      queue.requeue(makeTask({ issueId: "delayed" }), 2);

      const entries = queue.entries();
      expect(entries).toHaveLength(2);
      const ids = entries.map((e) => e.task.issueId);
      expect(ids).toContain("ready");
      expect(ids).toContain("delayed");
    });

    it("returns independent copy — mutations do not affect queue", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      queue.enqueue(makeTask({ issueId: "b" }));

      const entries = queue.entries();
      entries.pop();
      entries.push({
        task: makeTask({ issueId: "fake" }),
        retryCount: 99,
        nextAttemptAt: 0,
        enqueuedAt: 0,
      });

      // Queue should be unaffected
      expect(queue.size()).toBe(2);
      expect(queue.has("a")).toBe(true);
      expect(queue.has("b")).toBe(true);
      expect(queue.has("fake")).toBe(false);
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

    it("toJSON returns independent copy — mutations do not affect queue", () => {
      queue.enqueue(makeTask({ issueId: "a" }));
      const json = queue.toJSON();
      json.pop();

      expect(queue.size()).toBe(1);
      expect(queue.has("a")).toBe(true);
    });

    it("toJSON includes all entry fields", () => {
      vi.useFakeTimers({ now: 1000000 });
      queue.enqueue(makeTask());
      const json = queue.toJSON();

      expect(json[0]).toEqual({
        task: makeTask(),
        retryCount: 0,
        nextAttemptAt: 1000000,
        enqueuedAt: 1000000,
      });
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
    });

    it("hydrate with empty array is a no-op", () => {
      queue.enqueue(makeTask());
      queue.hydrate([]);
      expect(queue.size()).toBe(1);
      expect(queue.has("issue-1")).toBe(true);
    });

    it("hydrate merges with existing queue entries", () => {
      queue.enqueue(makeTask({ issueId: "existing" }));

      queue.hydrate([
        {
          task: makeTask({ issueId: "restored" }),
          retryCount: 0,
          nextAttemptAt: Date.now(),
          enqueuedAt: Date.now(),
        },
      ]);

      expect(queue.size()).toBe(2);
      expect(queue.has("existing")).toBe(true);
      expect(queue.has("restored")).toBe(true);
    });

    it("hydrate overwrites entry if same issueId exists", () => {
      queue.enqueue(makeTask({ issueId: "dup", title: "Original" }));

      queue.hydrate([
        {
          task: makeTask({ issueId: "dup", title: "Restored" }),
          retryCount: 3,
          nextAttemptAt: Date.now(),
          enqueuedAt: Date.now(),
        },
      ]);

      expect(queue.size()).toBe(1);
      const entries = queue.entries();
      expect(entries[0]!.task.title).toBe("Restored");
      expect(entries[0]!.retryCount).toBe(3);
    });

    it("hydrate with duplicate issueIds in input keeps last entry", () => {
      const now = Date.now();
      queue.hydrate([
        {
          task: makeTask({ issueId: "dup", title: "First" }),
          retryCount: 1,
          nextAttemptAt: now,
          enqueuedAt: now,
        },
        {
          task: makeTask({ issueId: "dup", title: "Second" }),
          retryCount: 2,
          nextAttemptAt: now,
          enqueuedAt: now,
        },
      ]);

      expect(queue.size()).toBe(1);
      const entries = queue.entries();
      expect(entries[0]!.task.title).toBe("Second");
      expect(entries[0]!.retryCount).toBe(2);
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

    it("roundtrip preserves entry fields exactly", () => {
      vi.useFakeTimers({ now: 2000000 });

      queue.enqueue(makeTask({ issueId: "a" }));
      queue.requeue(makeTask({ issueId: "b" }), 2);

      const json = queue.toJSON();
      const newQueue = createTaskQueue(RETRY_BASE_DELAY);
      newQueue.hydrate(json);

      const originalEntries = queue.entries();
      const restoredEntries = newQueue.entries();

      expect(restoredEntries).toEqual(originalEntries);
    });

    it("hydrated delayed tasks become ready after time passes", () => {
      vi.useFakeTimers({ now: 1000000 });

      const saved = [
        {
          task: makeTask({ issueId: "delayed" }),
          retryCount: 1,
          nextAttemptAt: 1000000 + RETRY_BASE_DELAY,
          enqueuedAt: 1000000,
        },
        {
          task: makeTask({ issueId: "ready" }),
          retryCount: 0,
          nextAttemptAt: 1000000,
          enqueuedAt: 1000000,
        },
      ];

      queue.hydrate(saved);

      // Only "ready" is dequeue-able
      const first = queue.dequeue();
      expect(first!.task.issueId).toBe("ready");
      expect(queue.dequeue()).toBeNull();

      // Advance time — "delayed" becomes ready
      vi.advanceTimersByTime(RETRY_BASE_DELAY + 1);
      const second = queue.dequeue();
      expect(second!.task.issueId).toBe("delayed");
      expect(second!.retryCount).toBe(1);
    });
  });
});
