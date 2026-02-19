import { describe, it, expect, vi, beforeEach } from "vitest";
import { makePlaneConfig, makeProject, makeState, makeIssue, paginate } from "./fixtures/plane.js";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { listProjects, listStates, listIssues, createIssue, findProjectByIdentifier, buildStateMap } from "../plane.js";

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

    const [url] = mockFetch.mock.calls[0];
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

    const [url] = mockFetch.mock.calls[0];
    expect(url).toContain("state_group=");
    expect(url).toContain("per_page=50");
  });
});

describe("createIssue", () => {
  it("sends POST with name only (no description)", async () => {
    mockOk(makeIssue());
    await createIssue(config, "proj-1", "Test task");

    const [, init] = mockFetch.mock.calls[0];
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.name).toBe("Test task");
    expect(body).not.toHaveProperty("description_html");
  });

  it("sends POST with description_html when provided", async () => {
    mockOk(makeIssue());
    await createIssue(config, "proj-1", "Test task", "<p>Details</p>");

    const [, init] = mockFetch.mock.calls[0];
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
    const states = [
      makeState({ id: "s1", name: "Todo" }),
      makeState({ id: "s2", name: "Done" }),
    ];
    mockOk(paginate(states));

    const map = await buildStateMap(config, "proj-1");
    expect(map.get("s1")).toBe("Todo");
    expect(map.get("s2")).toBe("Done");
  });
});
