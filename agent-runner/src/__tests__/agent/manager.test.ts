import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Notifier } from "../../telegram/notifier.js";
import type { TelegramBridge } from "../../telegram/bridge.js";
import type { TaskPoller } from "../../poller/task-poller.js";
import type { StatePersistence } from "../../state/persistence.js";
import type { AgentTask, RunnerState } from "../../types.js";
import { makeConfig, makePlaneConfig } from "../fixtures/config.js";

vi.mock("../../worktree/manager.js", () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../../agent/runner.js", () => ({
  runAgent: vi.fn(),
}));

import { createWorktree, removeWorktree } from "../../worktree/manager.js";
import { runAgent } from "../../agent/runner.js";
import { createAgentManager } from "../../agent/manager.js";

const mockedCreateWorktree = vi.mocked(createWorktree);
const mockedRemoveWorktree = vi.mocked(removeWorktree);
const mockedRunAgent = vi.mocked(runAgent);

const makeTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  issueId: "issue-1",
  projectId: "proj-1",
  projectIdentifier: "HQ",
  sequenceId: 42,
  title: "Fix the bug",
  descriptionHtml: "<p>Fix it</p>",
  stateId: "state-1",
  labelIds: ["label-1"],
  ...overrides,
});

const makeNotifier = (): Notifier => ({
  sendMessage: vi.fn().mockResolvedValue(0),
  agentStarted: vi.fn().mockResolvedValue(undefined),
  agentCompleted: vi.fn().mockResolvedValue(undefined),
  agentErrored: vi.fn().mockResolvedValue(undefined),
  agentBlocked: vi.fn().mockResolvedValue(42),
});

const makeBridge = (): TelegramBridge => ({
  startAnswerServer: vi.fn(),
  askAndWait: vi.fn().mockResolvedValue("answer"),
  stop: vi.fn(),
});

const makeTaskPoller = (): TaskPoller => ({
  initialize: vi.fn().mockResolvedValue(undefined),
  pollForTasks: vi.fn().mockResolvedValue([]),
  claimTask: vi.fn().mockResolvedValue(true),
  releaseTask: vi.fn(),
  getProjectCache: vi.fn(),
});

const makePersistence = (state?: Partial<RunnerState>): StatePersistence => ({
  load: vi.fn().mockReturnValue({
    activeAgents: {},
    dailySpendUsd: 0,
    dailySpendDate: new Date().toISOString().slice(0, 10),
    ...state,
  }),
  save: vi.fn(),
});

const makeDeps = (overrides?: {
  notifier?: Notifier;
  persistence?: StatePersistence;
}) => ({
  planeConfig: makePlaneConfig(),
  config: makeConfig(),
  notifier: overrides?.notifier ?? makeNotifier(),
  telegramBridge: makeBridge(),
  taskPoller: makeTaskPoller(),
  statePersistence: overrides?.persistence ?? makePersistence(),
});

beforeEach(() => {
  vi.resetAllMocks();
});

describe("budget checking", () => {
  it("allows spawning when under budget", async () => {
    const deps = makeDeps({
      persistence: makePersistence({ dailySpendUsd: 10 }),
    });
    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(mockedRunAgent).toHaveBeenCalled();
  });

  it("blocks spawning when budget exceeded", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({
      notifier,
      persistence: makePersistence({ dailySpendUsd: 16 }), // 16 + 5 > 20
    });

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(mockedRunAgent).not.toHaveBeenCalled();
    expect(notifier.sendMessage).toHaveBeenCalledWith(expect.stringContaining("Budget limit reached"));
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
  });

  it("resets spend on new day", async () => {
    const persistence = makePersistence({
      dailySpendUsd: 100,
      dailySpendDate: "2020-01-01", // old date
    });
    const deps = makeDeps({ persistence });
    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    // Should pass budget check because date was reset
    await manager.spawnAgent(makeTask());

    expect(mockedRunAgent).toHaveBeenCalled();
  });
});

describe("spawnAgent", () => {
  it("returns early for missing project config", async () => {
    const deps = makeDeps();
    const manager = createAgentManager(deps);

    await manager.spawnAgent(makeTask({ projectIdentifier: "UNKNOWN" }));

    expect(mockedCreateWorktree).not.toHaveBeenCalled();
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("handles worktree creation failure", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });
    mockedCreateWorktree.mockRejectedValue(new Error("git error"));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(notifier.agentErrored).toHaveBeenCalledWith(
      "HQ-42",
      "Fix the bug",
      expect.stringContaining("Worktree creation failed")
    );
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("registers agent as active on successful spawn", async () => {
    const deps = makeDeps();
    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(new Promise(() => {})); // never resolves

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(manager.activeCount()).toBe(1);
    expect(manager.isTaskActive("issue-1")).toBe(true);
  });

  it("persists state after registering agent", async () => {
    const deps = makeDeps();
    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(deps.statePersistence.save).toHaveBeenCalled();
  });

  it("updates daily spend on agent completion", async () => {
    const deps = makeDeps();
    let resolveAgent: (v: { costUsd: number }) => void;
    const agentPromise = new Promise<{ costUsd: number }>((r) => { resolveAgent = r; });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(agentPromise);
    mockedRemoveWorktree.mockResolvedValue(undefined);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Resolve the agent
    resolveAgent!({ costUsd: 2.5 });
    // Wait for .then() chain
    await new Promise((r) => setTimeout(r, 10));

    expect(manager.getDailySpend()).toBe(2.5);
  });

  it("does not clean worktree on agent error", async () => {
    const deps = makeDeps();
    let rejectAgent: (e: Error) => void;
    const agentPromise = new Promise<{ costUsd: number }>((_, rej) => { rejectAgent = rej; });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(agentPromise);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    rejectAgent!(new Error("agent crashed"));
    await new Promise((r) => setTimeout(r, 10));

    expect(mockedRemoveWorktree).not.toHaveBeenCalled();
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
  });
});

describe("checkStaleAgents", () => {
  it("does not alert for agents running less than 6 hours", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    await manager.checkStaleAgents();

    // sendMessage should not be called for stale (only for other reasons)
    const staleCalls = vi.mocked(notifier.sendMessage).mock.calls.filter(
      (call) => String(call[0]).includes("Stale agent")
    );
    expect(staleCalls).toHaveLength(0);
  });

  it("alerts for agents running more than 6 hours", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Manually set startedAt to 7 hours ago
    const agents = manager.getActiveAgents();
    agents[0]!.startedAt = Date.now() - 7 * 60 * 60 * 1000;

    await manager.checkStaleAgents();

    expect(notifier.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("Stale agent detected")
    );
  });

  it("does not send duplicate alerts (alertedStale flag)", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    const agents = manager.getActiveAgents();
    agents[0]!.startedAt = Date.now() - 7 * 60 * 60 * 1000;

    await manager.checkStaleAgents();
    await manager.checkStaleAgents();

    const staleCalls = vi.mocked(notifier.sendMessage).mock.calls.filter(
      (call) => String(call[0]).includes("Stale agent")
    );
    expect(staleCalls).toHaveLength(1);
  });

  it("skips non-running agents", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedCreateWorktree.mockResolvedValue({ worktreePath: "/wt", branchName: "agent/HQ-42" });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });
    mockedRemoveWorktree.mockResolvedValue(undefined);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Wait for completion
    await new Promise((r) => setTimeout(r, 10));

    await manager.checkStaleAgents();

    const staleCalls = vi.mocked(notifier.sendMessage).mock.calls.filter(
      (call) => String(call[0]).includes("Stale agent")
    );
    expect(staleCalls).toHaveLength(0);
  });
});
