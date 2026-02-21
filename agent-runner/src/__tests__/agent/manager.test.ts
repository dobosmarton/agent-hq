import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Notifier } from "../../telegram/notifier.js";
import type { TaskPoller } from "../../poller/task-poller.js";
import type { StatePersistence } from "../../state/persistence.js";
import type { AgentTask, RunnerState } from "../../types.js";
import type { TaskQueue } from "../../queue/task-queue.js";
import { makeConfig, makePlaneConfig } from "../fixtures/config.js";
import { PLAN_MARKER } from "../../agent/phase.js";

vi.mock("../../worktree/manager.js", () => ({
  createWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../../agent/runner.js", () => ({
  runAgent: vi.fn(),
}));

vi.mock("../../plane/client.js", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
  updateIssue: vi.fn(),
}));

import { createWorktree, removeWorktree } from "../../worktree/manager.js";
import { runAgent } from "../../agent/runner.js";
import { listComments } from "../../plane/client.js";
import { createAgentManager } from "../../agent/manager.js";

const mockedCreateWorktree = vi.mocked(createWorktree);
const mockedRemoveWorktree = vi.mocked(removeWorktree);
const mockedRunAgent = vi.mocked(runAgent);
const mockedListComments = vi.mocked(listComments);

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

const makeQueue = (): TaskQueue => ({
  enqueue: vi.fn().mockReturnValue(true),
  dequeue: vi.fn().mockReturnValue(null),
  requeue: vi.fn(),
  remove: vi.fn().mockReturnValue(true),
  entries: vi.fn().mockReturnValue([]),
  size: vi.fn().mockReturnValue(0),
  has: vi.fn().mockReturnValue(false),
});

const makeDeps = (overrides?: {
  notifier?: Notifier;
  persistence?: StatePersistence;
}) => ({
  planeConfig: makePlaneConfig(),
  config: makeConfig(),
  notifier: overrides?.notifier ?? makeNotifier(),
  taskPoller: makeTaskPoller(),
  statePersistence: overrides?.persistence ?? makePersistence(),
  queue: makeQueue(),
});

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no comments (planning phase)
  mockedListComments.mockResolvedValue([]);
});

describe("budget checking", () => {
  it("allows spawning when under budget", async () => {
    const deps = makeDeps({
      persistence: makePersistence({ dailySpendUsd: 10 }),
    });
    mockedCreateWorktree.mockResolvedValue({
      worktreePath: "/wt",
      branchName: "agent/HQ-42",
    });
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
    expect(notifier.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("Budget limit reached"),
    );
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
  });

  it("resets spend on new day", async () => {
    const persistence = makePersistence({
      dailySpendUsd: 100,
      dailySpendDate: "2020-01-01", // old date
    });
    const deps = makeDeps({ persistence });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    // Should pass budget check because date was reset
    await manager.spawnAgent(makeTask());

    expect(mockedRunAgent).toHaveBeenCalled();
  });
});

describe("phase detection", () => {
  it("runs planning phase when no plan comment exists", async () => {
    const deps = makeDeps();
    mockedListComments.mockResolvedValue([]);
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Planning phase: should NOT create worktree
    expect(mockedCreateWorktree).not.toHaveBeenCalled();
    // Should call runAgent with "planning" phase
    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.anything(),
      "planning",
      "/repos/hq", // repo path directly
      "",
      [],
      expect.anything(),
    );
  });

  it("runs implementation phase when plan comment exists", async () => {
    const deps = makeDeps();
    mockedListComments.mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedCreateWorktree.mockResolvedValue({
      worktreePath: "/wt",
      branchName: "agent/HQ-42",
    });
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Implementation phase: should create worktree
    expect(mockedCreateWorktree).toHaveBeenCalled();
    // Should call runAgent with "implementation" phase
    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.anything(),
      "implementation",
      "/wt",
      "agent/HQ-42",
      expect.arrayContaining([
        expect.objectContaining({
          comment_html: expect.stringContaining(PLAN_MARKER),
        }),
      ]),
      expect.anything(),
    );
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

  it("handles worktree creation failure in implementation phase", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });
    mockedListComments.mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedCreateWorktree.mockRejectedValue(new Error("git error"));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(notifier.agentErrored).toHaveBeenCalledWith(
      "HQ-42",
      "Fix the bug",
      expect.stringContaining("Worktree creation failed"),
    );
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("registers agent as active on successful spawn", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {})); // never resolves

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(manager.activeCount()).toBe(1);
    expect(manager.isTaskActive("issue-1")).toBe(true);
  });

  it("persists state after registering agent", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(deps.statePersistence.save).toHaveBeenCalled();
  });

  it("updates daily spend on agent completion", async () => {
    const deps = makeDeps();
    let resolveAgent: (v: { costUsd: number }) => void;
    const agentPromise = new Promise<{ costUsd: number }>((r) => {
      resolveAgent = r;
    });

    mockedRunAgent.mockReturnValue(agentPromise);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    resolveAgent!({ costUsd: 2.5 });
    await new Promise((r) => setTimeout(r, 10));

    expect(manager.getDailySpend()).toBe(2.5);
  });

  it("does not clean worktree on agent error", async () => {
    const deps = makeDeps();
    let rejectAgent: (e: Error) => void;
    const agentPromise = new Promise<{ costUsd: number }>((_, rej) => {
      rejectAgent = rej;
    });

    mockedListComments.mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedCreateWorktree.mockResolvedValue({
      worktreePath: "/wt",
      branchName: "agent/HQ-42",
    });
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

    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    await manager.checkStaleAgents();

    const staleCalls = vi
      .mocked(notifier.sendMessage)
      .mock.calls.filter((call) => String(call[0]).includes("Stale agent"));
    expect(staleCalls).toHaveLength(0);
  });

  it("alerts for agents running more than 6 hours", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    const agents = manager.getActiveAgents();
    agents[0]!.startedAt = Date.now() - 7 * 60 * 60 * 1000;

    await manager.checkStaleAgents();

    expect(notifier.sendMessage).toHaveBeenCalledWith(
      expect.stringContaining("Stale agent detected"),
    );
  });

  it("does not send duplicate alerts (alertedStale flag)", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    const agents = manager.getActiveAgents();
    agents[0]!.startedAt = Date.now() - 7 * 60 * 60 * 1000;

    await manager.checkStaleAgents();
    await manager.checkStaleAgents();

    const staleCalls = vi
      .mocked(notifier.sendMessage)
      .mock.calls.filter((call) => String(call[0]).includes("Stale agent"));
    expect(staleCalls).toHaveLength(1);
  });

  it("skips non-running agents", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });

    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    // Wait for completion
    await new Promise((r) => setTimeout(r, 10));

    await manager.checkStaleAgents();

    const staleCalls = vi
      .mocked(notifier.sendMessage)
      .mock.calls.filter((call) => String(call[0]).includes("Stale agent"));
    expect(staleCalls).toHaveLength(0);
  });
});
