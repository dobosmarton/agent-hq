import { describe, it, expect } from "vitest";
import { buildAgentPrompt } from "../../agent/prompt-builder.js";
import type { AgentTask } from "../../types.js";

const makeTask = (overrides?: Partial<AgentTask>): AgentTask => ({
  issueId: "issue-1",
  projectId: "proj-1",
  projectIdentifier: "HQ",
  sequenceId: 42,
  title: "Fix the login bug",
  descriptionHtml: "<p>Users cannot log in after password reset.</p>",
  stateId: "state-1",
  labelIds: ["label-1"],
  ...overrides,
});

describe("buildAgentPrompt", () => {
  it("includes the task ID", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain("HQ-42");
  });

  it("includes the task title", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain("Fix the login bug");
  });

  it("includes the branch name", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain("agent/HQ-42");
  });

  it("includes the description when provided", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain("Users cannot log in after password reset.");
  });

  it("shows fallback when description is empty", () => {
    const prompt = buildAgentPrompt(
      makeTask({ descriptionHtml: "" }),
      "agent/HQ-42",
    );
    expect(prompt).toContain("No description provided.");
  });

  it("includes commit prefix instruction", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain('"HQ-42:"');
  });

  it("includes git push instruction with branch", () => {
    const prompt = buildAgentPrompt(makeTask(), "agent/HQ-42");
    expect(prompt).toContain("git push -u origin agent/HQ-42");
  });
});
