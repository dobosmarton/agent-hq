import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_MARKER } from "../../agent/phase";
import type { OnAgentDone } from "../../agent/manager";
import type { TaskPoller } from "../../poller/task-poller";
import type { StatePersistence } from "../../state/persistence";
import type { Notifier } from "../../telegram/notifier";
import type { AgentTask, RunnerState } from "../../types";
import { makeConfig, makePlaneConfig } from "../fixtures/config";

vi.mock("../../worktree/manager", () => ({
  getOrCreateWorktree: vi.fn(),
  removeWorktree: vi.fn(),
}));

vi.mock("../../plane/comment-analyzer", () => ({
  analyzeComments: vi.fn().mockReturnValue({
    allComments: [],
    agentComments: [],
    userComments: [],
    latestAgentTimestamp: null,
    newCommentsSinceAgent: [],
    hasPlanMarker: false,
    hasProgressUpdates: false,
  }),
}));

vi.mock("../../git/operations", () => ({
  getCommitLog: vi.fn().mockResolvedValue(""),
  getDiff: vi.fn().mockResolvedValue(""),
}));

vi.mock("../../agent/comment-formatter", () => ({
  createResumeComment: vi.fn().mockReturnValue("<p>Resuming</p>"),
}));

vi.mock("../../skills/loader", () => ({
  loadSkills: vi.fn().mockReturnValue([]),
}));

vi.mock("../../skills/formatter", () => ({
  formatSkillsCatalog: vi.fn().mockReturnValue(""),
}));

vi.mock("../../agent/runner", () => ({
  runAgent: vi.fn(),
}));

vi.mock("../../agent/ci-discovery", () => ({
  readCiWorkflows: vi.fn().mockReturnValue({ workflowFiles: {} }),
}));

vi.mock("../../plane/client", () => ({
  listComments: vi.fn(),
  addComment: vi.fn(),
  updateIssue: vi.fn(),
}));

import { readCiWorkflows } from "../../agent/ci-discovery";
import { createAgentManager } from "../../agent/manager";
import { runAgent } from "../../agent/runner";
import { addComment, listComments } from "../../plane/client";
import { getOrCreateWorktree, removeWorktree } from "../../worktree/manager";
import { loadSkills } from "../../skills/loader";

const mockedGetOrCreateWorktree = vi.mocked(getOrCreateWorktree);
const mockedRemoveWorktree = vi.mocked(removeWorktree);
const mockedRunAgent = vi.mocked(runAgent);
const mockedListComments = vi.mocked(listComments);
const mockedAddComment = vi.mocked(addComment);
const mockedReadCiWorkflows = vi.mocked(readCiWorkflows);
const mockedLoadSkills = vi.mocked(loadSkills);

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

const makeDeps = (overrides?: {
  notifier?: Notifier;
  persistence?: StatePersistence;
  onAgentDone?: OnAgentDone;
}) => ({
  planeConfig: makePlaneConfig(),
  config: makeConfig(),
  notifier: overrides?.notifier ?? makeNotifier(),
  taskPoller: makeTaskPoller(),
  statePersistence: overrides?.persistence ?? makePersistence(),
  onAgentDone: overrides?.onAgentDone ?? vi.fn(),
});

beforeEach(() => {
  vi.resetAllMocks();
  // Default: no comments (planning phase)
  mockedListComments.mockResolvedValue([]);
  mockedReadCiWorkflows.mockReturnValue({ workflowFiles: {} });
  // Default: skills loading returns empty
  mockedLoadSkills.mockReturnValue([]);
  mockedAddComment.mockResolvedValue(undefined as any);
  // Default: worktree creation succeeds (both phases use worktrees)
  mockedGetOrCreateWorktree.mockResolvedValue({
    worktreePath: "/wt",
    branchName: "agent/HQ-42",
    isExisting: false,
    lastCommitMessage: null,
  });
});

describe("budget checking", () => {
  it("allows spawning when under budget", async () => {
    const deps = makeDeps({
      persistence: makePersistence({ dailySpendUsd: 10 }),
    });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result.outcome).toBe("started");
    expect(mockedRunAgent).toHaveBeenCalled();
  });

  it("returns budget_exceeded when budget exceeded", async () => {
    const deps = makeDeps({
      persistence: makePersistence({ dailySpendUsd: 16 }), // 16 + 5 > 20
    });

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result).toEqual({
      outcome: "rejected",
      reason: "budget_exceeded",
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("resets spend on new day", async () => {
    const persistence = makePersistence({
      dailySpendUsd: 100,
      dailySpendDate: "2020-01-01", // old date
    });
    const deps = makeDeps({ persistence });
    mockedRunAgent.mockResolvedValue({ costUsd: 1 });

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result.outcome).toBe("started");
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

    expect(mockedGetOrCreateWorktree).toHaveBeenCalled();
    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.anything(),
      "planning",
      "/wt",
      "agent/HQ-42",
      [],
      expect.objectContaining({ workflowFiles: expect.any(Object) }),
      undefined,
      expect.any(Array),
      expect.anything(),
      expect.any(String),
      expect.any(String),
      null,
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
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(mockedGetOrCreateWorktree).toHaveBeenCalled();
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
      expect.objectContaining({ workflowFiles: expect.any(Object) }),
      undefined,
      expect.any(Array),
      expect.anything(),
      expect.any(String),
      expect.any(String),
      null,
    );
  });
});

describe("spawnAgent", () => {
  it("returns no_project_config for missing project config", async () => {
    const deps = makeDeps();
    const manager = createAgentManager(deps);

    const result = await manager.spawnAgent(
      makeTask({ projectIdentifier: "UNKNOWN" }),
    );

    expect(result).toEqual({
      outcome: "rejected",
      reason: "no_project_config",
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("returns error on worktree creation failure", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });
    mockedListComments.mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedGetOrCreateWorktree.mockRejectedValue(new Error("git error"));

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result).toEqual({
      outcome: "error",
      reason: expect.stringContaining("Worktree setup failed"),
    });
    expect(notifier.agentErrored).toHaveBeenCalledWith(
      "HQ-42",
      "Fix the bug",
      expect.stringContaining("Worktree setup failed"),
    );
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("registers agent as active on successful spawn", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result.outcome).toBe("started");
    expect(manager.activeCount()).toBe(1);
    expect(manager.isTaskActive("issue-1")).toBe(true);
  });

  it("calls onAgentDone when agent completes", async () => {
    const onAgentDone = vi.fn();
    const deps = makeDeps({ onAgentDone });
    let resolveAgent: (v: { costUsd: number }) => void;
    const agentPromise = new Promise<{ costUsd: number }>((r) => {
      resolveAgent = r;
    });

    mockedRunAgent.mockReturnValue(agentPromise);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    resolveAgent!({ costUsd: 2.5 });
    await new Promise((r) => setTimeout(r, 10));

    expect(onAgentDone).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: "issue-1" }),
      expect.objectContaining({ costUsd: 2.5 }),
      0,
      expect.any(Number),
      "planning",
    );
    expect(manager.getDailySpend()).toBe(2.5);
  });

  it("calls onAgentDone with crashed flag when agent throws", async () => {
    const onAgentDone = vi.fn();
    const deps = makeDeps({ onAgentDone });
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
    mockedGetOrCreateWorktree.mockResolvedValue({
      worktreePath: "/wt",
      branchName: "agent/HQ-42",
      isExisting: false,
      lastCommitMessage: null,
    });
    mockedRunAgent.mockReturnValue(agentPromise);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    rejectAgent!(new Error("agent crashed"));
    await new Promise((r) => setTimeout(r, 10));

    expect(onAgentDone).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: "issue-1" }),
      expect.objectContaining({ crashed: true, error: "agent crashed" }),
      0,
      expect.any(Number),
      "implementation",
    );
    expect(mockedRemoveWorktree).not.toHaveBeenCalled();
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
  });

  it("passes retryContext to runAgent", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask(), 2);

    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.anything(),
      "planning",
      expect.any(String),
      expect.any(String),
      expect.any(Array),
      expect.anything(),
      undefined,
      expect.any(Array),
      expect.objectContaining({
        retryContext: { retryCount: 2, maxRetries: 2 },
      }),
      expect.any(String),
      expect.any(String),
      null,
    );
  });

  it("exposes state via getState()", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    const state = manager.getState();
    expect(state.activeAgents).toHaveProperty("issue-1");
    expect(typeof state.dailySpendUsd).toBe("number");
    expect(typeof state.dailySpendDate).toBe("string");
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
