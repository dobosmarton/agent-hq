import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readdirSync: vi.fn(),
  readFileSync: vi.fn(),
}));

import { existsSync, readdirSync, readFileSync } from "node:fs";
import { readCiWorkflows } from "../../agent/ci-discovery";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReaddirSync = vi.mocked(readdirSync);
const mockedReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("readCiWorkflows", () => {
  it("returns workflow file contents when directory exists", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue(["ci.yml" as unknown as never]);
    mockedReadFileSync.mockReturnValue("name: CI\non: push\njobs: {}");

    const result = readCiWorkflows("/repos/my-app");

    expect(result.workflowFiles).toEqual({
      ".github/workflows/ci.yml": "name: CI\non: push\njobs: {}",
    });
    expect(result.overrideCommands).toBeUndefined();
  });

  it("reads both .yml and .yaml files", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      "ci.yml" as unknown as never,
      "deploy.yaml" as unknown as never,
    ]);
    mockedReadFileSync
      .mockReturnValueOnce("name: CI")
      .mockReturnValueOnce("name: Deploy");

    const result = readCiWorkflows("/repos/my-app");

    expect(Object.keys(result.workflowFiles)).toHaveLength(2);
    expect(result.workflowFiles[".github/workflows/ci.yml"]).toBe("name: CI");
    expect(result.workflowFiles[".github/workflows/deploy.yaml"]).toBe(
      "name: Deploy",
    );
  });

  it("returns empty map when directory does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const result = readCiWorkflows("/repos/my-app");

    expect(result.workflowFiles).toEqual({});
    expect(mockedReaddirSync).not.toHaveBeenCalled();
  });

  it("returns empty map when directory has no YAML files", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      "README.md" as unknown as never,
      "config.json" as unknown as never,
    ]);

    const result = readCiWorkflows("/repos/my-app");

    expect(result.workflowFiles).toEqual({});
    expect(mockedReadFileSync).not.toHaveBeenCalled();
  });

  it("skips files that fail to read", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      "ci.yml" as unknown as never,
      "broken.yml" as unknown as never,
    ]);
    mockedReadFileSync
      .mockReturnValueOnce("name: CI")
      .mockImplementationOnce(() => {
        throw new Error("Permission denied");
      });

    const result = readCiWorkflows("/repos/my-app");

    expect(Object.keys(result.workflowFiles)).toHaveLength(1);
    expect(result.workflowFiles[".github/workflows/ci.yml"]).toBe("name: CI");
  });

  it("stops reading when total content exceeds size limit", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockReturnValue([
      "big.yml" as unknown as never,
      "small.yml" as unknown as never,
    ]);
    // Create content that exceeds the 50KB limit
    const bigContent = "x".repeat(51_000);
    mockedReadFileSync.mockReturnValueOnce(bigContent);

    const result = readCiWorkflows("/repos/my-app");

    // The big file exceeds the limit, so it should be skipped
    expect(Object.keys(result.workflowFiles)).toHaveLength(0);
  });

  it("returns empty map when readdirSync fails", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReaddirSync.mockImplementation(() => {
      throw new Error("Not a directory");
    });

    const result = readCiWorkflows("/repos/my-app");

    expect(result.workflowFiles).toEqual({});
  });
});
