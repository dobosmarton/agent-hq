import { describe, it, expect, vi } from "vitest";
import type { GitHubClient } from "../../github/client";
import type { CodeAnalysisResult } from "../types";
import { postReviewToGitHub } from "../github-reviewer";

describe("postReviewToGitHub", () => {
  it("should post review with REQUEST_CHANGES for critical issues", async () => {
    const mockClient = {
      createReview: vi
        .fn()
        .mockResolvedValue({ success: true, data: undefined }),
    } as unknown as GitHubClient;

    const analysis: CodeAnalysisResult = {
      overallAssessment: "request_changes",
      summary: "Critical issues found",
      issues: [
        {
          category: "security",
          severity: "critical",
          description: "SQL injection vulnerability",
          suggestion: "Use parameterized queries",
        },
      ],
    };

    const result = await postReviewToGitHub(mockClient, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledWith(
      123,
      "REQUEST_CHANGES",
      expect.stringContaining("Critical Issues"),
    );
  });

  it("should post review with COMMENT for approval", async () => {
    const mockClient = {
      createReview: vi
        .fn()
        .mockResolvedValue({ success: true, data: undefined }),
    } as unknown as GitHubClient;

    const analysis: CodeAnalysisResult = {
      overallAssessment: "approve",
      summary: "No issues found",
      issues: [],
    };

    const result = await postReviewToGitHub(mockClient, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledWith(
      123,
      "COMMENT",
      expect.stringContaining("No Issues Found"),
    );
  });

  it("should handle GitHub API errors", async () => {
    const mockClient = {
      createReview: vi
        .fn()
        .mockResolvedValue({ success: false, error: "API error" }),
    } as unknown as GitHubClient;

    const analysis: CodeAnalysisResult = {
      overallAssessment: "comment",
      summary: "Minor issues",
      issues: [],
    };

    const result = await postReviewToGitHub(mockClient, 123, analysis);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("API error");
    }
  });
});
