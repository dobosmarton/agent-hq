import { describe, it, expect } from "vitest";
import {
  extractTaskIds,
  validateTaskId,
  extractProjectIdentifier,
  extractSequenceId,
} from "../task-matcher";
import type { GitHubPullRequest } from "../types";

const createMockPR = (
  overrides?: Partial<GitHubPullRequest>,
): GitHubPullRequest => ({
  id: 1,
  number: 123,
  title: "Test PR",
  body: null,
  state: "open",
  merged: false,
  merged_at: null,
  head: {
    ref: "feature/test",
    sha: "abc123",
  },
  base: {
    ref: "main",
    sha: "def456",
  },
  user: {
    login: "testuser",
    id: 1,
  },
  html_url: "https://github.com/test/repo/pull/123",
  ...overrides,
});

describe("extractTaskIds", () => {
  it("should extract task ID from PR description", () => {
    const pr = createMockPR({
      body: "This PR fixes AGENTHQ-123",
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toEqual(["AGENTHQ-123"]);
  });

  it("should extract multiple task IDs from PR description", () => {
    const pr = createMockPR({
      body: "Closes AGENTHQ-123 and fixes AGENTHQ-456",
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toContain("AGENTHQ-123");
    expect(taskIds).toContain("AGENTHQ-456");
    expect(taskIds.length).toBe(2);
  });

  it("should extract task ID from branch name", () => {
    const pr = createMockPR({
      head: {
        ref: "feature/AGENTHQ-789-add-webhook-support",
        sha: "abc123",
      },
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toEqual(["AGENTHQ-789"]);
  });

  it("should extract task ID from agent branch naming pattern", () => {
    const pr = createMockPR({
      head: {
        ref: "agent/AGENTHQ-999",
        sha: "abc123",
      },
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toEqual(["AGENTHQ-999"]);
  });

  it("should extract task IDs from commit messages", () => {
    const pr = createMockPR();
    const commits = [
      { message: "AGENTHQ-111: Add feature" },
      { message: "AGENTHQ-222: Fix bug" },
    ];

    const taskIds = extractTaskIds(pr, commits);
    expect(taskIds).toContain("AGENTHQ-111");
    expect(taskIds).toContain("AGENTHQ-222");
    expect(taskIds.length).toBe(2);
  });

  it("should deduplicate task IDs from multiple sources", () => {
    const pr = createMockPR({
      body: "Fixes AGENTHQ-123",
      head: {
        ref: "feature/AGENTHQ-123-description",
        sha: "abc123",
      },
    });
    const commits = [{ message: "AGENTHQ-123: Initial commit" }];

    const taskIds = extractTaskIds(pr, commits);
    expect(taskIds).toEqual(["AGENTHQ-123"]);
  });

  it("should return empty array when no task IDs found", () => {
    const pr = createMockPR({
      body: "This is a PR with no task ID",
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toEqual([]);
  });

  it("should handle null PR body", () => {
    const pr = createMockPR({
      body: null,
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toEqual([]);
  });

  it("should work with different project identifiers", () => {
    const pr = createMockPR({
      body: "Fixes PROJECT-456 and OTHERPRJ-789",
    });

    const taskIds = extractTaskIds(pr);
    expect(taskIds).toContain("PROJECT-456");
    expect(taskIds).toContain("OTHERPRJ-789");
    expect(taskIds.length).toBe(2);
  });

  it("should use custom pattern when provided", () => {
    const pr = createMockPR({
      body: "Fixes CUSTOM_123",
    });

    const taskIds = extractTaskIds(pr, undefined, "(CUSTOM_\\d+)");
    expect(taskIds).toEqual(["CUSTOM_123"]);
  });
});

describe("validateTaskId", () => {
  it("should validate correct task ID format", () => {
    expect(validateTaskId("AGENTHQ-123")).toBe(true);
    expect(validateTaskId("PROJECT-456")).toBe(true);
    expect(validateTaskId("ABC-1")).toBe(true);
  });

  it("should reject invalid task ID formats", () => {
    expect(validateTaskId("AGENTHQ123")).toBe(false);
    expect(validateTaskId("agenthq-123")).toBe(false);
    expect(validateTaskId("AGENTHQ-")).toBe(false);
    expect(validateTaskId("123-AGENTHQ")).toBe(false);
    expect(validateTaskId("")).toBe(false);
  });

  it("should work with custom pattern", () => {
    expect(validateTaskId("CUSTOM_123", "(CUSTOM_\\d+)")).toBe(true);
    expect(validateTaskId("AGENTHQ-123", "(CUSTOM_\\d+)")).toBe(false);
  });
});

describe("extractProjectIdentifier", () => {
  it("should extract project identifier from task ID", () => {
    expect(extractProjectIdentifier("AGENTHQ-123")).toBe("AGENTHQ");
    expect(extractProjectIdentifier("PROJECT-456")).toBe("PROJECT");
    expect(extractProjectIdentifier("ABC-1")).toBe("ABC");
  });
});

describe("extractSequenceId", () => {
  it("should extract sequence ID from task ID", () => {
    expect(extractSequenceId("AGENTHQ-123")).toBe(123);
    expect(extractSequenceId("PROJECT-456")).toBe(456);
    expect(extractSequenceId("ABC-1")).toBe(1);
  });
});
