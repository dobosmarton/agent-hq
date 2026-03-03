import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAgentProgressTracker } from "../../telegram/progress-tracker";
import type { Notifier } from "../../telegram/notifier";

const createMockNotifier = (): Notifier => ({
  agentStarted: vi.fn().mockResolvedValue(0),
  agentCompleted: vi.fn().mockResolvedValue(undefined),
  agentErrored: vi.fn().mockResolvedValue(undefined),
  agentBlocked: vi.fn().mockResolvedValue(0),
  agentProgress: vi.fn().mockResolvedValue(true),
  sendMessage: vi.fn().mockResolvedValue(0),
});

describe("createAgentProgressTracker", () => {
  let notifier: Notifier;

  beforeEach(() => {
    notifier = createMockNotifier();
  });

  it("returns no-op tracker when messageId is 0", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 0,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
    });

    tracker.update("Step 1", "in_progress");

    expect(notifier.agentProgress).not.toHaveBeenCalled();
  });

  it("sends progress on first update", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
    });

    tracker.update("Setting up", "in_progress");

    expect(notifier.agentProgress).toHaveBeenCalledOnce();
    expect(notifier.agentProgress).toHaveBeenCalledWith(
      42,
      expect.stringContaining("Setting up"),
    );
  });

  it("rate-limits rapid successive updates", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
      updateIntervalMs: 5000,
    });

    tracker.update("Step 1", "in_progress");
    tracker.update("Step 2", "in_progress");
    tracker.update("Step 3", "in_progress");

    expect(notifier.agentProgress).toHaveBeenCalledOnce();
  });

  it("updates existing step in-place", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
      updateIntervalMs: 0,
    });

    tracker.update("Loading", "in_progress");
    tracker.update("Loading", "completed");

    // Both calls should trigger (intervalMs=0), second message should have completed status
    expect(notifier.agentProgress).toHaveBeenCalledTimes(2);
    const lastMessage = String(
      (notifier.agentProgress as ReturnType<typeof vi.fn>).mock.calls[1]?.[1],
    );
    expect(lastMessage).toContain("Loading");
  });

  it("caps steps at 10", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
      updateIntervalMs: 0,
    });

    for (let i = 0; i < 11; i++) {
      tracker.update(`Step ${i}`, "completed");
    }

    // The last message should not contain Step 0 (it was shifted out)
    const lastMessage = (
      notifier.agentProgress as ReturnType<typeof vi.fn>
    ).mock.calls.at(-1)![1] as string;
    expect(lastMessage).not.toContain("Step 0");
    expect(lastMessage).toContain("Step 10");
  });

  it("catches notifier errors without unhandled rejection", async () => {
    const consoleSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    (notifier.agentProgress as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      new Error("Telegram down"),
    );

    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-1",
      taskTitle: "Test task",
    });

    tracker.update("Step 1", "in_progress");

    // Wait for the fire-and-forget promise to settle
    await new Promise((resolve) => setTimeout(resolve, 10));

    expect(consoleSpy).toHaveBeenCalledWith(
      expect.stringContaining("Progress update failed"),
    );
    consoleSpy.mockRestore();
  });

  it("includes task ID and title in progress message", () => {
    const tracker = createAgentProgressTracker({
      notifier,
      messageId: 42,
      taskDisplayId: "PROJ-99",
      taskTitle: "Important feature",
    });

    tracker.update("Working", "in_progress");

    const message = String(
      (notifier.agentProgress as ReturnType<typeof vi.fn>).mock.calls[0]?.[1],
    );
    expect(message).toContain("PROJ-99");
    expect(message).toContain("Important feature");
  });
});
