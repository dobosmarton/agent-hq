import { describe, it, expect } from "vitest";
import {
  buildPlanningPrompt,
  buildImplementationPrompt,
} from "../../agent/prompt-builder.js";
import { PLAN_MARKER } from "../../agent/phase.js";
import type { AgentTask } from "../../types.js";
import type { PlaneComment } from "../../plane/types.js";

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

const makeComment = (overrides?: Partial<PlaneComment>): PlaneComment => ({
  id: "comment-1",
  comment_html: "<p>Test comment</p>",
  created_at: "2026-02-19T10:00:00Z",
  ...overrides,
});

describe("buildPlanningPrompt", () => {
  it("includes the task ID", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain("HQ-42");
  });

  it("includes the task title", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain("Fix the login bug");
  });

  it("includes the description when provided", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain("Users cannot log in after password reset.");
  });

  it("shows fallback when description is empty", () => {
    const prompt = buildPlanningPrompt(makeTask({ descriptionHtml: "" }));
    expect(prompt).toContain("No description provided.");
  });

  it("includes the PLAN_MARKER in instructions", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain(PLAN_MARKER);
  });

  it("instructs to move to plan_review", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain("plan_review");
  });

  it("instructs not to modify files", () => {
    const prompt = buildPlanningPrompt(makeTask());
    expect(prompt).toContain("Do NOT modify any files");
  });
});

describe("buildImplementationPrompt", () => {
  it("includes the task ID", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("HQ-42");
  });

  it("includes the task title", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("Fix the login bug");
  });

  it("includes the branch name", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("agent/HQ-42");
  });

  it("includes the description when provided", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("Users cannot log in after password reset.");
  });

  it("includes commit prefix instruction", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain('"HQ-42:"');
  });

  it("includes git push instruction with branch", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("git push -u origin agent/HQ-42");
  });

  it("includes comments in the prompt", () => {
    const comments = [
      makeComment({ comment_html: "<p>Plan looks good, proceed.</p>" }),
    ];
    const prompt = buildImplementationPrompt(
      makeTask(),
      "agent/HQ-42",
      comments,
    );
    expect(prompt).toContain("Plan looks good, proceed.");
  });

  it("shows fallback when no comments", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("No previous comments.");
  });

  it("includes PR creation instruction", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("gh pr create");
  });

  it("instructs not to ask questions", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("Do NOT ask questions");
  });

  it("instructs to run prettier before committing", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("npx prettier --check .");
  });

  it("instructs to run type checking before committing", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("npx tsc --noEmit");
  });

  it("instructs to run tests before committing", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("npm test");
  });

  it("instructs to never commit failing code", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("NEVER commit code that fails");
  });

  it("instructs to add PR link to the task", () => {
    const prompt = buildImplementationPrompt(makeTask(), "agent/HQ-42", []);
    expect(prompt).toContain("add_task_link");
  });
});
