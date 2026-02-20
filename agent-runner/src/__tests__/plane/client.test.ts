import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePlaneConfig } from "../fixtures/config.js";
import {
  makeProject,
  makeState,
  makeIssue,
  makeLabel,
  makeComment,
  paginate,
} from "../fixtures/plane.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import {
  listProjects,
  findProjectByIdentifier,
  listStates,
  buildStateMap,
  findStateByGroupAndName,
  listLabels,
  findLabelByName,
  listIssues,
  updateIssue,
  addComment,
  addLink,
} from "../../plane/client.js";

const config = makePlaneConfig();

beforeEach(() => {
  mockFetch.mockReset();
});

const mockOk = (data: unknown) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  });

const mockError = (status: number, body: string) =>
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status,
    text: () => Promise.resolve(body),
  });

describe("listProjects", () => {
  it("returns parsed projects", async () => {
    const project = makeProject();
    mockOk(paginate([project]));

    const result = await listProjects(config);
    expect(result).toEqual([project]);
  });

  it("sends correct headers", async () => {
    mockOk(paginate([]));
    await listProjects(config);

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.headers["X-API-Key"]).toBe("test-api-key");
  });

  it("constructs correct URL", async () => {
    mockOk(paginate([]));
    await listProjects(config);

    const url = mockFetch.mock.calls[0]?.[0];
    expect(url).toBe("http://localhost/api/v1/workspaces/test-ws/projects/");
  });

  it("throws on non-OK response", async () => {
    mockError(500, "Internal Server Error");
    await expect(listProjects(config)).rejects.toThrow(
      "Plane API error: 500 Internal Server Error",
    );
  });
});

describe("findProjectByIdentifier", () => {
  it("finds project case-insensitively", async () => {
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

describe("listStates", () => {
  it("returns parsed states", async () => {
    const state = makeState();
    mockOk(paginate([state]));

    const result = await listStates(config, "proj-1");
    expect(result).toEqual([state]);
  });

  it("includes projectId in URL", async () => {
    mockOk(paginate([]));
    await listStates(config, "proj-123");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/projects/proj-123/states/");
  });
});

describe("buildStateMap", () => {
  it("builds Map<id, PlaneState>", async () => {
    const states = [
      makeState({ id: "s1", name: "Todo", group: "unstarted" }),
      makeState({ id: "s2", name: "Done", group: "completed" }),
    ];
    mockOk(paginate(states));

    const map = await buildStateMap(config, "proj-1");
    expect(map.get("s1")).toEqual(states[0]);
    expect(map.get("s2")).toEqual(states[1]);
  });
});

describe("findStateByGroupAndName", () => {
  it("finds by group only", async () => {
    const state = makeState({ group: "unstarted", name: "Todo" });
    mockOk(paginate([state]));

    const result = await findStateByGroupAndName(config, "proj-1", "unstarted");
    expect(result).toEqual(state);
  });

  it("finds by group and name (case-insensitive)", async () => {
    const states = [
      makeState({ id: "s1", group: "started", name: "In Progress" }),
      makeState({ id: "s2", group: "started", name: "In Review" }),
    ];
    mockOk(paginate(states));

    const result = await findStateByGroupAndName(
      config,
      "proj-1",
      "started",
      "in review",
    );
    expect(result?.id).toBe("s2");
  });

  it("returns null when no match", async () => {
    mockOk(paginate([makeState({ group: "unstarted" })]));

    const result = await findStateByGroupAndName(
      config,
      "proj-1",
      "nonexistent",
    );
    expect(result).toBeNull();
  });
});

describe("listLabels / findLabelByName", () => {
  it("finds label case-insensitively", async () => {
    const label = makeLabel({ name: "Agent" });
    mockOk(paginate([label]));

    const result = await findLabelByName(config, "proj-1", "agent");
    expect(result).toEqual(label);
  });

  it("returns null when label not found", async () => {
    mockOk(paginate([makeLabel({ name: "Agent" })]));

    const result = await findLabelByName(config, "proj-1", "nope");
    expect(result).toBeNull();
  });
});

describe("listIssues", () => {
  it("includes per_page=50 by default", async () => {
    mockOk(paginate([]));
    await listIssues(config, "proj-1");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("per_page=50");
  });

  it("merges custom params", async () => {
    mockOk(paginate([]));
    await listIssues(config, "proj-1", { state: "state-123" });

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toContain("state=state-123");
  });

  it("returns parsed issues", async () => {
    const issue = makeIssue();
    mockOk(paginate([issue]));

    const result = await listIssues(config, "proj-1");
    expect(result).toEqual([issue]);
  });
});

describe("updateIssue", () => {
  it("sends PATCH with update body", async () => {
    mockOk(makeIssue());
    await updateIssue(config, "proj-1", "issue-1", { state: "new-state" });

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe("PATCH");
    expect(JSON.parse(init.body)).toEqual({ state: "new-state" });
  });

  it("returns parsed issue", async () => {
    const issue = makeIssue({ id: "updated" });
    mockOk(issue);

    const result = await updateIssue(config, "proj-1", "issue-1", {
      state: "s",
    });
    expect(result.id).toBe("updated");
  });
});

describe("addComment", () => {
  it("sends POST with comment_html body", async () => {
    mockOk(makeComment());
    await addComment(config, "proj-1", "issue-1", "<p>Update</p>");

    const [, init] = mockFetch.mock.calls[0]!;
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({ comment_html: "<p>Update</p>" });
  });

  it("returns parsed comment", async () => {
    const comment = makeComment({ id: "c-1" });
    mockOk(comment);

    const result = await addComment(config, "proj-1", "issue-1", "<p>Hi</p>");
    expect(result.id).toBe("c-1");
  });
});

describe("addLink", () => {
  it("sends POST with title and url body", async () => {
    mockOk({ id: "link-1", title: "PR", url: "https://github.com/pr/1" });
    await addLink(config, "proj-1", "issue-1", "PR", "https://github.com/pr/1");

    const [url, init] = mockFetch.mock.calls[0]!;
    expect(url).toContain("/issues/issue-1/links/");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body)).toEqual({
      title: "PR",
      url: "https://github.com/pr/1",
    });
  });

  it("returns parsed link", async () => {
    mockOk({ id: "link-1", title: "PR", url: "https://github.com/pr/1" });

    const result = await addLink(
      config,
      "proj-1",
      "issue-1",
      "PR",
      "https://github.com/pr/1",
    );
    expect(result.id).toBe("link-1");
    expect(result.url).toBe("https://github.com/pr/1");
  });
});
