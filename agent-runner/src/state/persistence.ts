import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import type { RunnerState } from "../types.js";
import type { SerializedCache } from "../cache/types.js";

const DEFAULT_STATE: RunnerState = {
  activeAgents: {},
  dailySpendUsd: 0,
  dailySpendDate: new Date().toISOString().slice(0, 10),
};

export type StatePersistence = ReturnType<typeof createStatePersistence>;

export const createStatePersistence = (statePath: string) => {
  const cacheFilePath = join(dirname(statePath), "context-cache.json");

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

  const loadCache = (): SerializedCache | null => {
    if (!existsSync(cacheFilePath)) {
      return null;
    }
    try {
      const raw = readFileSync(cacheFilePath, "utf-8");
      return JSON.parse(raw) as SerializedCache;
    } catch (err) {
      console.warn("[Persistence] Failed to load cache, starting fresh:", err);
      return null;
    }
  };

  const saveCache = (cache: SerializedCache): void => {
    const dir = dirname(cacheFilePath);
    if (!existsSync(dir)) {
      mkdirSync(dir, { recursive: true });
    }
    writeFileSync(cacheFilePath, JSON.stringify(cache, null, 2));
  };

  return { load, save, loadCache, saveCache };
};
