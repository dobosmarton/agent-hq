import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeConfig, makePlaneConfig } from "../fixtures/config";
import {
  makeIssue,
  makeLabel,
  makeProject,
  makeState,
} from "../fixtures/plane";

vi.mock("../../plane/client", () => ({
  listProjects: vi.fn(),
  listLabels: vi.fn(),
  listStates: vi.fn(),
  listIssues: vi.fn(),
  updateIssue: vi.fn(),
}));

import {
  listIssues,
  listLabels,
  listProjects,
  listStates,
  updateIssue,
} from "../../plane/client";
import { createTaskPoller } from "../../poller/task-poller";

const mockedListProjects = vi.mocked(listProjects);
const mockedListLabels = vi.mocked(listLabels);
const mockedListStates = vi.mocked(listStates);
const mockedListIssues = vi.mocked(listIssues);
const mockedUpdateIssue = vi.mocked(updateIssue);

const planeConfig = makePlaneConfig();

beforeEach(() => {
  vi.resetAllMocks();
});

const setupValidProject = () => {
  const project = makeProject({ id: "proj-1", identifier: "HQ" });
  const label = makeLabel({ id: "label-1", name: "agent" });
  const states = [
    makeState({ id: "todo-state", name: "Todo", group: "unstarted" }),
    makeState({ id: "ip-state", name: "In Progress", group: "started" }),
    makeState({ id: "done-state", name: "Done", group: "completed" }),
  ];

  mockedListProjects.mockResolvedValue([project]);
  mockedListLabels.mockResolvedValue([label]);
  mockedListStates.mockResolvedValue(states);

  return { project, label, states };
};

describe("initialize", () => {
  it("builds cache for valid project with label and states", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    const cache = poller.getProjectCache("HQ");
    expect(cache).toBeDefined();
    expect(cache?.agentLabelId).toBe("label-1");
    expect(cache?.todoStateId).toBe("todo-state");
    expect(cache?.inProgressStateId).toBe("ip-state");
  });

  it("skips project not found in Plane", async () => {
    mockedListProjects.mockResolvedValue([]);
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    expect(poller.getProjectCache("HQ")).toBeUndefined();
  });

  it("skips project with missing agent label", async () => {
    const project = makeProject({ id: "proj-1", identifier: "HQ" });
    mockedListProjects.mockResolvedValue([project]);
    mockedListLabels.mockResolvedValue([makeLabel({ name: "other" })]);

    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    expect(poller.getProjectCache("HQ")).toBeUndefined();
  });

  it("skips project with missing required states", async () => {
    const project = makeProject({ id: "proj-1", identifier: "HQ" });
    mockedListProjects.mockResolvedValue([project]);
    mockedListLabels.mockResolvedValue([makeLabel({ name: "agent" })]);
    mockedListStates.mockResolvedValue([
      makeState({ group: "completed", name: "Done" }), // no unstarted or started
    ]);

    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    expect(poller.getProjectCache("HQ")).toBeUndefined();
  });

  it("finds in_review state when present", async () => {
    const project = makeProject({ id: "proj-1", identifier: "HQ" });
    mockedListProjects.mockResolvedValue([project]);
    mockedListLabels.mockResolvedValue([makeLabel({ name: "agent" })]);
    mockedListStates.mockResolvedValue([
      makeState({ id: "todo", group: "unstarted", name: "Todo" }),
      makeState({ id: "ip", group: "started", name: "In Progress" }),
      makeState({ id: "review", group: "started", name: "In Review" }),
      makeState({ id: "done", group: "completed", name: "Done" }),
    ]);

    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    const cache = poller.getProjectCache("HQ");
    expect(cache?.inReviewStateId).toBe("review");
  });

  it("sets inReviewStateId to null when no review state", async () => {
    setupValidProject(); // no review state in default setup
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    const cache = poller.getProjectCache("HQ");
    expect(cache?.inReviewStateId).toBeNull();
  });

  it("finds plan_review state when present", async () => {
    const project = makeProject({ id: "proj-1", identifier: "HQ" });
    mockedListProjects.mockResolvedValue([project]);
    mockedListLabels.mockResolvedValue([makeLabel({ name: "agent" })]);
    mockedListStates.mockResolvedValue([
      makeState({ id: "todo", group: "unstarted", name: "Todo" }),
      makeState({ id: "ip", group: "started", name: "In Progress" }),
      makeState({ id: "plan-review", group: "started", name: "Plan Review" }),
      makeState({ id: "review", group: "started", name: "In Review" }),
      makeState({ id: "done", group: "completed", name: "Done" }),
    ]);

    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    const cache = poller.getProjectCache("HQ");
    expect(cache?.planReviewStateId).toBe("plan-review");
    expect(cache?.inReviewStateId).toBe("review");
  });

  it("sets planReviewStateId to null when no plan review state", async () => {
    setupValidProject(); // no plan review state in default setup
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);

    await poller.initialize();

    const cache = poller.getProjectCache("HQ");
    expect(cache?.planReviewStateId).toBeNull();
  });
});

describe("pollForTasks", () => {
  it("returns issues with agent label", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedListIssues.mockResolvedValue([
      makeIssue({ id: "i1", labels: ["label-1"], state: "todo-state" }),
    ]);

    const tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.issueId).toBe("i1");
  });

  it("skips issues without agent label", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedListIssues.mockResolvedValue([
      makeIssue({ id: "i1", labels: ["other-label"] }),
    ]);

    const tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(0);
  });

  it("skips issues not in todo state", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedListIssues.mockResolvedValue([
      makeIssue({
        id: "i1",
        labels: ["label-1"],
        state: "plan-review-state", // Not todoStateId
      }),
    ]);

    const tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(0);
  });

  it("skips claimed issues", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    const issue = makeIssue({ id: "i1", labels: ["label-1"] });
    mockedListIssues.mockResolvedValue([issue]);
    mockedUpdateIssue.mockResolvedValue(issue);

    // Claim the issue first
    await poller.claimTask({
      issueId: "i1",
      projectId: "proj-1",
      projectIdentifier: "HQ",
      sequenceId: 42,
      title: "Test",
      descriptionHtml: "",
      stateId: "todo-state",
      labelIds: ["label-1"],
    });

    const tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(0);
  });

  it("respects maxTasks limit", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedListIssues.mockResolvedValue([
      makeIssue({ id: "i1", labels: ["label-1"], state: "todo-state" }),
      makeIssue({
        id: "i2",
        labels: ["label-1"],
        state: "todo-state",
        sequence_id: 43,
      }),
      makeIssue({
        id: "i3",
        labels: ["label-1"],
        state: "todo-state",
        sequence_id: 44,
      }),
    ]);

    const tasks = await poller.pollForTasks(1);
    expect(tasks).toHaveLength(1);
  });

  it("continues polling other projects if one errors", async () => {
    // Set up two projects
    const project1 = makeProject({ id: "proj-1", identifier: "HQ" });
    const project2 = makeProject({
      id: "proj-2",
      identifier: "APP",
      name: "App",
    });

    mockedListProjects.mockResolvedValue([project1, project2]);
    mockedListLabels.mockResolvedValue([makeLabel({ name: "agent" })]);
    mockedListStates.mockResolvedValue([
      makeState({ id: "todo", group: "unstarted" }),
      makeState({ id: "ip", group: "started" }),
    ]);

    const config = makeConfig({
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
          defaultBranch: "main",
        },
        APP: {
          repoPath: "/repos/app",
          repoUrl: "https://github.com/test/app",
          defaultBranch: "main",
        },
      },
    });

    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    // First project errors, second succeeds
    mockedListIssues
      .mockRejectedValueOnce(new Error("API error"))
      .mockResolvedValueOnce([
        makeIssue({ id: "i2", labels: ["label-uuid-1"], state: "todo" }),
      ]);

    const tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]!.issueId).toBe("i2");
  });
});

describe("claimTask", () => {
  it("calls updateIssue with inProgressStateId", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedUpdateIssue.mockResolvedValue(makeIssue());

    const result = await poller.claimTask({
      issueId: "i1",
      projectId: "proj-1",
      projectIdentifier: "HQ",
      sequenceId: 42,
      title: "Test",
      descriptionHtml: "",
      stateId: "todo-state",
      labelIds: [],
    });

    expect(result).toBe(true);
    expect(mockedUpdateIssue).toHaveBeenCalledWith(
      planeConfig,
      "proj-1",
      "i1",
      { state: "ip-state" },
    );
  });

  it("returns false when cache missing", async () => {
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    // Don't initialize — no caches

    const result = await poller.claimTask({
      issueId: "i1",
      projectId: "proj-1",
      projectIdentifier: "MISSING",
      sequenceId: 42,
      title: "Test",
      descriptionHtml: "",
      stateId: "s",
      labelIds: [],
    });

    expect(result).toBe(false);
  });

  it("returns false on API error", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    mockedUpdateIssue.mockRejectedValue(new Error("API failure"));

    const result = await poller.claimTask({
      issueId: "i1",
      projectId: "proj-1",
      projectIdentifier: "HQ",
      sequenceId: 42,
      title: "Test",
      descriptionHtml: "",
      stateId: "s",
      labelIds: [],
    });

    expect(result).toBe(false);
  });
});

describe("releaseTask", () => {
  it("removes issue from claimed set", async () => {
    setupValidProject();
    const config = makeConfig();
    const poller = createTaskPoller(planeConfig, config);
    await poller.initialize();

    const issue = makeIssue({
      id: "i1",
      labels: ["label-1"],
      state: "todo-state",
    });
    mockedUpdateIssue.mockResolvedValue(issue);

    const task = {
      issueId: "i1",
      projectId: "proj-1",
      projectIdentifier: "HQ",
      sequenceId: 42,
      title: "Test",
      descriptionHtml: "",
      stateId: "todo-state",
      labelIds: ["label-1"],
    };

    await poller.claimTask(task);

    // Issue should be claimed (not returned by poll)
    mockedListIssues.mockResolvedValue([issue]);
    let tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(0);

    // Release it
    poller.releaseTask("i1");

    // Now it should appear again
    tasks = await poller.pollForTasks(10);
    expect(tasks).toHaveLength(1);
  });
});
