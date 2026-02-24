import type { PlaneComment } from "./types";
import { PLAN_MARKER } from "../agent/phase";

/**
 * Markers used to identify agent comments
 */
const AGENT_MARKERS = [
  "<!-- AGENT_PLAN -->",
  "<!-- AGENT_PROGRESS -->",
  "<!-- AGENT_SESSION_METADATA",
  "<strong>Agent started",
  "<strong>Agent completed",
];

/**
 * Check if a comment is from an agent based on HTML markers
 */
const isAgentComment = (comment: PlaneComment): boolean => {
  return AGENT_MARKERS.some((marker) => comment.comment_html.includes(marker));
};

export type CommentAnalysis = {
  allComments: PlaneComment[];
  agentComments: PlaneComment[];
  userComments: PlaneComment[];
  latestAgentTimestamp: string | null;
  newCommentsSinceAgent: PlaneComment[];
  hasPlanMarker: boolean;
  hasProgressUpdates: boolean;
};

/**
 * Analyze comments to distinguish agent vs user comments and identify new feedback
 */
export const analyzeComments = (comments: PlaneComment[]): CommentAnalysis => {
  // Sort comments chronologically
  const sorted = [...comments].sort(
    (a, b) =>
      new Date(a.created_at).getTime() - new Date(b.created_at).getTime(),
  );

  const agentComments: PlaneComment[] = [];
  const userComments: PlaneComment[] = [];
  let latestAgentTimestamp: string | null = null;
  let hasPlanMarker = false;
  let hasProgressUpdates = false;

  for (const comment of sorted) {
    if (isAgentComment(comment)) {
      agentComments.push(comment);
      latestAgentTimestamp = comment.created_at;

      if (comment.comment_html.includes(PLAN_MARKER)) {
        hasPlanMarker = true;
      }
      if (comment.comment_html.includes("<!-- AGENT_PROGRESS -->")) {
        hasProgressUpdates = true;
      }
    } else {
      userComments.push(comment);
    }
  }

  // Find new comments since last agent comment
  const newCommentsSinceAgent: PlaneComment[] = [];
  if (latestAgentTimestamp) {
    const latestAgentTime = new Date(latestAgentTimestamp).getTime();
    for (const comment of sorted) {
      if (
        !isAgentComment(comment) &&
        new Date(comment.created_at).getTime() > latestAgentTime
      ) {
        newCommentsSinceAgent.push(comment);
      }
    }
  }

  return {
    allComments: sorted,
    agentComments,
    userComments,
    latestAgentTimestamp,
    newCommentsSinceAgent,
    hasPlanMarker,
    hasProgressUpdates,
  };
};

/**
 * Extract the plan content from comments (if it exists)
 */
export const extractPlanFromComments = (
  comments: PlaneComment[],
): string | null => {
  const planComment = comments.find((c) =>
    c.comment_html.includes(PLAN_MARKER),
  );

  if (!planComment) return null;

  // Extract content after the plan marker
  const html = planComment.comment_html;
  const markerIndex = html.indexOf(PLAN_MARKER);
  if (markerIndex === -1) return null;

  // Get content after marker (skip the marker line itself)
  const afterMarker = html.slice(markerIndex + PLAN_MARKER.length);
  return afterMarker.trim();
};

/**
 * Format user comments for inclusion in agent prompts
 */
export const formatUserCommentsForPrompt = (
  comments: PlaneComment[],
): string => {
  if (comments.length === 0) {
    return "<p>No user feedback yet.</p>";
  }

  return comments
    .map(
      (c) =>
        `<div class="user-comment" data-date="${c.created_at}">${c.comment_html}</div>`,
    )
    .join("\n");
};

/**
 * Generate a summary of new feedback for resume scenarios
 * This is a simple text extraction - could be enhanced with LLM analysis
 */
export const summarizeNewFeedback = (comments: PlaneComment[]): string => {
  if (comments.length === 0) {
    return "No new feedback since last work session.";
  }

  const summary: string[] = [];
  summary.push(
    `${comments.length} new comment(s) from user since last work session:`,
  );

  for (const comment of comments) {
    // Strip HTML tags for basic text extraction
    const text = comment.comment_html
      .replace(/<[^>]*>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    const preview = text.slice(0, 200) + (text.length > 200 ? "..." : "");
    const date = new Date(comment.created_at).toISOString().split("T")[0];
    summary.push(`- [${date}] ${preview}`);
  }

  return summary.join("\n");
};
