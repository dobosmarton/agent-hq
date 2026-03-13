import { describe, it, expect, vi } from "vitest";
import type { GitHubPRAdapter } from "@agent-hq/shared-types";
import type { CodeAnalysisResult } from "../types";
import { postReviewToGitHub } from "../github-reviewer";

describe("postReviewToGitHub", () => {
  it("should post review with REQUEST_CHANGES for critical issues", async () => {
    const mockClient: Pick<GitHubPRAdapter, "createReview"> = {
      createReview: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    };

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

    const result = await postReviewToGitHub(mockClient as GitHubPRAdapter, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledWith(
      123,
      "REQUEST_CHANGES",
      expect.stringContaining("Critical Issues"),
      undefined
    );
  });

  it("should post review with COMMENT for approval", async () => {
    const mockClient: Pick<GitHubPRAdapter, "createReview"> = {
      createReview: vi.fn().mockResolvedValue({ success: true, data: undefined }),
    };

    const analysis: CodeAnalysisResult = {
      overallAssessment: "approve",
      summary: "No issues found",
      issues: [],
    };

    const result = await postReviewToGitHub(mockClient as GitHubPRAdapter, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledWith(
      123,
      "COMMENT",
      expect.stringContaining("No Issues Found"),
      undefined
    );
  });

  it("should retry without inline comments on path resolution 422", async () => {
    const mockClient: Pick<GitHubPRAdapter, "createReview"> = {
      createReview: vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: '422 Unprocessable Entity: "Path could not be resolved"',
        })
        .mockResolvedValueOnce({ success: true, data: undefined }),
    };

    const analysis: CodeAnalysisResult = {
      overallAssessment: "request_changes",
      summary: "Issues found",
      issues: [
        {
          category: "security",
          severity: "major",
          description: "Problem here",
          file: "src/nonexistent.ts",
          line: 10,
        },
      ],
    };

    const result = await postReviewToGitHub(mockClient as GitHubPRAdapter, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledTimes(2);
    // First call: with inline comments
    expect(mockClient.createReview).toHaveBeenNthCalledWith(
      1,
      123,
      "REQUEST_CHANGES",
      expect.any(String),
      expect.arrayContaining([expect.objectContaining({ path: "src/nonexistent.ts" })])
    );
    // Second call: without inline comments
    expect(mockClient.createReview).toHaveBeenNthCalledWith(
      2,
      123,
      "REQUEST_CHANGES",
      expect.any(String)
    );
  });

  it("should fall back to COMMENT after path error and REQUEST_CHANGES rejection", async () => {
    const mockClient: Pick<GitHubPRAdapter, "createReview"> = {
      createReview: vi
        .fn()
        .mockResolvedValueOnce({
          success: false,
          error: '422 Unprocessable Entity: "Path could not be resolved"',
        })
        .mockResolvedValueOnce({
          success: false,
          error: "422 Unprocessable Entity",
        })
        .mockResolvedValueOnce({ success: true, data: undefined }),
    };

    const analysis: CodeAnalysisResult = {
      overallAssessment: "request_changes",
      summary: "Issues found",
      issues: [
        {
          category: "correctness",
          severity: "critical",
          description: "Bug",
          file: "src/bad.ts",
          line: 5,
        },
      ],
    };

    const result = await postReviewToGitHub(mockClient as GitHubPRAdapter, 123, analysis);

    expect(result.success).toBe(true);
    expect(mockClient.createReview).toHaveBeenCalledTimes(3);
    // Third call: COMMENT without inline comments
    expect(mockClient.createReview).toHaveBeenNthCalledWith(3, 123, "COMMENT", expect.any(String));
  });

  it("should handle GitHub API errors", async () => {
    const mockClient: Pick<GitHubPRAdapter, "createReview"> = {
      createReview: vi.fn().mockResolvedValue({ success: false, error: "API error" }),
    };

    const analysis: CodeAnalysisResult = {
      overallAssessment: "comment",
      summary: "Minor issues",
      issues: [],
    };

    const result = await postReviewToGitHub(mockClient as GitHubPRAdapter, 123, analysis);

    expect(result.success).toBe(false);
    if (!result.success) {
      expect(result.error).toBe("API error");
    }
  });
});
