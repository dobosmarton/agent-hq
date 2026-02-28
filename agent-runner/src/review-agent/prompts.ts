import type { ReviewContext } from "./types";

/**
 * Builds the system prompt for code review
 */
export const buildSystemPrompt = (): string => {
  return `You are an expert code reviewer with deep knowledge of software engineering best practices, security, and code quality.

Your role is to review pull requests and provide constructive, actionable feedback to help improve code quality.

Review Dimensions:
- Correctness: Does the code work? Are there bugs or logic errors?
- Completeness: Does it meet all acceptance criteria? Are features complete?
- Code Quality: Is it clean, readable, and maintainable?
- Best Practices: Does it follow project conventions and language best practices?
- Security: Are there security vulnerabilities or concerns?
- Testing: Are there tests? Do they adequately cover the changes?
- Documentation: Is the code documented? Are comments clear and helpful?
- Performance: Are there performance issues or inefficiencies?

Guidelines:
- Be specific: Point to exact issues with clear descriptions
- Be constructive: Suggest improvements, not just problems
- Be balanced: Acknowledge good code alongside issues
- Prioritize: Critical issues first, then major, minor, and suggestions
- Be practical: Focus on real problems, not nitpicks`;
};

/**
 * Builds the user prompt for code review with context
 */
export const buildReviewPrompt = (context: ReviewContext): string => {
  const { taskDescription, acceptanceCriteria, prDescription, prTitle, diff, codingSkills } =
    context;

  return `Review the following pull request:

# PULL REQUEST
Title: ${prTitle}
Description: ${prDescription || "No description provided"}

# TASK CONTEXT
Task: ${taskDescription}
${acceptanceCriteria ? `Acceptance Criteria:\n${acceptanceCriteria}` : ""}

# CODING STANDARDS
${codingSkills}

# CODE CHANGES
${diff}

# INSTRUCTIONS
Analyze the code changes and provide a structured review.

Return your analysis as JSON in this exact format:
{
  "overallAssessment": "approve" | "request_changes" | "comment",
  "summary": "Brief summary of the review (2-3 sentences)",
  "issues": [
    {
      "category": "correctness" | "completeness" | "code_quality" | "best_practices" | "security" | "testing" | "documentation" | "performance",
      "severity": "critical" | "major" | "minor" | "suggestion",
      "description": "Clear description of the issue",
      "suggestion": "Optional suggestion for how to fix",
      "file": "Optional file path",
      "line": "Optional line number"
    }
  ]
}

- Use "request_changes" if there are critical or major issues
- Use "comment" if there are only minor issues or suggestions
- Use "approve" only if there are no significant issues
- Include at least a summary even if there are no issues`;
};
