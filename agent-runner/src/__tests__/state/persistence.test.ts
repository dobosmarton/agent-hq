import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createStatePersistence } from "../../state/persistence.js";
import type { RunnerState } from "@agent-hq/shared-types";

let testDir: string;

beforeEach(() => {
  testDir = join(tmpdir(), `agent-runner-test-${Date.now()}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(testDir, { recursive: true });
});

afterEach(() => {
  rmSync(testDir, { recursive: true, force: true });
});

const makeDbPath = (): string => join(testDir, "agent-state.db");

describe("load", () => {
  it("returns defaults when database is empty", async () => {
    const persistence = await createStatePersistence(makeDbPath());

    const state = await persistence.load();
    expect(state.activeAgents).toEqual({});
    expect(state.dailySpendUsd).toBe(0);
    expect(state.dailySpendDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("returns previously saved state", async () => {
    const savedState: RunnerState = {
      activeAgents: {},
      dailySpendUsd: 3.5,
      dailySpendDate: "2026-02-19",
    };

    const persistence = await createStatePersistence(makeDbPath());
    await persistence.save(savedState);

    const state = await persistence.load();
    expect(state.dailySpendUsd).toBe(3.5);
    expect(state.dailySpendDate).toBe("2026-02-19");
  });

  it("persists across separate instances (same db path)", async () => {
    const dbPath = makeDbPath();
    const savedState: RunnerState = {
      activeAgents: {},
      dailySpendUsd: 7.25,
      dailySpendDate: "2026-03-01",
    };

    const first = await createStatePersistence(dbPath);
    await first.save(savedState);

    const second = await createStatePersistence(dbPath);
    const state = await second.load();
    expect(state.dailySpendUsd).toBe(7.25);
    expect(state.dailySpendDate).toBe("2026-03-01");
  });
});

describe("save and load round-trip", () => {
  it("round-trips queued tasks", async () => {
    const dbPath = makeDbPath();
    const savedState: RunnerState = {
      activeAgents: {},
      dailySpendUsd: 0,
      dailySpendDate: "2026-02-19",
      queuedTasks: [
        {
          task: {
            issueId: "issue-1",
            projectId: "proj-1",
            projectIdentifier: "HQ",
            sequenceId: 42,
            title: "Fix bug",
            descriptionHtml: "<p>Fix it</p>",
            stateId: "state-1",
            labelIds: ["label-1"],
          },
          retryCount: 1,
          nextAttemptAt: 1000,
          enqueuedAt: 500,
        },
      ],
    };

    const persistence = await createStatePersistence(dbPath);
    await persistence.save(savedState);

    const state = await persistence.load();
    expect(state.queuedTasks).toHaveLength(1);
    expect(state.queuedTasks![0]!.task.issueId).toBe("issue-1");
    expect(state.queuedTasks![0]!.retryCount).toBe(1);
  });

  it("round-trips active agents", async () => {
    const dbPath = makeDbPath();
    const savedState: RunnerState = {
      activeAgents: {
        "issue-1": {
          task: {
            issueId: "issue-1",
            projectId: "proj-1",
            projectIdentifier: "HQ",
            sequenceId: 42,
            title: "Fix bug",
            descriptionHtml: "<p>Fix it</p>",
            stateId: "state-1",
            labelIds: [],
          },
          phase: "implementation",
          worktreePath: "/wt/hq-42",
          branchName: "agent/HQ-42",
          startedAt: 1000,
          status: "running",
          costUsd: 1.5,
          alertedStale: false,
          retryCount: 0,
        },
      },
      dailySpendUsd: 1.5,
      dailySpendDate: "2026-02-19",
    };

    const persistence = await createStatePersistence(dbPath);
    await persistence.save(savedState);

    const state = await persistence.load();
    expect(state.activeAgents["issue-1"]).toBeDefined();
    expect(state.activeAgents["issue-1"]!.phase).toBe("implementation");
    expect(state.activeAgents["issue-1"]!.costUsd).toBe(1.5);
    expect(state.activeAgents["issue-1"]!.branchName).toBe("agent/HQ-42");
  });

  it("overwrites previous state on subsequent saves", async () => {
    const dbPath = makeDbPath();
    const persistence = await createStatePersistence(dbPath);

    await persistence.save({
      activeAgents: {},
      dailySpendUsd: 1.0,
      dailySpendDate: "2026-02-19",
    });

    await persistence.save({
      activeAgents: {},
      dailySpendUsd: 2.5,
      dailySpendDate: "2026-02-19",
    });

    const state = await persistence.load();
    expect(state.dailySpendUsd).toBe(2.5);
  });

  it("creates parent directory if it does not exist", async () => {
    const nestedPath = join(testDir, "nested", "subdir", "agent-state.db");
    const persistence = await createStatePersistence(nestedPath);
    const state = await persistence.load();
    expect(state.activeAgents).toEqual({});
  });
});
