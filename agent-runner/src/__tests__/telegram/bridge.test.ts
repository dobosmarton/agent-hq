import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createTelegramBridge } from "../../telegram/bridge.js";
import type { Notifier } from "../../telegram/notifier.js";

const createMockNotifier = (): Notifier => ({
  sendMessage: vi.fn().mockResolvedValue(0),
  agentStarted: vi.fn().mockResolvedValue(undefined),
  agentCompleted: vi.fn().mockResolvedValue(undefined),
  agentErrored: vi.fn().mockResolvedValue(undefined),
  agentBlocked: vi.fn().mockResolvedValue(42),
});

describe("askAndWait (fake timers)", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it("calls notifier.agentBlocked with taskId and question", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);
    const promise = bridge.askAndWait("HQ-42", "What DB?");

    expect(notifier.agentBlocked).toHaveBeenCalledWith("HQ-42", "What DB?");

    // Clean up: advance time to resolve the timeout
    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    await promise;
    bridge.stop();
  });

  it("resolves with timeout message after 2 hours", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);
    const promise = bridge.askAndWait("HQ-42", "What DB?");

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);

    const result = await promise;
    expect(result).toBe(
      "[No answer received within timeout. Proceeding with best judgment.]",
    );
    bridge.stop();
  });

  it("resolves all pending questions with shutdown message on stop", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);

    const promise1 = bridge.askAndWait("HQ-1", "Q1");
    const promise2 = bridge.askAndWait("HQ-2", "Q2");

    // Flush microtasks so askAndWait's internal await completes
    await vi.advanceTimersByTimeAsync(0);

    bridge.stop();

    const [result1, result2] = await Promise.all([promise1, promise2]);
    expect(result1).toBe("[Agent runner shutting down]");
    expect(result2).toBe("[Agent runner shutting down]");
  });
});

describe("HTTP answer server", () => {
  it("resolves pending question when POST /answers/{taskId} received", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);
    bridge.startAnswerServer();

    // Small delay to let server start
    await new Promise((r) => setTimeout(r, 50));

    const promise = bridge.askAndWait("HQ-42", "What DB?");

    // POST the answer
    const res = await fetch("http://127.0.0.1:3847/answers/HQ-42", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "PostgreSQL" }),
    });

    expect(res.ok).toBe(true);
    const result = await promise;
    expect(result).toBe("PostgreSQL");

    bridge.stop();
  });

  it("returns 404 for unknown taskId", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);
    bridge.startAnswerServer();
    await new Promise((r) => setTimeout(r, 50));

    const res = await fetch("http://127.0.0.1:3847/answers/UNKNOWN", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ answer: "test" }),
    });

    expect(res.status).toBe(404);
    bridge.stop();
  });

  it("GET /health returns status", async () => {
    const notifier = createMockNotifier();
    const bridge = createTelegramBridge(notifier);
    bridge.startAnswerServer();
    await new Promise((r) => setTimeout(r, 50));

    const res = await fetch("http://127.0.0.1:3847/health");
    const data = (await res.json()) as { ok: boolean; pending: number };

    expect(data.ok).toBe(true);
    expect(typeof data.pending).toBe("number");

    bridge.stop();
  });
});
