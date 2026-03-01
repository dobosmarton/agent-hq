import { describe, it, expect, vi, beforeEach } from "vitest";
import { executeParallelReviews } from "../parallel-reviewer";
import type { ReviewContext } from "../types";
import type { ToolSelectionResult } from "../review-tools";

// Mock Anthropic — must use `function` (not arrow) so it can be called with `new`
vi.mock("@anthropic-ai/sdk", () => ({
  default: vi.fn().mockImplementation(function () {
    return {
      messages: {
        create: vi.fn().mockResolvedValue({
          content: [
            {
              type: "text",
              text: JSON.stringify({
                overallAssessment: "approve",
                summary: "Test review summary",
                issues: [],
              }),
            },
          ],
        }),
      },
    };
  }),
}));

describe("executeParallelReviews", () => {
  const mockContext: ReviewContext = {
    taskDescription: "Test task",
    acceptanceCriteria: undefined,
    prDescription: "Test PR",
    prTitle: "Test PR Title",
    diff: "diff content",
    codingSkills: "test skills",
  };

  const mockToolSelection: ToolSelectionResult = {
    tool: {
      name: "review_security",
      description: "Security review",
      category: "security",
      priority: 90,
      skill: {
        id: "security-review",
        name: "Security Review",
        description: "Security review skill",
        category: "security",
        priority: 90,
        content: "Security review guidelines",
        enabled: true,
        appliesTo: "implementation",
        filePath: "skills/global/security-review.md",
        isProjectSkill: false,
      },
    },
    reason: "Code handles sensitive data",
  };

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should execute parallel reviews and aggregate results", async () => {
    const result = await executeParallelReviews(
      mockContext,
      [mockToolSelection],
      "test-api-key",
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.overallAssessment).toBe("approve");
      expect(result.data.toolsUsed).toContain("security");
      expect(result.data.issues).toHaveLength(0);
    }
  });

  it("should return error if all reviews fail", async () => {
    const Anthropic = await import("@anthropic-ai/sdk");
    const mockCreate = vi.fn().mockRejectedValue(new Error("API error"));
    vi.mocked(Anthropic.default).mockImplementation(function () {
      return {
        messages: {
          create: mockCreate,
        },
      } as any;
    });

    const result = await executeParallelReviews(
      mockContext,
      [mockToolSelection],
      "test-api-key",
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toContain("failed");
    }
  });

  it("should deduplicate similar issues", async () => {
    const Anthropic = await import("@anthropic-ai/sdk");
    const mockCreate = vi.fn().mockResolvedValue({
      content: [
        {
          type: "text",
          text: JSON.stringify({
            overallAssessment: "request_changes",
            summary: "Found security issues",
            issues: [
              {
                category: "security",
                severity: "critical",
                description: "SQL injection vulnerability",
                suggestion: "Use parameterized queries",
                file: "db.ts",
                line: 42,
              },
            ],
          }),
        },
      ],
    });
    vi.mocked(Anthropic.default).mockImplementation(function () {
      return {
        messages: {
          create: mockCreate,
        },
      } as any;
    });

    const result = await executeParallelReviews(
      mockContext,
      [mockToolSelection, mockToolSelection], // Run same review twice
      "test-api-key",
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      // Should deduplicate the duplicate issue
      expect(result.data.issues.length).toBeLessThanOrEqual(1);
    }
  });
});
