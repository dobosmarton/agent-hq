import { describe, expect, it } from "vitest";
import { EnvSchema, PlaneIssueSchema, PlanePaginatedSchema, PlaneProjectSchema } from "../types";

describe("EnvSchema", () => {
  const validEnv = {
    TELEGRAM_BOT_TOKEN: "token123",
    ALLOWED_USER_ID: "12345",
    PLANE_API_KEY: "key",
    PLANE_BASE_URL: "http://localhost",
    PLANE_WORKSPACE_SLUG: "ws",
    ANTHROPIC_API_KEY: "akey",
  };

  it("parses valid full env", () => {
    const result = EnvSchema.parse({ ...validEnv, ANTHROPIC_MODEL: "claude-sonnet-4-20250514" });
    expect(result.ANTHROPIC_MODEL).toBe("claude-sonnet-4-20250514");
  });

  it("applies default ANTHROPIC_MODEL", () => {
    const result = EnvSchema.parse(validEnv);
    expect(result.ANTHROPIC_MODEL).toBe("claude-haiku-4-5-20251001");
  });

  it("accepts optional AGENT_RUNNER_URL", () => {
    const result = EnvSchema.parse({ ...validEnv, AGENT_RUNNER_URL: "http://localhost:3847" });
    expect(result.AGENT_RUNNER_URL).toBe("http://localhost:3847");
  });

  it("allows AGENT_RUNNER_URL to be absent", () => {
    const result = EnvSchema.parse(validEnv);
    expect(result.AGENT_RUNNER_URL).toBeUndefined();
  });

  it("rejects invalid AGENT_RUNNER_URL", () => {
    expect(() => EnvSchema.parse({ ...validEnv, AGENT_RUNNER_URL: "not-a-url" })).toThrow();
  });

  it("rejects missing TELEGRAM_BOT_TOKEN", () => {
    const { TELEGRAM_BOT_TOKEN, ...rest } = validEnv;
    expect(() => EnvSchema.parse(rest)).toThrow();
  });

  it("rejects missing PLANE_API_KEY", () => {
    const { PLANE_API_KEY, ...rest } = validEnv;
    expect(() => EnvSchema.parse(rest)).toThrow();
  });

  it("rejects invalid PLANE_BASE_URL", () => {
    expect(() => EnvSchema.parse({ ...validEnv, PLANE_BASE_URL: "not-url" })).toThrow();
  });

  it("rejects empty ALLOWED_USER_ID", () => {
    expect(() => EnvSchema.parse({ ...validEnv, ALLOWED_USER_ID: "" })).toThrow();
  });
});

describe("PlaneProjectSchema", () => {
  it("parses valid project", () => {
    const result = PlaneProjectSchema.parse({ id: "x", name: "y", identifier: "Z" });
    expect(result).toEqual({ id: "x", name: "y", identifier: "Z" });
  });

  it("rejects missing identifier", () => {
    expect(() => PlaneProjectSchema.parse({ id: "x", name: "y" })).toThrow();
  });
});

describe("PlaneIssueSchema", () => {
  it("parses valid issue", () => {
    const result = PlaneIssueSchema.parse({
      id: "i1",
      name: "Task",
      priority: "high",
      state: "s1",
      sequence_id: 42,
    });
    expect(result.sequence_id).toBe(42);
  });

  it("rejects string sequence_id", () => {
    expect(() =>
      PlaneIssueSchema.parse({
        id: "i1",
        name: "Task",
        priority: "high",
        state: "s1",
        sequence_id: "42",
      })
    ).toThrow();
  });
});

describe("PlanePaginatedSchema", () => {
  it("parses valid paginated projects", () => {
    const schema = PlanePaginatedSchema(PlaneProjectSchema);
    const result = schema.parse({
      total_count: 1,
      results: [{ id: "x", name: "y", identifier: "Z" }],
    });
    expect(result.results).toHaveLength(1);
  });

  it("rejects missing total_count", () => {
    const schema = PlanePaginatedSchema(PlaneProjectSchema);
    expect(() => schema.parse({ results: [] })).toThrow();
  });

  it("accepts empty results", () => {
    const schema = PlanePaginatedSchema(PlaneProjectSchema);
    const result = schema.parse({ total_count: 0, results: [] });
    expect(result.results).toHaveLength(0);
  });
});
