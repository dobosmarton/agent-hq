import type { PlaneComment } from "@agent-hq/plane-client";

export const PLAN_MARKER = "<!-- AGENT_PLAN -->";
export const METADATA_MARKER = "<!-- AGENT_METADATA -->";

export type AgentPhase = "planning" | "implementation";

export const detectPhase = (comments: PlaneComment[]): AgentPhase => {
  const hasPlan = comments.some((c) => c.comment_html.includes(PLAN_MARKER));
  return hasPlan ? "implementation" : "planning";
};
