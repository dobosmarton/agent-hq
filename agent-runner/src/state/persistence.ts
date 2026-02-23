import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname } from "node:path";
import type { RunnerState } from "../types.js";

const DEFAULT_STATE: RunnerState = {
  activeAgents: {},
  dailySpendUsd: 0,
  dailySpendDate: new Date().toISOString().slice(0, 10),
};

export type StatePersistence = ReturnType<typeof createStatePersistence>;

export const createStatePersistence = (statePath: string) => {
  const load = (): RunnerState => {
    if (!existsSync(statePath)) {
      return { ...DEFAULT_STATE };
    }
    try {
      const raw = readFileSync(statePath, "utf-8");
      return JSON.parse(raw) as RunnerState;
    } catch {
      return { ...DEFAULT_STATE };
    }
  };

  const save = (state: RunnerState): void => {
    const dir = dirname(statePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(statePath, JSON.stringify(state, null, 2));
  };

  return { load, save };
};
