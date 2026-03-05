import { describe, it, expect, vi, beforeEach } from "vitest";
import { selectReviewTools } from "../tool-selector";
import type { ReviewContext } from "../types";
import type { ReviewTool } from "../review-tools";
import type Anthropic from "@anthropic-ai/sdk";

/**
 * Creates a mock Anthropic client with the given create implementation
 */
const createMockClient = (
  createFn: Anthropic["messages"]["create"],
): Anthropic =>
  ({
    messages: { create: createFn },
  }) as unknown as Anthropic;

describe("selectReviewTools", () => {
  const mockContext: ReviewContext = {
    taskDescription: "Implement user authentication",
    acceptanceCriteria: "Users can log in securely",
    prDescription: "Add login functionality",
    prTitle: "Add user authentication",
    diff: "auth code changes",
    codingSkills: "test skills",
  };

  const mockTools: readonly ReviewTool[] = [
    {
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
        content: "Security guidelines",
        enabled: true,
        appliesTo: "implementation",
        filePath: "skills/global/security-review.md",
        isProjectSkill: false,
      },
    },
    {
      name: "review_performance",
      description: "Performance review",
      category: "performance",
      priority: 60,
      skill: {
        id: "performance-review",
        name: "Performance Review",
        description: "Performance review skill",
        category: "performance",
        priority: 60,
        content: "Performance guidelines",
        enabled: true,
        appliesTo: "implementation",
        filePath: "skills/global/performance-review.md",
        isProjectSkill: false,
      },
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("should select relevant review tools based on PR context", async () => {
    const mockClient = createMockClient(
      vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: JSON.stringify({
              selectedTools: [
                {
                  toolName: "review_security",
                  reason: "Code handles authentication",
                },
              ],
              rationale: "Security review needed for auth code",
            }),
          },
        ],
      }),
    );

    const result = await selectReviewTools(
      mockContext,
      mockTools,
      mockClient,
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data).toHaveLength(1);
      expect(result.data[0]?.tool.name).toBe("review_security");
      expect(result.data[0]?.reason).toContain("authentication");
    }
  });

  it("should handle API errors gracefully", async () => {
    const mockClient = createMockClient(
      vi.fn().mockRejectedValue(new Error("API error")),
    );

    const result = await selectReviewTools(
      mockContext,
      mockTools,
      mockClient,
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(false);
  });

  it("should handle invalid response format", async () => {
    const mockClient = createMockClient(
      vi.fn().mockResolvedValue({
        content: [
          {
            type: "text",
            text: "invalid json",
          },
        ],
      }),
    );

    const result = await selectReviewTools(
      mockContext,
      mockTools,
      mockClient,
      "claude-3-5-sonnet-20241022",
    );

    expect(result.success).toBe(false);
  });
});
