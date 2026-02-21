import { beforeEach, describe, expect, it, vi } from "vitest";
import { makeComment, makeIssue, makePlaneConfig, makeProject, makeState } from "../fixtures/plane";

vi.mock("../../plane", () => ({
  listProjects: vi.fn(),
  findProjectByIdentifier: vi.fn(),
  listIssues: vi.fn(),
  buildStateMap: vi.fn(),
  createIssue: vi.fn(),
  listStates: vi.fn(),
  parseIssueIdentifier: vi.fn(),
  findIssueBySequenceId: vi.fn(),
  getIssue: vi.fn(),
  listIssueComments: vi.fn(),
  addIssueComment: vi.fn(),
  updateIssueState: vi.fn(),
}));

import { createPlaneTools } from "../../agent/tools";
import {
  addIssueComment,
  buildStateMap,
  createIssue,
  findIssueBySequenceId,
  findProjectByIdentifier,
  getIssue,
  listIssueComments,
  listIssues,
  listProjects,
  listStates,
  parseIssueIdentifier,
  updateIssueState,
} from "../../plane";

const mockedListProjects = vi.mocked(listProjects);
const mockedFindProject = vi.mocked(findProjectByIdentifier);
const mockedListIssues = vi.mocked(listIssues);
const mockedBuildStateMap = vi.mocked(buildStateMap);
const mockedCreateIssue = vi.mocked(createIssue);
const mockedListStates = vi.mocked(listStates);
const mockedParseIssueIdentifier = vi.mocked(parseIssueIdentifier);
const mockedFindIssueBySequenceId = vi.mocked(findIssueBySequenceId);
const mockedGetIssue = vi.mocked(getIssue);
const mockedListIssueComments = vi.mocked(listIssueComments);
const mockedAddIssueComment = vi.mocked(addIssueComment);
const mockedUpdateIssueState = vi.mocked(updateIssueState);

const config = makePlaneConfig();

beforeEach(() => {
  vi.resetAllMocks();
});

describe("list_projects tool", () => {
  it("returns formatted projects", async () => {
    mockedListProjects.mockResolvedValue([
      makeProject({ name: "Agent HQ", identifier: "HQ" }),
      makeProject({ id: "p2", name: "App", identifier: "APP" }),
    ]);

    const tools = createPlaneTools(config);
    const result = (await tools.listProjects.execute!({} as any, {} as any)) as any;

    expect(result.projects).toEqual([
      { name: "Agent HQ", identifier: "HQ" },
      { name: "App", identifier: "APP" },
    ]);
  });

  it("returns empty array when no projects", async () => {
    mockedListProjects.mockResolvedValue([]);

    const tools = createPlaneTools(config);
    const result = (await tools.listProjects.execute!({} as any, {} as any)) as any;

    expect(result.projects).toEqual([]);
  });
});

describe("list_tasks tool", () => {
  it("formats task IDs as IDENT-seqId", async () => {
    const project = makeProject({ identifier: "HQ" });
    mockedFindProject.mockResolvedValue(project);
    mockedListStates.mockResolvedValue([makeState({ id: "s1", name: "Todo" })]);
    mockedListIssues.mockResolvedValue([
      makeIssue({ sequence_id: 42, name: "Fix bug", state: "s1", priority: "high" }),
    ]);

    const tools = createPlaneTools(config);
    const result = (await tools.listTasks.execute!(
      { project_identifier: "HQ" } as any,
      {} as any
    )) as any;

    expect(result.tasks[0].id).toBe("HQ-42");
    expect(result.tasks[0].title).toBe("Fix bug");
    expect(result.tasks[0].state).toBe("Todo");
  });

  it("uses 'Unknown' for missing state", async () => {
    mockedFindProject.mockResolvedValue(makeProject());
    mockedListStates.mockResolvedValue([]);
    mockedListIssues.mockResolvedValue([makeIssue({ state: "unknown-state" })]);

    const tools = createPlaneTools(config);
    const result = (await tools.listTasks.execute!(
      { project_identifier: "HQ" } as any,
      {} as any
    )) as any;

    expect(result.tasks[0].state).toBe("Unknown");
  });

  it("returns error when project not found", async () => {
    mockedFindProject.mockResolvedValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.listTasks.execute!(
      { project_identifier: "NOPE" } as any,
      {} as any
    )) as any;

    expect(result.tasks).toEqual([]);
    expect(result.error).toContain("not found");
  });
});

describe("create_task tool", () => {
  it("returns formatted ID on success", async () => {
    const project = makeProject({ identifier: "HQ" });
    mockedFindProject.mockResolvedValue(project);
    mockedCreateIssue.mockResolvedValue(makeIssue({ sequence_id: 99, name: "New task" }));

    const tools = createPlaneTools(config);
    const result = (await tools.createTask.execute!(
      { project_identifier: "HQ", title: "New task", description_html: "<p>Desc</p>" } as any,
      {} as any
    )) as any;

    expect(result.id).toBe("HQ-99");
    expect(result.title).toBe("New task");
  });

  it("passes description_html to createIssue", async () => {
    mockedFindProject.mockResolvedValue(makeProject());
    mockedCreateIssue.mockResolvedValue(makeIssue());

    const tools = createPlaneTools(config);
    await tools.createTask.execute!(
      { project_identifier: "HQ", title: "T", description_html: "<p>HTML</p>" } as any,
      {} as any
    );

    expect(mockedCreateIssue).toHaveBeenCalledWith(config, "proj-uuid-1", "T", "<p>HTML</p>");
  });

  it("returns error when project not found", async () => {
    mockedFindProject.mockResolvedValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.createTask.execute!(
      { project_identifier: "BAD", title: "T", description_html: "" } as any,
      {} as any
    )) as any;

    expect(result.error).toContain("not found");
  });
});

describe("get_project_states tool", () => {
  it("returns states with groups", async () => {
    mockedFindProject.mockResolvedValue(makeProject());
    mockedListStates.mockResolvedValue([
      makeState({ name: "Todo", group: "unstarted" }),
      makeState({ name: "Done", group: "completed" }),
    ]);

    const tools = createPlaneTools(config);
    const result = (await tools.getProjectStates.execute!(
      { project_identifier: "HQ" } as any,
      {} as any
    )) as any;

    expect(result.states).toEqual([
      { name: "Todo", group: "unstarted" },
      { name: "Done", group: "completed" },
    ]);
  });

  it("returns error when project not found", async () => {
    mockedFindProject.mockResolvedValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.getProjectStates.execute!(
      { project_identifier: "BAD" } as any,
      {} as any
    )) as any;

    expect(result.states).toEqual([]);
    expect(result.error).toContain("not found");
  });
});

describe("list_tasks with state filtering", () => {
  it("filters by state names", async () => {
    const project = makeProject({ identifier: "HQ" });
    const states = [
      makeState({ id: "s1", name: "Plan Review" }),
      makeState({ id: "s2", name: "Done" }),
    ];
    mockedFindProject.mockResolvedValue(project);
    mockedListStates.mockResolvedValue(states);
    mockedListIssues.mockResolvedValue([makeIssue({ state: "s1" })]);

    const tools = createPlaneTools(config);
    await tools.listTasks.execute!(
      { project_identifier: "HQ", state_names: ["Plan Review"] } as any,
      {} as any
    );

    expect(mockedListIssues).toHaveBeenCalledWith(config, project.id, { stateIds: ["s1"] });
  });

  it("returns error when state not found", async () => {
    mockedFindProject.mockResolvedValue(makeProject());
    mockedListStates.mockResolvedValue([makeState({ name: "Todo" })]);

    const tools = createPlaneTools(config);
    const result = (await tools.listTasks.execute!(
      { project_identifier: "HQ", state_names: ["Invalid"] } as any,
      {} as any
    )) as any;

    expect(result.error).toContain("No matching states");
    expect(result.error).toContain("Available states");
  });
});

describe("get_task_details tool", () => {
  it("returns full task details", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject({ identifier: "HQ" }));
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue({ id: "issue-1" }));
    mockedGetIssue.mockResolvedValue(
      makeIssue({ name: "Test task", description_html: "<p>Details</p>" })
    );
    mockedBuildStateMap.mockResolvedValue(new Map([["state-uuid-1", "Todo"]]));

    const tools = createPlaneTools(config);
    const result = (await tools.getTaskDetails.execute!(
      { task_id: "HQ-42" } as any,
      {} as any
    )) as any;

    expect(result.id).toBe("HQ-42");
    expect(result.title).toBe("Test task");
    expect(result.description_html).toBe("<p>Details</p>");
    expect(result.state).toBe("Todo");
    expect(result.url).toContain("hq/issues/42");
  });

  it("returns error for invalid task ID format", async () => {
    mockedParseIssueIdentifier.mockReturnValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.getTaskDetails.execute!(
      { task_id: "invalid" } as any,
      {} as any
    )) as any;

    expect(result.error).toContain("Invalid task ID format");
  });

  it("returns error when task not found", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 999 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.getTaskDetails.execute!(
      { task_id: "HQ-999" } as any,
      {} as any
    )) as any;

    expect(result.error).toContain("not found");
  });
});

describe("list_task_comments tool", () => {
  it("returns formatted comments", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue({ id: "issue-1" }));
    mockedListIssueComments.mockResolvedValue([
      makeComment({
        id: "c1",
        comment_html: "<p>Comment 1</p>",
        actor_detail: { first_name: "John", last_name: "Doe", display_name: "John Doe" },
      }),
    ]);

    const tools = createPlaneTools(config);
    const result = (await tools.listTaskComments.execute!(
      { task_id: "HQ-42" } as any,
      {} as any
    )) as any;

    expect(result.comments).toHaveLength(1);
    expect(result.comments[0].comment_html).toBe("<p>Comment 1</p>");
    expect(result.comments[0].author).toBe("John Doe");
  });

  it("returns error for invalid task ID", async () => {
    mockedParseIssueIdentifier.mockReturnValue(null);

    const tools = createPlaneTools(config);
    const result = (await tools.listTaskComments.execute!(
      { task_id: "bad" } as any,
      {} as any
    )) as any;

    expect(result.comments).toEqual([]);
    expect(result.error).toContain("Invalid task ID format");
  });
});

describe("add_task_comment tool", () => {
  it("adds comment successfully", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue({ id: "issue-1" }));
    mockedAddIssueComment.mockResolvedValue(makeComment({ id: "new-comment" }));

    const tools = createPlaneTools(config);
    const result = (await tools.addTaskComment.execute!(
      { task_id: "HQ-42", comment_html: "<p>New comment</p>" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(true);
    expect(result.comment_id).toBe("new-comment");
    expect(mockedAddIssueComment).toHaveBeenCalledWith(
      config,
      "proj-uuid-1",
      "issue-1",
      "<p>New comment</p>"
    );
  });

  it("returns error when add fails", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue());
    mockedAddIssueComment.mockRejectedValue(new Error("API error"));

    const tools = createPlaneTools(config);
    const result = (await tools.addTaskComment.execute!(
      { task_id: "HQ-42", comment_html: "<p>Test</p>" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("API error");
  });
});

describe("move_task_state tool", () => {
  it("moves task to new state", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue({ id: "issue-1" }));
    mockedListStates.mockResolvedValue([
      makeState({ id: "s1", name: "Todo" }),
      makeState({ id: "s2", name: "Done" }),
    ]);
    mockedUpdateIssueState.mockResolvedValue(makeIssue({ state: "s2" }));

    const tools = createPlaneTools(config);
    const result = (await tools.moveTaskState.execute!(
      { task_id: "HQ-42", state_name: "Done" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(true);
    expect(result.new_state).toBe("Done");
    expect(mockedUpdateIssueState).toHaveBeenCalledWith(config, "proj-uuid-1", "issue-1", "s2");
  });

  it("is case-insensitive for state names", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue());
    mockedListStates.mockResolvedValue([makeState({ id: "s1", name: "Plan Review" })]);
    mockedUpdateIssueState.mockResolvedValue(makeIssue());

    const tools = createPlaneTools(config);
    const result = (await tools.moveTaskState.execute!(
      { task_id: "HQ-42", state_name: "plan review" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(true);
  });

  it("returns error when state not found", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue());
    mockedListStates.mockResolvedValue([makeState({ name: "Todo" })]);

    const tools = createPlaneTools(config);
    const result = (await tools.moveTaskState.execute!(
      { task_id: "HQ-42", state_name: "Invalid" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain('State "Invalid" not found');
    expect(result.error).toContain("Available states");
  });

  it("returns error when update fails", async () => {
    mockedParseIssueIdentifier.mockReturnValue({ projectIdentifier: "HQ", sequenceId: 42 });
    mockedFindProject.mockResolvedValue(makeProject());
    mockedFindIssueBySequenceId.mockResolvedValue(makeIssue());
    mockedListStates.mockResolvedValue([makeState({ id: "s1", name: "Done" })]);
    mockedUpdateIssueState.mockRejectedValue(new Error("Update failed"));

    const tools = createPlaneTools(config);
    const result = (await tools.moveTaskState.execute!(
      { task_id: "HQ-42", state_name: "Done" } as any,
      {} as any
    )) as any;

    expect(result.success).toBe(false);
    expect(result.error).toContain("Update failed");
  });
});
