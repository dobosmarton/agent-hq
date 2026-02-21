import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  makeComment,
  makeIssue,
  makePlaneConfig,
  makeProject,
  makeState,
  paginate,
} from "./fixtures/plane";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

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
} from "../plane";

const config = makePlaneConfig();

beforeEach(() => {
  mockFetch.mockReset();
});

const mockOk = (data: unknown) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    statusText: "OK",
  });

const mockError = (status: number, statusText: string) =>
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    statusText,
    text: () => Promise.resolve("error body"),
  });

describe("listProjects", () => {
  it("returns parsed projects", async () => {
    const project = makeProject();
    mockOk(paginate([project]));

    const result = await listProjects(config);
    expect(result).toEqual([project]);
  });

  it("throws on non-OK response", async () => {
    mockError(500, "Server Error");
    await expect(listProjects(config)).rejects.toThrow("Plane API error: 500 Server Error");
  });

  it("constructs correct URL", async () => {
    mockOk(paginate([]));
    await listProjects(config);

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost/api/v1/workspaces/test-ws/projects/");
  });

  it("sends correct headers", async () => {
    mockOk(paginate([]));
    await listProjects(config);

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers["X-API-Key"]).toBe("test-api-key");
  });
});

describe("listStates", () => {
  it("returns parsed states", async () => {
    const state = makeState();
    mockOk(paginate([state]));

    const result = await listStates(config, "proj-1");
    expect(result).toEqual([state]);
  });
});

describe("listIssues", () => {
  it("includes state_group and per_page params", async () => {
    mockOk(paginate([]));
    await listIssues(config, "proj-1");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("state_group=");
    expect(url).toContain("per_page=50");
  });
});

describe("createIssue", () => {
  it("sends POST with name only (no description)", async () => {
    mockOk(makeIssue());
    await createIssue(config, "proj-1", "Test task");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Test task");
    expect(body).not.toHaveProperty("description_html");
  });

  it("sends POST with description_html when provided", async () => {
    mockOk(makeIssue());
    await createIssue(config, "proj-1", "Test task", "<p>Details</p>");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.description_html).toBe("<p>Details</p>");
  });

  it("throws with error body on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Validation failed"),
    });

    await expect(createIssue(config, "proj-1", "Bad task")).rejects.toThrow(
      "Plane API error: 422 Validation failed"
    );
  });

  it("returns parsed issue", async () => {
    const issue = makeIssue({ id: "new-1" });
    mockOk(issue);

    const result = await createIssue(config, "proj-1", "Test");
    expect(result.id).toBe("new-1");
  });
});

describe("findProjectByIdentifier", () => {
  it("finds case-insensitively", async () => {
    const project = makeProject({ identifier: "HQ" });
    mockOk(paginate([project]));

    const result = await findProjectByIdentifier(config, "hq");
    expect(result).toEqual(project);
  });

  it("returns null when not found", async () => {
    mockOk(paginate([makeProject({ identifier: "HQ" })]));

    const result = await findProjectByIdentifier(config, "NOPE");
    expect(result).toBeNull();
  });
});

describe("buildStateMap", () => {
  it("builds Map<id, name>", async () => {
    const states = [makeState({ id: "s1", name: "Todo" }), makeState({ id: "s2", name: "Done" })];
    mockOk(paginate(states));

    const map = await buildStateMap(config, "proj-1");
    expect(map.get("s1")).toBe("Todo");
    expect(map.get("s2")).toBe("Done");
  });
});

describe("parseIssueIdentifier", () => {
  it("parses valid task ID", () => {
    const result = parseIssueIdentifier("VERDANDI-5");
    expect(result).toEqual({ projectIdentifier: "VERDANDI", sequenceId: 5 });
  });

  it("handles lowercase", () => {
    const result = parseIssueIdentifier("hq-42");
    expect(result).toEqual({ projectIdentifier: "HQ", sequenceId: 42 });
  });

  it("returns null for invalid format", () => {
    expect(parseIssueIdentifier("invalid")).toBeNull();
    expect(parseIssueIdentifier("NO-DASH")).toBeNull();
    expect(parseIssueIdentifier("123-456")).toBeNull();
  });
});

describe("findIssueBySequenceId", () => {
  it("finds issue by sequence_id", async () => {
    const issues = [makeIssue({ sequence_id: 5 }), makeIssue({ id: "i2", sequence_id: 10 })];
    mockOk(paginate(issues));

    const result = await findIssueBySequenceId(config, "proj-1", 5);
    expect(result?.id).toBe("issue-uuid-1");
  });

  it("returns null when not found", async () => {
    mockOk(paginate([makeIssue({ sequence_id: 10 })]));

    const result = await findIssueBySequenceId(config, "proj-1", 999);
    expect(result).toBeNull();
  });
});

describe("getIssue", () => {
  it("fetches full issue details", async () => {
    const issue = makeIssue({ description_html: "<p>Full description</p>" });
    mockOk(issue);

    const result = await getIssue(config, "proj-1", "issue-1");
    expect(result.description_html).toBe("<p>Full description</p>");
  });

  it("constructs correct URL", async () => {
    mockOk(makeIssue());
    await getIssue(config, "proj-1", "issue-1");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("http://localhost/api/v1/workspaces/test-ws/projects/proj-1/issues/issue-1/");
  });
});

describe("listIssueComments", () => {
  it("returns parsed comments", async () => {
    const comment = makeComment();
    mockOk(paginate([comment]));

    const result = await listIssueComments(config, "proj-1", "issue-1");
    expect(result).toEqual([comment]);
  });

  it("constructs correct URL", async () => {
    mockOk(paginate([]));
    await listIssueComments(config, "proj-1", "issue-1");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe(
      "http://localhost/api/v1/workspaces/test-ws/projects/proj-1/issues/issue-1/comments/"
    );
  });
});

describe("addIssueComment", () => {
  it("sends POST with comment_html", async () => {
    mockOk(makeComment());
    await addIssueComment(config, "proj-1", "issue-1", "<p>New comment</p>");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.comment_html).toBe("<p>New comment</p>");
  });

  it("returns parsed comment", async () => {
    const comment = makeComment({ id: "new-comment" });
    mockOk(comment);

    const result = await addIssueComment(config, "proj-1", "issue-1", "<p>Test</p>");
    expect(result.id).toBe("new-comment");
  });

  it("throws with error body on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 422,
      text: () => Promise.resolve("Validation failed"),
    });

    await expect(addIssueComment(config, "proj-1", "issue-1", "")).rejects.toThrow(
      "Plane API error: 422 Validation failed"
    );
  });
});

describe("updateIssueState", () => {
  it("sends PATCH with state", async () => {
    mockOk(makeIssue());
    await updateIssueState(config, "proj-1", "issue-1", "state-new");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe("PATCH");
    const body = JSON.parse(init.body);
    expect(body.state).toBe("state-new");
  });

  it("returns updated issue", async () => {
    const issue = makeIssue({ state: "state-done" });
    mockOk(issue);

    const result = await updateIssueState(config, "proj-1", "issue-1", "state-done");
    expect(result.state).toBe("state-done");
  });

  it("throws with error body on failure", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 400,
      text: () => Promise.resolve("Invalid state"),
    });

    await expect(updateIssueState(config, "proj-1", "issue-1", "bad")).rejects.toThrow(
      "Plane API error: 400 Invalid state"
    );
  });
});

describe("listIssues with state filtering", () => {
  it("uses state_group by default", async () => {
    mockOk(paginate([]));
    await listIssues(config, "proj-1");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("state_group=");
  });

  it("uses state parameter when stateIds provided", async () => {
    mockOk(paginate([]));
    await listIssues(config, "proj-1", { stateIds: ["s1", "s2"] });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("state=s1%2Cs2");
    expect(url).not.toContain("state_group");
  });
});
