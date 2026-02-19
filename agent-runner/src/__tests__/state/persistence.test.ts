import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("node:fs", () => ({
  existsSync: vi.fn(),
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  mkdirSync: vi.fn(),
}));

import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { createStatePersistence } from "../../state/persistence.js";
import type { RunnerState } from "../../types.js";

const mockedExistsSync = vi.mocked(existsSync);
const mockedReadFileSync = vi.mocked(readFileSync);
const mockedWriteFileSync = vi.mocked(writeFileSync);
const mockedMkdirSync = vi.mocked(mkdirSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("load", () => {
  it("returns defaults when file does not exist", () => {
    mockedExistsSync.mockReturnValue(false);
    const persistence = createStatePersistence("/tmp/test/state.json");

    const state = persistence.load();
    expect(state.activeAgents).toEqual({});
    expect(state.dailySpendUsd).toBe(0);
    expect(state.dailySpendDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("parses valid JSON file", () => {
    const savedState: RunnerState = {
      activeAgents: {},
      dailySpendUsd: 3.5,
      dailySpendDate: "2026-02-19",
    };
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue(JSON.stringify(savedState));

    const persistence = createStatePersistence("/tmp/test/state.json");
    const state = persistence.load();
    expect(state.dailySpendUsd).toBe(3.5);
    expect(state.dailySpendDate).toBe("2026-02-19");
  });

  it("returns defaults on corrupted JSON", () => {
    mockedExistsSync.mockReturnValue(true);
    mockedReadFileSync.mockReturnValue("{{not valid json");

    const persistence = createStatePersistence("/tmp/test/state.json");
    const state = persistence.load();
    expect(state.activeAgents).toEqual({});
    expect(state.dailySpendUsd).toBe(0);
  });
});

describe("save", () => {
  it("creates directory if it does not exist", () => {
    mockedExistsSync.mockReturnValue(false);

    const persistence = createStatePersistence("/tmp/newdir/state.json");
    const state: RunnerState = { activeAgents: {}, dailySpendUsd: 0, dailySpendDate: "2026-02-19" };
    persistence.save(state);

    expect(mockedMkdirSync).toHaveBeenCalledWith("/tmp/newdir", { recursive: true });
  });

  it("does not create directory if it exists", () => {
    mockedExistsSync.mockReturnValue(true);

    const persistence = createStatePersistence("/tmp/existing/state.json");
    const state: RunnerState = { activeAgents: {}, dailySpendUsd: 0, dailySpendDate: "2026-02-19" };
    persistence.save(state);

    expect(mockedMkdirSync).not.toHaveBeenCalled();
  });

  it("writes pretty-printed JSON", () => {
    mockedExistsSync.mockReturnValue(true);

    const persistence = createStatePersistence("/tmp/test/state.json");
    const state: RunnerState = { activeAgents: {}, dailySpendUsd: 1.5, dailySpendDate: "2026-02-19" };
    persistence.save(state);

    expect(mockedWriteFileSync).toHaveBeenCalledWith(
      "/tmp/test/state.json",
      JSON.stringify(state, null, 2)
    );
  });
});
