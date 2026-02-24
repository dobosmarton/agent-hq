import type { PlaneComment } from "../plane/types";
import type { CommentAnalysis } from "../plane/comment-analyzer";
import {
  extractPlanFromComments,
  summarizeNewFeedback,
} from "../plane/comment-analyzer";

/**
 * Create a "resuming work" comment for the task
 */
export const createResumeComment = (
  analysis: CommentAnalysis,
  branchName: string,
  gitLog: string,
  commitCount: number,
): string => {
  const newFeedbackSummary = summarizeNewFeedback(
    analysis.newCommentsSinceAgent,
  );

  const previousWorkSection =
    commitCount > 0
      ? `
<p><strong>Previous work completed:</strong></p>
<ul>
<li>${commitCount} commit(s) found on this branch</li>
</ul>
<details>
<summary>Commit history</summary>
<pre>${gitLog || "No commits yet"}</pre>
</details>
`
      : "<p><strong>Previous work:</strong> Branch exists but no commits yet.</p>";

  const feedbackSection =
    analysis.newCommentsSinceAgent.length > 0
      ? `
<p><strong>New feedback from comments:</strong></p>
<pre>${newFeedbackSummary}</pre>
`
      : "<p><strong>New feedback:</strong> No new user comments since last work session.</p>";

  return `<!-- AGENT_PROGRESS -->
<p>✅ <strong>Resuming work on this task</strong></p>

<p><strong>Found existing branch:</strong> <code>${branchName}</code></p>

${previousWorkSection}

${feedbackSection}

<p><strong>Plan for this session:</strong></p>
<ul>
<li>Review existing work and new feedback</li>
<li>Continue implementation from where it left off</li>
<li>Incorporate any new requirements from user comments</li>
<li>Complete remaining acceptance criteria</li>
</ul>

<p>Proceeding with implementation...</p>`;
};

/**
 * Format user comments for prompt inclusion with clear labeling
 */
export const formatUserCommentsForPrompt = (
  comments: PlaneComment[],
): string => {
  if (comments.length === 0) {
    return "";
  }

  const formatted = comments
    .map((c) => {
      const date = new Date(c.created_at).toISOString().split("T")[0];
      return `### User Feedback (${date})
${c.comment_html}
`;
    })
    .join("\n\n");

  return `## New User Feedback Since Last Work Session

${formatted}`;
};

/**
 * Build a resume context section for the agent prompt
 */
export const buildResumeContext = (
  analysis: CommentAnalysis,
  gitLog: string,
  gitDiff: string,
  lastCommit: string | null,
): string => {
  const plan = extractPlanFromComments(analysis.allComments);

  const previousWorkSection = `
## Previous Work on This Branch

${lastCommit ? `**Last commit:** ${lastCommit}` : "**No commits yet on this branch**"}

### Commit History
\`\`\`
${gitLog || "No commits"}
\`\`\`

### Changes Summary
\`\`\`
${gitDiff || "No changes"}
\`\`\`
`;

  const feedbackSection =
    analysis.newCommentsSinceAgent.length > 0
      ? formatUserCommentsForPrompt(analysis.newCommentsSinceAgent)
      : "";

  return `
${previousWorkSection}

${feedbackSection}

${plan ? `## Implementation Plan\n\n${plan}` : ""}

## Important Context

This task is being **resumed** from previous work. You are continuing implementation on an existing branch.

- Review the previous work carefully to understand what has been done
- Incorporate any new user feedback into your implementation
- Do not redo work that has already been completed
- Build on top of existing changes rather than starting fresh
`;
};
