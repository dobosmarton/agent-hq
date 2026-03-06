import { z } from "zod";

/**
 * Review agent types for code analysis and PR review
 */

/**
 * Severity levels for review issues
 */
export type IssueSeverity = "critical" | "major" | "minor" | "suggestion";

/**
 * Issue category
 */
export type IssueCategory =
  | "correctness"
  | "completeness"
  | "code_quality"
  | "best_practices"
  | "security"
  | "testing"
  | "documentation"
  | "performance";

/**
 * A single issue found during code review
 */
export type ReviewIssue = {
  category: IssueCategory;
  severity: IssueSeverity;
  description: string;
  suggestion?: string;
  file?: string;
  line?: number;
};

/**
 * Overall assessment of the code review
 */
export type OverallAssessment = "approve" | "request_changes" | "comment";

/**
 * Code review analysis result from Claude
 */
export type CodeAnalysisResult = {
  overallAssessment: OverallAssessment;
  summary: string;
  issues: ReviewIssue[];
};

/**
 * Context for code review
 */
export type ReviewContext = {
  taskDescription: string;
  acceptanceCriteria?: string;
  prDescription: string | null;
  prTitle: string;
  diff: string;
  codingSkills: string;
};

/**
 * Zod schema for validating Claude API response
 */
export const ReviewIssueSchema = z.object({
  category: z.enum([
    "correctness",
    "completeness",
    "code_quality",
    "best_practices",
    "security",
    "testing",
    "documentation",
    "performance",
  ]),
  severity: z.enum(["critical", "major", "minor", "suggestion"]),
  description: z.string(),
  suggestion: z.string().optional(),
  file: z.string().optional(),
  line: z.number().optional(),
});

export const CodeAnalysisResultSchema = z.object({
  overallAssessment: z.enum(["approve", "request_changes", "comment"]),
  summary: z.string(),
  issues: z.array(ReviewIssueSchema),
});

/**
 * Result type for review operations
 */
export type ReviewResult<T> =
  | { success: true; data: T }
  | { success: false; error: string };
