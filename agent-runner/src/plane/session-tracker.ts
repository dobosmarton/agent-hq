import type { PlaneComment } from "./types";

export type SessionMetadata = {
  sessionId: string;
  startTime: string;
  endTime?: string;
  branchName: string;
  phase: "planning" | "implementation";
  commentsReviewedCount: number;
};

const SESSION_MARKER_START = "<!-- AGENT_SESSION_METADATA";
const SESSION_MARKER_END = "-->";

/**
 * Extract session metadata from a comment's HTML
 */
const extractSessionMetadata = (
  commentHtml: string,
): SessionMetadata | null => {
  const startIdx = commentHtml.indexOf(SESSION_MARKER_START);
  if (startIdx === -1) return null;

  const endIdx = commentHtml.indexOf(SESSION_MARKER_END, startIdx);
  if (endIdx === -1) return null;

  const jsonStr = commentHtml
    .slice(startIdx + SESSION_MARKER_START.length, endIdx)
    .trim();

  try {
    return JSON.parse(jsonStr) as SessionMetadata;
  } catch {
    return null;
  }
};

/**
 * Find the latest session metadata from comments
 */
export const findLatestSession = (
  comments: PlaneComment[],
): SessionMetadata | null => {
  // Sort comments by created_at descending (newest first)
  const sorted = [...comments].sort(
    (a, b) =>
      new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
  );

  for (const comment of sorted) {
    const metadata = extractSessionMetadata(comment.comment_html);
    if (metadata) return metadata;
  }

  return null;
};

/**
 * Create a comment with session metadata embedded
 */
export const createSessionComment = (metadata: SessionMetadata): string => {
  const hiddenMetadata = `${SESSION_MARKER_START}
${JSON.stringify(metadata, null, 2)}
${SESSION_MARKER_END}`;

  return `<p><strong>Agent session started</strong></p>
<p>Branch: <code>${metadata.branchName}</code></p>
<p>Phase: ${metadata.phase}</p>
${hiddenMetadata}`;
};

/**
 * Generate a unique session ID
 */
export const generateSessionId = (): string => {
  return `session-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
};
