import type { GitHubClient } from "../github/client";
import type { GitHubReviewEvent } from "../github/types";
import type { CodeAnalysisResult, IssueSeverity, ReviewResult } from "./types";

/**
 * Formats review issues by severity for display
 */
const formatIssuesBySeverity = (issues: CodeAnalysisResult["issues"]): string => {
  const bySeverity: Record<IssueSeverity, typeof issues> = {
    critical: [],
    major: [],
    minor: [],
    suggestion: [],
  };

  for (const issue of issues) {
    bySeverity[issue.severity].push(issue);
  }

  const sections: string[] = [];

  if (bySeverity.critical.length > 0) {
    sections.push(`### ❌ Critical Issues\n`);
    for (const issue of bySeverity.critical) {
      sections.push(
        `- **${issue.category}**: ${issue.description}${issue.suggestion ? `\n  💡 ${issue.suggestion}` : ""}`,
      );
    }
    sections.push("");
  }

  if (bySeverity.major.length > 0) {
    sections.push(`### ⚠️ Major Issues\n`);
    for (const issue of bySeverity.major) {
      sections.push(
        `- **${issue.category}**: ${issue.description}${issue.suggestion ? `\n  💡 ${issue.suggestion}` : ""}`,
      );
    }
    sections.push("");
  }

  if (bySeverity.minor.length > 0) {
    sections.push(`### 💡 Minor Issues\n`);
    for (const issue of bySeverity.minor) {
      sections.push(
        `- **${issue.category}**: ${issue.description}${issue.suggestion ? `\n  💡 ${issue.suggestion}` : ""}`,
      );
    }
    sections.push("");
  }

  if (bySeverity.suggestion.length > 0) {
    sections.push(`### 💬 Suggestions\n`);
    for (const issue of bySeverity.suggestion) {
      sections.push(
        `- **${issue.category}**: ${issue.description}${issue.suggestion ? `\n  💡 ${issue.suggestion}` : ""}`,
      );
    }
    sections.push("");
  }

  return sections.join("\n");
};

/**
 * Maps analysis assessment to GitHub review event
 */
const mapAssessmentToEvent = (
  assessment: CodeAnalysisResult["overallAssessment"],
): GitHubReviewEvent => {
  switch (assessment) {
    case "approve":
      return "COMMENT"; // Phase 1: Never auto-approve, only comment
    case "request_changes":
      return "REQUEST_CHANGES";
    case "comment":
      return "COMMENT";
  }
};

/**
 * Builds the review body text
 */
const buildReviewBody = (analysis: CodeAnalysisResult): string => {
  const header =
    analysis.overallAssessment === "approve"
      ? "## ✅ Code Review - No Issues Found"
      : analysis.overallAssessment === "request_changes"
        ? "## ❌ Code Review - Changes Requested"
        : "## 💬 Code Review - Comments";

  const summary = `\n${analysis.summary}\n`;

  const issuesSection =
    analysis.issues.length > 0
      ? `\n${formatIssuesBySeverity(analysis.issues)}`
      : "\n_No issues found. Code looks good!_\n";

  const footer = `\n---\n🤖 _Automated review by PR Review Agent_`;

  return `${header}${summary}${issuesSection}${footer}`;
};

/**
 * Posts a code review to a GitHub PR
 *
 * @param client - GitHub API client
 * @param prNumber - Pull request number
 * @param analysis - Code analysis result from Claude
 * @returns Success or error result
 */
export const postReviewToGitHub = async (
  client: GitHubClient,
  prNumber: number,
  analysis: CodeAnalysisResult,
): Promise<ReviewResult<void>> => {
  try {
    const event = mapAssessmentToEvent(analysis.overallAssessment);
    const body = buildReviewBody(analysis);

    console.log(`📝 Review: Posting ${event} review to PR #${prNumber}...`);

    const result = await client.createReview(prNumber, event, body);

    if (!result.success) {
      return { success: false, error: result.error };
    }

    console.log(`✅ Review: Successfully posted review to PR #${prNumber}`);
    return { success: true, data: undefined };
  } catch (error: unknown) {
    console.error(`❌ Review: Error posting review to GitHub:`, error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Unknown error posting review" };
  }
};
