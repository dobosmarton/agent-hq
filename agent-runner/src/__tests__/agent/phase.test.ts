import { describe, it, expect } from "vitest";
import { detectPhase, PLAN_MARKER } from "../../agent/phase.js";
import type { PlaneComment } from "../../plane/types.js";

const makeComment = (html: string): PlaneComment => ({
  id: "comment-1",
  comment_html: html,
  created_at: "2026-02-19T10:00:00Z",
});

describe("detectPhase", () => {
  it("returns 'planning' when no comments exist", () => {
    expect(detectPhase([])).toBe("planning");
  });

  it("returns 'planning' when comments have no plan marker", () => {
    const comments = [
      makeComment("<p>Regular comment</p>"),
      makeComment("<p>Another comment</p>"),
    ];
    expect(detectPhase(comments)).toBe("planning");
  });

  it("returns 'implementation' when a comment contains the plan marker", () => {
    const comments = [
      makeComment("<p>Regular comment</p>"),
      makeComment(`${PLAN_MARKER}<h2>Implementation Plan</h2><p>Do stuff</p>`),
    ];
    expect(detectPhase(comments)).toBe("implementation");
  });

  it("returns 'implementation' when plan marker is embedded in HTML", () => {
    const comments = [makeComment(`<div>${PLAN_MARKER}<h2>Plan</h2></div>`)];
    expect(detectPhase(comments)).toBe("implementation");
  });
});

describe("PLAN_MARKER", () => {
  it("is an HTML comment that won't be visible in rendered HTML", () => {
    expect(PLAN_MARKER).toBe("<!-- AGENT_PLAN -->");
  });
});
