import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

vi.mock("node:fs");
vi.mock("node:os");
vi.mock("node:path");
vi.mock("node:crypto", () => ({
  randomUUID: () => "test-uuid-1234",
}));

import {
  addProjectToConfig,
  readAgentConfig,
  writeAgentConfig,
  type AgentConfig,
  type ProjectEntry,
} from "../../config/config-manager";

const mockExistsSync = vi.mocked(existsSync);
const mockReadFileSync = vi.mocked(readFileSync);
const mockWriteFileSync = vi.mocked(writeFileSync);
const mockRenameSync = vi.mocked(renameSync);
const mockTmpdir = vi.mocked(tmpdir);
const mockJoin = vi.mocked(join);

const sampleConfig: AgentConfig = {
  plane: { baseUrl: "http://localhost:8000", workspaceSlug: "test" },
  projects: {
    EXISTING: {
      repoPath: "/repos/existing",
      repoUrl: "https://github.com/owner/existing",
      defaultBranch: "main",
      planeProjectId: "abc-123",
      planeIdentifier: "EXISTING",
    },
  },
};

const sampleEntry: ProjectEntry = {
  repoPath: "/repos/newrepo",
  repoUrl: "https://github.com/owner/newrepo",
  defaultBranch: "main",
  planeProjectId: "def-456",
  planeIdentifier: "NEWREPO",
};

beforeEach(() => {
  vi.clearAllMocks();
  mockTmpdir.mockReturnValue("/tmp");
  mockJoin.mockImplementation((...parts) => parts.join("/"));
});

describe("readAgentConfig", () => {
  it("returns null when file does not exist", () => {
    mockExistsSync.mockReturnValue(false);

    const result = readAgentConfig("/path/to/config.json");

    expect(result).toBeNull();
  });

  it("returns parsed config when file is valid", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(JSON.stringify(sampleConfig));

    const result = readAgentConfig("/path/to/config.json");

    expect(result).not.toBeNull();
    expect(result?.projects).toHaveProperty("EXISTING");
  });

  it("returns null when file contains invalid JSON", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue("{ invalid json }");

    const result = readAgentConfig("/path/to/config.json");

    expect(result).toBeNull();
  });

  it("returns null when file content is not an object", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue('"just a string"');

    const result = readAgentConfig("/path/to/config.json");

    expect(result).toBeNull();
  });

  it("initializes projects as empty object when missing", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ plane: { baseUrl: "x", workspaceSlug: "y" } })
    );

    const result = readAgentConfig("/path/to/config.json");

    expect(result).not.toBeNull();
    expect(result?.projects).toEqual({});
  });

  it("preserves unknown top-level fields", () => {
    mockExistsSync.mockReturnValue(true);
    mockReadFileSync.mockReturnValue(
      JSON.stringify({ ...sampleConfig, someOtherField: "preserved" })
    );

    const result = readAgentConfig("/path/to/config.json");

    expect(result?.someOtherField).toBe("preserved");
  });
});

describe("addProjectToConfig", () => {
  it("adds a new project entry", () => {
    const { config: updated, status } = addProjectToConfig(sampleConfig, "NEWREPO", sampleEntry);

    expect(status).toBe("added");
    expect(updated.projects).toHaveProperty("NEWREPO");
    expect(updated.projects["NEWREPO"]).toEqual(sampleEntry);
  });

  it("does not overwrite an existing identifier", () => {
    const { config: updated, status } = addProjectToConfig(sampleConfig, "EXISTING", sampleEntry);

    expect(status).toBe("already_exists");
    expect(updated.projects["EXISTING"]?.repoPath).toBe("/repos/existing");
  });

  it("does not mutate the original config", () => {
    const original = structuredClone(sampleConfig);
    addProjectToConfig(sampleConfig, "NEWREPO", sampleEntry);

    expect(sampleConfig.projects).toEqual(original.projects);
  });

  it("preserves existing projects when adding new one", () => {
    const { config: updated } = addProjectToConfig(sampleConfig, "NEWREPO", sampleEntry);

    expect(updated.projects).toHaveProperty("EXISTING");
    expect(updated.projects).toHaveProperty("NEWREPO");
  });
});

describe("writeAgentConfig", () => {
  it("writes to a temp file and renames atomically", () => {
    mockWriteFileSync.mockReturnValue(undefined);
    mockRenameSync.mockReturnValue(undefined);

    writeAgentConfig("/path/to/config.json", sampleConfig);

    expect(mockWriteFileSync).toHaveBeenCalledWith(
      "/tmp/agent-config-test-uuid-1234.json",
      JSON.stringify(sampleConfig, null, 2),
      "utf-8"
    );
    expect(mockRenameSync).toHaveBeenCalledWith(
      "/tmp/agent-config-test-uuid-1234.json",
      "/path/to/config.json"
    );
  });

  it("throws if writeFileSync fails", () => {
    mockWriteFileSync.mockImplementation(() => {
      throw new Error("disk full");
    });

    expect(() => writeAgentConfig("/path/to/config.json", sampleConfig)).toThrow("disk full");
  });
});
