import { beforeEach, describe, expect, it, vi } from "vitest";
import { PLAN_MARKER } from "@agent-hq/shared-types";
import type { OnAgentDone } from "../manager";
import type { Notifier, StatePersistence, TaskPollerAdapter, WorktreeAdapter } from "../adapters";
import type { AgentTask, RunnerState } from "@agent-hq/shared-types";
import type { PlaneClient } from "@agent-hq/plane-client";

vi.mock("../comment-analyzer", () => ({
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

vi.mock("../git/operations", () => ({
  getCommitLog: vi.fn().mockResolvedValue(""),
  getDiff: vi.fn().mockResolvedValue(""),
}));

vi.mock("../comment-formatter", () => ({
  createResumeComment: vi.fn().mockReturnValue("<p>Resuming</p>"),
}));

vi.mock("@agent-hq/skills", () => ({
  loadSkills: vi.fn().mockReturnValue([]),
  formatSkillsCatalog: vi.fn().mockReturnValue(""),
}));

vi.mock("../runner", () => ({
  runAgent: vi.fn(),
}));

vi.mock("../ci-discovery", () => ({
  readCiWorkflows: vi.fn().mockReturnValue({ workflowFiles: {} }),
}));

import { readCiWorkflows } from "../ci-discovery";
import { createAgentManager } from "../manager";
import { runAgent } from "../runner";
import { loadSkills } from "@agent-hq/skills";

const mockedRunAgent = vi.mocked(runAgent);
const mockedReadCiWorkflows = vi.mocked(readCiWorkflows);
const mockedLoadSkills = vi.mocked(loadSkills);

const makeMockPlane = (): PlaneClient => ({
  listProjects: vi.fn(),
  findProjectByIdentifier: vi.fn(),
  createProject: vi.fn(),
  listStates: vi.fn(),
  buildStateMap: vi.fn(),
  findStateByGroupAndName: vi.fn(),
  listLabels: vi.fn(),
  findLabelByName: vi.fn(),
  createLabel: vi.fn(),
  listIssues: vi.fn(),
  getIssue: vi.fn(),
  createIssue: vi.fn(),
  updateIssue: vi.fn(),
  findIssueBySequenceId: vi.fn(),
  addComment: vi.fn(),
  listComments: vi.fn().mockResolvedValue([]),
  addLink: vi.fn(),
  parseIssueIdentifier: vi.fn() as any,
  cloneProjectConfiguration: vi.fn(),
});

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
  agentStarted: vi.fn().mockResolvedValue(0),
  agentCompleted: vi.fn().mockResolvedValue(undefined),
  agentErrored: vi.fn().mockResolvedValue(undefined),
  agentBlocked: vi.fn().mockResolvedValue(42),
  agentProgress: vi.fn().mockResolvedValue(false),
});

const makeTaskPoller = (): TaskPollerAdapter => ({
  releaseTask: vi.fn(),
  getProjectCache: vi.fn(),
});

const makeWorktree = (): WorktreeAdapter => ({
  getOrCreateWorktree: vi.fn().mockResolvedValue({
    worktreePath: "/wt",
    branchName: "agent/HQ-42",
    isExisting: false,
    lastCommitMessage: null,
  }),
  removeWorktree: vi.fn().mockResolvedValue(undefined),
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

const makeConfig = () => ({
  projects: {
    HQ: {
      repoPath: "/repos/hq",
      defaultBranch: "main",
    },
  },
  agent: {
    maxBudgetPerTask: 5,
    maxDailyBudget: 20,
    maxTurns: 200,
    maxRetries: 2,
    progressFeedbackEnabled: true,
    progressUpdateIntervalMs: 2500,
    skills: {
      enabled: true,
      maxSkillsPerPrompt: 10,
      globalSkillsPath: "skills/global",
    },
  },
});

const makeDeps = (overrides?: {
  notifier?: Notifier;
  persistence?: StatePersistence;
  onAgentDone?: OnAgentDone;
  plane?: PlaneClient;
  worktree?: WorktreeAdapter;
}) => ({
  plane: overrides?.plane ?? makeMockPlane(),
  config: makeConfig(),
  notifier: overrides?.notifier ?? makeNotifier(),
  taskPoller: makeTaskPoller(),
  statePersistence: overrides?.persistence ?? makePersistence(),
  worktree: overrides?.worktree ?? makeWorktree(),
  onAgentDone: overrides?.onAgentDone ?? vi.fn(),
});

beforeEach(() => {
  vi.resetAllMocks();
  mockedReadCiWorkflows.mockReturnValue({ workflowFiles: {} });
  mockedLoadSkills.mockReturnValue([]);
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
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(deps.worktree.getOrCreateWorktree).toHaveBeenCalled();
    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "planning",
        workingDir: "/wt",
        branchName: "agent/HQ-42",
        comments: [],
        resumeContext: null,
      })
    );
  });

  it("runs implementation phase when plan comment exists", async () => {
    const deps = makeDeps();
    vi.mocked(deps.plane.listComments).mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    expect(deps.worktree.getOrCreateWorktree).toHaveBeenCalled();
    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "implementation",
        workingDir: "/wt",
        branchName: "agent/HQ-42",
        comments: expect.arrayContaining([
          expect.objectContaining({
            comment_html: expect.stringContaining(PLAN_MARKER),
          }),
        ]),
        resumeContext: null,
      })
    );
  });
});

describe("spawnAgent", () => {
  it("returns no_project_config for missing project config", async () => {
    const deps = makeDeps();
    const manager = createAgentManager(deps);

    const result = await manager.spawnAgent(makeTask({ projectIdentifier: "UNKNOWN" }));

    expect(result).toEqual({
      outcome: "rejected",
      reason: "no_project_config",
    });
    expect(mockedRunAgent).not.toHaveBeenCalled();
  });

  it("returns error on worktree creation failure", async () => {
    const notifier = makeNotifier();
    const deps = makeDeps({ notifier });
    vi.mocked(deps.plane.listComments).mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    vi.mocked(deps.worktree.getOrCreateWorktree).mockRejectedValue(new Error("git error"));

    const manager = createAgentManager(deps);
    const result = await manager.spawnAgent(makeTask());

    expect(result).toEqual({
      outcome: "error",
      reason: expect.stringContaining("Worktree setup failed"),
    });
    expect(notifier.agentErrored).toHaveBeenCalledWith(
      "HQ-42",
      "Fix the bug",
      expect.stringContaining("Worktree setup failed")
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
      0
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

    vi.mocked(deps.plane.listComments).mockResolvedValue([
      {
        id: "c1",
        comment_html: `${PLAN_MARKER}<h2>Plan</h2>`,
        created_at: "2026-02-19T10:00:00Z",
      },
    ]);
    mockedRunAgent.mockReturnValue(agentPromise);

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask());

    rejectAgent!(new Error("agent crashed"));
    await new Promise((r) => setTimeout(r, 10));

    expect(onAgentDone).toHaveBeenCalledWith(
      expect.objectContaining({ issueId: "issue-1" }),
      expect.objectContaining({ crashed: true, error: "agent crashed" }),
      0
    );
    expect(deps.worktree.removeWorktree).not.toHaveBeenCalled();
    expect(deps.taskPoller.releaseTask).toHaveBeenCalledWith("issue-1");
  });

  it("passes retryContext to runAgent", async () => {
    const deps = makeDeps();
    mockedRunAgent.mockReturnValue(new Promise(() => {}));

    const manager = createAgentManager(deps);
    await manager.spawnAgent(makeTask(), 2);

    expect(mockedRunAgent).toHaveBeenCalledWith(
      expect.objectContaining({
        phase: "planning",
        deps: expect.objectContaining({
          retryContext: { retryCount: 2, maxRetries: 2 },
        }),
      })
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
      expect.stringContaining("Stale agent detected")
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
