import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:child_process", () => ({
  execFile: vi.fn(),
}));

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  appendFileSync: vi.fn(),
}));

import { execFile } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import {
  createWorktree,
  removeWorktree,
  listWorktrees,
  ensureWorktreeGitignore,
} from "../../worktree/manager.js";

const mockedExecFile = vi.mocked(execFile);
const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedAppendFileSync = vi.mocked(appendFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

// Helper to make execFile callback-based mock resolve
const mockGitSuccess = (stdout = "") => {
  mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
    callback(null, { stdout, stderr: "" });
    return undefined as any;
  });
};

const mockGitError = (message: string) => {
  mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
    callback(new Error(message), { stdout: "", stderr: message });
    return undefined as any;
  });
};

describe("createWorktree", () => {
  it("returns correct branch name", async () => {
    mockGitSuccess();
    const result = await createWorktree("/repos/hq", "HQ-42", "main");
    expect(result.branchName).toBe("agent/HQ-42");
  });

  it("returns correct worktree path", async () => {
    mockGitSuccess();
    const result = await createWorktree("/repos/hq", "HQ-42", "main");
    expect(result.worktreePath).toContain(".worktrees/agent-HQ-42");
  });

  it("fetches origin before creating worktree", async () => {
    const calls: string[][] = [];
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callback(null, { stdout: "", stderr: "" });
      return undefined as any;
    });

    await createWorktree("/repos/hq", "HQ-42", "main");

    // First call should be fetch
    expect(calls[0]).toContain("fetch");
    expect(calls[0]).toContain("origin");
    expect(calls[0]).toContain("main");

    // Second call should be worktree add
    expect(calls[1]).toContain("worktree");
    expect(calls[1]).toContain("add");
  });

  it("passes correct args to git worktree add", async () => {
    const calls: string[][] = [];
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callback(null, { stdout: "", stderr: "" });
      return undefined as any;
    });

    await createWorktree("/repos/hq", "HQ-42", "main");

    expect(calls[1]).toContain("-b");
    expect(calls[1]).toContain("agent/HQ-42");
    expect(calls[1]).toContain("origin/main");
  });
});

describe("removeWorktree", () => {
  it("calls worktree remove and branch delete", async () => {
    const calls: string[][] = [];
    mockedExecFile.mockImplementation((_cmd, args, callback: any) => {
      calls.push(args as string[]);
      callback(null, { stdout: "", stderr: "" });
      return undefined as any;
    });

    await removeWorktree("/repos/hq", "HQ-42");

    expect(calls.length).toBe(2);
    expect(calls[0]).toContain("worktree");
    expect(calls[0]).toContain("remove");
    expect(calls[1]).toContain("branch");
    expect(calls[1]).toContain("-D");
  });

  it("swallows worktree remove error", async () => {
    let callCount = 0;
    mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callCount++;
      if (callCount === 1) {
        callback(new Error("already removed"), { stdout: "", stderr: "" });
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
      return undefined as any;
    });

    // Should not throw
    await expect(removeWorktree("/repos/hq", "HQ-42")).resolves.toBeUndefined();
  });

  it("swallows branch delete error", async () => {
    let callCount = 0;
    mockedExecFile.mockImplementation((_cmd, _args, callback: any) => {
      callCount++;
      if (callCount === 2) {
        callback(new Error("branch not found"), { stdout: "", stderr: "" });
      } else {
        callback(null, { stdout: "", stderr: "" });
      }
      return undefined as any;
    });

    await expect(removeWorktree("/repos/hq", "HQ-42")).resolves.toBeUndefined();
  });
});

describe("listWorktrees", () => {
  it("parses porcelain output", async () => {
    const output = "worktree /repos/hq\n\nworktree /repos/hq/.worktrees/agent-HQ-42\nbranch refs/heads/agent/HQ-42\n";
    mockGitSuccess(output);

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
      "\n.worktrees/\n"
    );
  });

  it("creates .gitignore if it does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    ensureWorktreeGitignore("/repos/hq");
    expect(mockedAppendFileSync).toHaveBeenCalledWith(
      expect.stringContaining(".gitignore"),
      ".worktrees/\n"
    );
  });
});
