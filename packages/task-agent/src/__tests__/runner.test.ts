import { describe, it, expect } from "vitest";
import { classifyError, getPhaseConfig, buildMetadataComment } from "../runner";
import { METADATA_MARKER } from "@agent-hq/shared-types";
import type { AgentConfig } from "../adapters";

describe("classifyError", () => {
  it("returns budget_exceeded when subtype contains budget", () => {
    expect(classifyError("budget_exceeded", "")).toBe("budget_exceeded");
  });

  it("returns budget_exceeded even when errors are present", () => {
    expect(classifyError("over_budget", "some error")).toBe("budget_exceeded");
  });

  it("returns max_turns when subtype contains turns", () => {
    expect(classifyError("max_turns_reached", "")).toBe("max_turns");
  });

  it("returns rate_limited when no errors and subtype is not success", () => {
    expect(classifyError("error", "")).toBe("rate_limited");
  });

  it("returns unknown when errors are present", () => {
    expect(classifyError("error", "something went wrong")).toBe("unknown");
  });

  it("returns unknown for success subtype with no errors", () => {
    expect(classifyError("success", "")).toBe("unknown");
  });
});

describe("buildMetadataComment", () => {
  it("includes the metadata marker", () => {
    const result = buildMetadataComment("implementation", 1.5, {
      available: ["ts-skill"],
      loaded: new Set(["ts-skill"]),
    });

    expect(result).toContain(METADATA_MARKER);
  });

  it("formats cost with two decimal places", () => {
    const result = buildMetadataComment("planning", 0.1, {
      available: [],
      loaded: new Set(),
    });

    expect(result).toContain("$0.10");
  });

  it("includes phase label", () => {
    const result = buildMetadataComment("implementation", 2.0, {
      available: [],
      loaded: new Set(),
    });

    expect(result).toContain("phase: implementation");
  });

  it("lists available and loaded skills", () => {
    const result = buildMetadataComment("implementation", 1.0, {
      available: ["skill-a", "skill-b"],
      loaded: new Set(["skill-a"]),
    });

    expect(result).toContain("skill-a, skill-b");
    expect(result).toContain("<li><strong>Skills loaded:</strong> skill-a</li>");
  });

  it("shows 'none' when no skills are available or loaded", () => {
    const result = buildMetadataComment("planning", 0.5, {
      available: [],
      loaded: new Set(),
    });

    expect(result).toContain("<li><strong>Skills available:</strong> none</li>");
    expect(result).toContain("<li><strong>Skills loaded:</strong> none</li>");
  });
});

const stubAgentConfig: AgentConfig = {
  authMode: "api" as const,
  maxBudgetPerTask: 10.0,
  maxDailyBudget: 50.0,
  maxTurns: 200,
  maxRetries: 3,
  progressFeedbackEnabled: true,
  progressUpdateIntervalMs: 30000,
  skills: { enabled: true, maxSkillsPerPrompt: 10, globalSkillsPath: "skills/global" },
};

describe("getPhaseConfig", () => {
  describe("planning phase", () => {
    it("uses fixed budget and turns", () => {
      const pc = getPhaseConfig("planning", stubAgentConfig);

      expect(pc.maxTurns).toBe(50);
      expect(pc.maxBudgetUsd).toBe(2.0);
    });

    it("uses plan permission mode", () => {
      const pc = getPhaseConfig("planning", stubAgentConfig);

      expect(pc.permissionMode).toBe("plan");
      expect(pc.phaseLabel).toBe("planning");
    });

    it("excludes write tools", () => {
      const pc = getPhaseConfig("planning", stubAgentConfig);

      expect(pc.allowedTools).toContain("Read");
      expect(pc.allowedTools).not.toContain("Write");
      expect(pc.allowedTools).not.toContain("Edit");
      expect(pc.allowedTools).not.toContain("Bash");
    });

    it("has no disallowed tools", () => {
      const pc = getPhaseConfig("planning", stubAgentConfig);

      expect(pc.disallowedTools).toEqual([]);
    });

    it("excludes GitHub MCP tools", () => {
      const pc = getPhaseConfig("planning", stubAgentConfig);

      expect(pc.allowedTools).not.toContain("mcp__github__create_pull_request");
    });
  });

  describe("implementation phase", () => {
    it("uses config values for budget and turns", () => {
      const pc = getPhaseConfig("implementation", stubAgentConfig);

      expect(pc.maxTurns).toBe(200);
      expect(pc.maxBudgetUsd).toBe(10.0);
    });

    it("uses acceptEdits permission mode", () => {
      const pc = getPhaseConfig("implementation", stubAgentConfig);

      expect(pc.permissionMode).toBe("acceptEdits");
      expect(pc.phaseLabel).toBe("implementing");
    });

    it("includes write tools", () => {
      const pc = getPhaseConfig("implementation", stubAgentConfig);

      expect(pc.allowedTools).toContain("Write");
      expect(pc.allowedTools).toContain("Edit");
      expect(pc.allowedTools).toContain("Bash");
    });

    it("includes disallowed tools blocklist", () => {
      const pc = getPhaseConfig("implementation", stubAgentConfig);

      expect(pc.disallowedTools.length).toBeGreaterThan(0);
    });

    it("includes GitHub MCP tools", () => {
      const pc = getPhaseConfig("implementation", stubAgentConfig);

      expect(pc.allowedTools).toContain("mcp__github__create_pull_request");
    });
  });
});
