import { describe, it, expect, vi, beforeEach } from "vitest";
import type { Config, PlaneClient } from "../../config";
import type { TaskPoller } from "../../poller/task-poller";
import { createNoopNotifier } from "../../telegram/notifier";
import { handlePullRequestEvent, handlePullRequestReviewTrigger } from "../handler";
import type { GitHubPullRequestEvent } from "../types";

// Mock dependencies
vi.mock("../updater", () => ({
  updateMultipleTasks: vi.fn(),
}));

const createMockEvent = (overrides?: Partial<GitHubPullRequestEvent>): GitHubPullRequestEvent => ({
  action: "closed",
  number: 123,
  pull_request: {
    id: 1,
    number: 123,
    title: "Test PR",
    body: "Closes AGENTHQ-123",
    state: "closed",
    merged: true,
    merged_at: "2024-01-01T00:00:00Z",
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
  },
  repository: {
    id: 1,
    name: "test-repo",
    full_name: "test/test-repo",
    owner: {
      login: "test",
      id: 1,
    },
  },
  sender: {
    login: "testuser",
    id: 1,
  },
  ...overrides,
});

const mockPlane = {} as PlaneClient;

const mockConfig: Config = {
  plane: {
    baseUrl: "https://plane.example.com",
    workspaceSlug: "test-workspace",
  },
  projects: {},
  agent: {
    maxConcurrent: 2,
    maxBudgetPerTask: 5.0,
    maxDailyBudget: 20.0,
    maxTurns: 200,
    pollIntervalMs: 30000,
    spawnDelayMs: 15000,
    maxRetries: 2,
    retryBaseDelayMs: 60000,
    labelName: "agent",
    progressFeedbackEnabled: true,
    progressUpdateIntervalMs: 2500,
    skills: {
      enabled: true,
      maxSkillsPerPrompt: 10,
      globalSkillsPath: "skills/global",
    },
  },
  webhook: {
    enabled: true,
    port: 3000,
    path: "/webhooks/github/pr",
    taskIdPattern: "([A-Z]+-\\d+)",
  },
  review: {
    enabled: false,
    triggerOnOpened: true,
    triggerOnSynchronize: true,
    severityThreshold: "major",
    maxDiffSizeKb: 100,
    claudeModel: "claude-3-5-sonnet-20241022",
    useParallelReview: true,
  },
};

const mockTaskPoller = {} as TaskPoller;

describe("handlePullRequestEvent", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should ignore non-closed PR events", async () => {
    const event = createMockEvent({
      action: "opened",
      pull_request: {
        ...createMockEvent().pull_request,
        merged: false,
      },
    });

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.success).toBe(true);
    expect(result.taskIds).toEqual([]);
    expect(result.updatedTasks).toEqual([]);
  });

  it("should ignore closed but not merged PRs", async () => {
    const event = createMockEvent({
      action: "closed",
      pull_request: {
        ...createMockEvent().pull_request,
        merged: false,
      },
    });

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.success).toBe(true);
    expect(result.taskIds).toEqual([]);
    expect(result.updatedTasks).toEqual([]);
  });

  it("should extract task IDs from merged PR", async () => {
    const { updateMultipleTasks } = await import("../updater");
    vi.mocked(updateMultipleTasks).mockResolvedValue([
      {
        taskId: "AGENTHQ-123",
        success: true,
        status: "moved",
      },
    ]);

    const event = createMockEvent();

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.taskIds).toEqual(["AGENTHQ-123"]);
    expect(result.updatedTasks).toEqual(["AGENTHQ-123"]);
    expect(result.success).toBe(true);
  });

  it("should handle PRs with no task IDs", async () => {
    const event = createMockEvent({
      pull_request: {
        ...createMockEvent().pull_request,
        body: "No task IDs here",
      },
    });

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.taskIds).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("should handle multiple task IDs", async () => {
    const { updateMultipleTasks } = await import("../updater");
    vi.mocked(updateMultipleTasks).mockResolvedValue([
      {
        taskId: "AGENTHQ-123",
        success: true,
        status: "moved",
      },
      {
        taskId: "AGENTHQ-456",
        success: true,
        status: "moved",
      },
    ]);

    const event = createMockEvent({
      pull_request: {
        ...createMockEvent().pull_request,
        body: "Closes AGENTHQ-123 and AGENTHQ-456",
      },
    });

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.taskIds).toContain("AGENTHQ-123");
    expect(result.taskIds).toContain("AGENTHQ-456");
    expect(result.updatedTasks.length).toBe(2);
  });

  it("should handle already done tasks", async () => {
    const { updateMultipleTasks } = await import("../updater");
    vi.mocked(updateMultipleTasks).mockResolvedValue([
      {
        taskId: "AGENTHQ-123",
        success: true,
        status: "already_done",
      },
    ]);

    const event = createMockEvent();

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.skippedTasks).toEqual(["AGENTHQ-123"]);
    expect(result.updatedTasks).toEqual([]);
    expect(result.success).toBe(true);
  });

  it("should collect errors from failed updates", async () => {
    const { updateMultipleTasks } = await import("../updater");
    vi.mocked(updateMultipleTasks).mockResolvedValue([
      {
        taskId: "AGENTHQ-123",
        success: false,
        reason: "Task not found",
      },
    ]);

    const event = createMockEvent();

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.errors).toEqual(["AGENTHQ-123: Task not found"]);
    expect(result.success).toBe(false);
  });

  it("should extract task ID from branch name", async () => {
    const { updateMultipleTasks } = await import("../updater");
    vi.mocked(updateMultipleTasks).mockResolvedValue([
      {
        taskId: "AGENTHQ-789",
        success: true,
        status: "moved",
      },
    ]);

    const event = createMockEvent({
      pull_request: {
        ...createMockEvent().pull_request,
        body: null,
        head: {
          ref: "agent/AGENTHQ-789",
          sha: "abc123",
        },
      },
    });

    const result = await handlePullRequestEvent(event, mockPlane, mockConfig, mockTaskPoller);

    expect(result.taskIds).toEqual(["AGENTHQ-789"]);
    expect(result.updatedTasks).toEqual(["AGENTHQ-789"]);
  });
});

describe("handlePullRequestReviewTrigger", () => {
  const mockNotifier = createNoopNotifier();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should skip when review agent is not enabled", async () => {
    const event = createMockEvent({ action: "opened" });

    const result = await handlePullRequestReviewTrigger(
      event,
      undefined,
      mockTaskPoller,
      mockConfig,
      mockNotifier
    );

    expect(result.taskIds).toEqual([]);
  });

  it("should skip non-review actions", async () => {
    const mockReviewAgent = { reviewPullRequest: vi.fn() };
    const event = createMockEvent({ action: "closed" });

    const result = await handlePullRequestReviewTrigger(
      event,
      mockReviewAgent,
      mockTaskPoller,
      mockConfig,
      mockNotifier
    );

    expect(result.taskIds).toEqual([]);
    expect(mockReviewAgent.reviewPullRequest).not.toHaveBeenCalled();
  });

  it("should trigger review and send notification for opened PR", async () => {
    const mockReviewAgent = {
      reviewPullRequest: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    };
    const sendSpy = vi.spyOn(mockNotifier, "sendMessage");

    const mockTaskPollerWithCache = {
      ...mockTaskPoller,
      getProjectCache: vi.fn().mockReturnValue({
        project: { id: "project-123" },
        todoStateId: "state-1",
      }),
    } as unknown as TaskPoller;

    const configWithProject: Config = {
      ...mockConfig,
      projects: {
        AGENTHQ: {
          repoPath: "/repos/agent-hq",
          repoUrl: "https://github.com/test/repo",
          defaultBranch: "main",
          planeIdentifier: "AGENTHQ",
        },
      },
    };

    const event = createMockEvent({ action: "opened" });

    const result = await handlePullRequestReviewTrigger(
      event,
      mockReviewAgent,
      mockTaskPollerWithCache,
      configWithProject,
      mockNotifier
    );

    expect(result.taskIds).toEqual([]);
    expect(sendSpy).toHaveBeenCalledWith(expect.stringContaining("Review started"));
    expect(mockReviewAgent.reviewPullRequest).toHaveBeenCalledWith(
      "test",
      "test-repo",
      123,
      "AGENTHQ-123",
      "project-123"
    );
  });
});
