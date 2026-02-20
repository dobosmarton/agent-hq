import type { PlaneComment } from "../plane/types.js";

export const PLAN_MARKER = "<!-- AGENT_PLAN -->";

export type AgentPhase = "planning" | "implementation";

export const detectPhase = (comments: PlaneComment[]): AgentPhase => {
  const hasPlan = comments.some((c) => c.comment_html.includes(PLAN_MARKER));
  return hasPlan ? "implementation" : "planning";
};
