import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { appendFileSync, existsSync, readFileSync } from "node:fs";
import {
  createWorktree,
  ensureWorktreeGitignore,
  listWorktrees,
  removeWorktree,
} from "../../worktree/manager";

const mockedExecFile = vi.mocked(execFile);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedAppendFileSync = vi.mocked(appendFileSync);

beforeEach(() => {
  vi.resetAllMocks();
  // Default: worktree path does not exist
  mockedExistsSync.mockReturnValue(false);
});

// Helper: mock git calls in sequence
// For createWorktree happy path: fetch, pull, rev-parse (fail), worktree add
const mockGitSequence = (
  responses: Array<{ stdout?: string; error?: Error }>,
) => {
  let callIndex = 0;
  mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
    const response = responses[callIndex] ?? { stdout: "" };
    callIndex++;
    if (response.error) {
      callback(response.error, { stdout: "", stderr: response.error.message });
    } else {
      callback(null, { stdout: response.stdout ?? "", stderr: "" });
    }
    return undefined as any;
  });
};

// Happy path: fetch ok, pull ok, rev-parse fails (branch doesn't exist), worktree add ok
const mockCreateHappyPath = () => {
  mockGitSequence([
    { stdout: "" }, // fetch
    { stdout: "" }, // pull
    { error: new Error("fatal: Needed a single revision") }, // rev-parse (no branch)
    { stdout: "" }, // worktree add
  ]);
};

describe("createWorktree", () => {
  it("returns correct branch name", async () => {
    mockCreateHappyPath();
    const result = await createWorktree("/repos/hq", "HQ-42", "main");
    expect(result.branchName).toBe("agent/HQ-42");
  });

  it("returns correct worktree path", async () => {
    mockCreateHappyPath();
    const result = await createWorktree("/repos/hq", "HQ-42", "main");
    expect(result.worktreePath).toContain(".worktrees/agent-HQ-42");
  });

  it("fetches and pulls main before creating worktree", async () => {
    const calls: string[][] = [];
    let callIndex = 0;
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callIndex++;
      // rev-parse (3rd call) should fail — branch doesn't exist
      if (callIndex === 3) {
        callback(new Error("fatal: Needed a single revision"), {
          stdout: "",
          stderr: "",
        });
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
      return undefined as any;
    });

    await createWorktree("/repos/hq", "HQ-42", "main");

    // 1st call: fetch
    expect(calls[0]).toContain("fetch");
    expect(calls[0]).toContain("origin");
    expect(calls[0]).toContain("main");

    // 2nd call: pull
    expect(calls[1]).toContain("pull");
    expect(calls[1]).toContain("origin");
    expect(calls[1]).toContain("main");

    // 3rd call: rev-parse (branch check)
    expect(calls[2]).toContain("rev-parse");
    expect(calls[2]).toContain("--verify");
    expect(calls[2]).toContain("agent/HQ-42");

    // 4th call: worktree add
    expect(calls[3]).toContain("worktree");
    expect(calls[3]).toContain("add");
  });

  it("passes correct args to git worktree add", async () => {
    const calls: string[][] = [];
    let callIndex = 0;
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callIndex++;
      if (callIndex === 3) {
        callback(new Error("fatal: Needed a single revision"), {
          stdout: "",
          stderr: "",
        });
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
      return undefined as any;
    });

    await createWorktree("/repos/hq", "HQ-42", "main");

    // worktree add is the 4th call (index 3)
    expect(calls[3]).toContain("-b");
    expect(calls[3]).toContain("agent/HQ-42");
    expect(calls[3]).toContain("origin/main");
  });

  it("throws if worktree path already exists", async () => {
    mockedExistsSync.mockReturnValue(true);
    mockGitSequence([
      { stdout: "" }, // fetch
      { stdout: "" }, // pull
    ]);

    await expect(createWorktree("/repos/hq", "HQ-42", "main")).rejects.toThrow(
      "Worktree already exists",
    );
  });

  it("throws if branch already exists", async () => {
    mockGitSequence([
      { stdout: "" }, // fetch
      { stdout: "" }, // pull
      { stdout: "abc123" }, // rev-parse succeeds — branch exists
    ]);

    await expect(createWorktree("/repos/hq", "HQ-42", "main")).rejects.toThrow(
      "Branch agent/HQ-42 already exists",
    );
  });
});

describe("removeWorktree", () => {
  it("calls worktree remove without deleting branch", async () => {
    const calls: string[][] = [];
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callback(null, { stdout: "", stderr: "" });
      return undefined as any;
    });

    await removeWorktree("/repos/hq", "HQ-42");

    expect(calls.length).toBe(1);
    expect(calls[0]).toContain("worktree");
    expect(calls[0]).toContain("remove");
  });

  it("swallows worktree remove error", async () => {
    mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callback(new Error("already removed"), { stdout: "", stderr: "" });
      return undefined as any;
    });

    await expect(removeWorktree("/repos/hq", "HQ-42")).resolves.toBeUndefined();
  });
});

describe("listWorktrees", () => {
  it("parses porcelain output", async () => {
    const output =
      "worktree /repos/hq\n\nworktree /repos/hq/.worktrees/agent-HQ-42\nbranch refs/heads/agent/HQ-42\n";
    mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callback(null, { stdout: output, stderr: "" });
      return undefined as any;
    });

    const paths = await listWorktrees("/repos/hq");
    expect(paths).toEqual(["/repos/hq", "/repos/hq/.worktrees/agent-HQ-42"]);
  });
});

describe("ensureWorktreeGitignore", () => {
  it("skips if .gitignore already has entry", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("node_modules/\n.worktrees/\n");

    ensureWorktreeGitignore("/repos/hq");
    expect(mockedAppendFileSync).not.toHaveBeenCalled();
  });

  it("appends if .gitignore exists but missing entry", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("node_modules/\n");

    ensureWorktreeGitignore("/repos/hq");
    expect(mockedAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".gitignore"),
      "\n.worktrees/\n",
    );
  });

  it("creates .gitignore if it does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    ensureWorktreeGitignore("/repos/hq");
    expect(mockedAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".gitignore"),
      ".worktrees/\n",
    );
  });
});
