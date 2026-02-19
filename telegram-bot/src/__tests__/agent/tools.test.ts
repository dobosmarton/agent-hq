import { describe, it, expect, vi, beforeEach } from "vitest";
import { makeProject, makeIssue, makeState, makePlaneConfig } from "../fixtures/plane.js";

vi.mock("../../plane.js", () => ({
  listProjects: vi.fn(),
  findProjectByIdentifier: vi.fn(),
  listIssues: vi.fn(),
  buildStateMap: vi.fn(),
  createIssue: vi.fn(),
  listStates: vi.fn(),
}));

import {
  listProjects,
  findProjectByIdentifier,
  listIssues,
  buildStateMap,
  createIssue,
  listStates,
} from "../../plane.js";
import { createPlaneTools } from "../../agent/tools.js";

const mockedListProjects = vi.mocked(listProjects);
const mockedFindProject = vi.mocked(findProjectByIdentifier);
const mockedListIssues = vi.mocked(listIssues);
const mockedBuildStateMap = vi.mocked(buildStateMap);
const mockedCreateIssue = vi.mocked(createIssue);
const mockedListStates = vi.mocked(listStates);

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
    mockedListIssues.mockResolvedValue([
      makeIssue({ sequence_id: 42, name: "Fix bug", state: "s1", priority: "high" }),
    ]);
    mockedBuildStateMap.mockResolvedValue(new Map([["s1", "Todo"]]));

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
    mockedListIssues.mockResolvedValue([
      makeIssue({ state: "unknown-state" }),
    ]);
    mockedBuildStateMap.mockResolvedValue(new Map());

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
    mockedCreateIssue.mockResolvedValue(
      makeIssue({ sequence_id: 99, name: "New task" })
    );

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

    expect(mockedCreateIssue).toHaveBeenCalledWith(
      config,
      "proj-uuid-1",
      "T",
      "<p>HTML</p>"
    );
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
