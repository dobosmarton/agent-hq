import { beforeEach, describe, expect, it, vi } from "vitest";

// We test the Zod schemas directly by importing and parsing,
// and test loadConfig by mocking fs
vi.mock("node:fs", () => ({
  readFileSync: vi.fn(),
}));

import { readFileSync } from "node:fs";
import { buildPlaneConfig, loadConfig, loadEnv } from "../config";
import { makeConfig, makeEnv } from "./fixtures/config";

const mockedReadFileSync = vi.mocked(readFileSync);

beforeEach(() => {
  vi.resetAllMocks();
});

describe("loadConfig", () => {
  it("parses a valid config file", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
        },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    const config = loadConfig("/fake/config.json");
    expect(config.plane.baseUrl).toBe("http://plane.local/api/v1");
    expect(config.projects["HQ"]!.defaultBranch).toBe("main"); // default
    expect(config.agent.maxConcurrent).toBe(2); // default
  });

  it("applies agent defaults when agent key is omitted", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {},
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    const config = loadConfig("/fake/config.json");
    expect(config.agent).toEqual({
      maxConcurrent: 2,
      maxBudgetPerTask: 5,
      maxDailyBudget: 20,
      maxTurns: 200,
      pollIntervalMs: 30000,
      spawnDelayMs: 15000,
      maxRetries: 2,
      retryBaseDelayMs: 60000,
      labelName: "agent",
      skills: {
        enabled: true,
        maxSkillsPerPrompt: 10,
        globalSkillsPath: "skills/global",
      },
    });
  });

  it("throws on missing workspaceSlug", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1" },
      projects: {},
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    expect(() => loadConfig("/fake/config.json")).toThrow();
  });

  it("throws on invalid project repoUrl", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: { repoPath: "/repos/hq", repoUrl: "not-a-url" },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    expect(() => loadConfig("/fake/config.json")).toThrow();
  });

  it("defaults project defaultBranch to 'main'", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
        },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    const config = loadConfig("/fake/config.json");
    expect(config.projects["HQ"]!.defaultBranch).toBe("main");
  });

  it("parses ciChecks when provided", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
          ciChecks: ["pnpm lint", "pnpm test"],
        },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    const config = loadConfig("/fake/config.json");
    expect(config.projects["HQ"]!.ciChecks).toEqual(["pnpm lint", "pnpm test"]);
  });

  it("allows ciChecks to be omitted", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
        },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    const config = loadConfig("/fake/config.json");
    expect(config.projects["HQ"]!.ciChecks).toBeUndefined();
  });

  it("throws when ciChecks contains non-strings", () => {
    const rawConfig = {
      plane: { baseUrl: "http://plane.local/api/v1", workspaceSlug: "ws" },
      projects: {
        HQ: {
          repoPath: "/repos/hq",
          repoUrl: "https://github.com/test/hq",
          ciChecks: [123, true],
        },
      },
    };
    mockedReadFileSync.mockReturnValue(JSON.stringify(rawConfig));

    expect(() => loadConfig("/fake/config.json")).toThrow();
  });
});

describe("loadEnv", () => {
  it("parses valid environment variables", () => {
    const original = { ...process.env };
    process.env.PLANE_API_KEY = "key";
    process.env.ANTHROPIC_API_KEY = "akey";
    process.env.GITHUB_PAT = "pat";

    const env = loadEnv();
    expect(env.PLANE_API_KEY).toBe("key");

    // Restore
    process.env = original;
  });

  it("parses optional Telegram env vars when present", () => {
    const original = { ...process.env };
    process.env.PLANE_API_KEY = "key";
    process.env.ANTHROPIC_API_KEY = "akey";
    process.env.GITHUB_PAT = "pat";
    process.env.TELEGRAM_BOT_TOKEN = "token";
    process.env.TELEGRAM_CHAT_ID = "123";

    const env = loadEnv();
    expect(env.TELEGRAM_BOT_TOKEN).toBe("token");
    expect(env.TELEGRAM_CHAT_ID).toBe("123");

    process.env = original;
  });

  it("succeeds without Telegram env vars", () => {
    const original = { ...process.env };
    process.env.PLANE_API_KEY = "key";
    process.env.ANTHROPIC_API_KEY = "akey";
    process.env.GITHUB_PAT = "pat";
    delete process.env.TELEGRAM_BOT_TOKEN;
    delete process.env.TELEGRAM_CHAT_ID;

    const env = loadEnv();
    expect(env.TELEGRAM_BOT_TOKEN).toBeUndefined();
    expect(env.TELEGRAM_CHAT_ID).toBeUndefined();

    process.env = original;
  });

  it("throws on missing required field", () => {
    const original = { ...process.env };
    delete process.env.PLANE_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    delete process.env.GITHUB_PAT;

    expect(() => loadEnv()).toThrow();

    process.env = original;
  });
});

describe("buildPlaneConfig", () => {
  it("constructs PlaneConfig from config and env", () => {
    const config = makeConfig();
    const env = makeEnv();

    const planeConfig = buildPlaneConfig(config, env);
    expect(planeConfig).toEqual({
      apiKey: "test-plane-key",
      baseUrl: "http://localhost/api/v1",
      workspaceSlug: "test-ws",
    });
  });
});
