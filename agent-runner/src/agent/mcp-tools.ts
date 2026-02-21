import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { PlaneConfig } from "../config";
import { addComment, addLink, updateIssue } from "../plane/client";

type McpToolsContext = {
  planeConfig: PlaneConfig;
  projectId: string;
  issueId: string;
  taskDisplayId: string;
  planReviewStateId: string | null;
  inReviewStateId: string | null;
  doneStateId: string | null;
};

export const createAgentMcpServer = (ctx: McpToolsContext) => {
  return createSdkMcpServer({
    name: "agent-plane-tools",
    tools: [
      tool(
        "update_task_status",
        "Move the current task to a different workflow state. Use 'plan_review' after posting an implementation plan. Use 'in_review' when implementation is complete and ready for human review. Use 'done' only if explicitly told the task needs no review.",
        { state: z.enum(["plan_review", "in_review", "done"]) },
        async ({ state }) => {
          const stateMap: Record<string, string | null> = {
            plan_review: ctx.planReviewStateId,
            in_review: ctx.inReviewStateId,
            done: ctx.doneStateId,
          };
          const stateId = stateMap[state];

          if (!stateId) {
            return {
              content: [
                {
                  type: "text" as const,
                  text: `State "${state}" not available in this project.`,
                },
              ],
            };
          }

          await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, {
            state: stateId,
          });
          return {
            content: [
              {
                type: "text" as const,
                text: `Task ${ctx.taskDisplayId} moved to ${state}.`,
              },
            ],
          };
        },
      ),

      tool(
        "add_task_comment",
        "Add a progress comment to the current Plane task. Use HTML formatting: <p>, <ul>, <li>, <code>, <strong>. Call this at key milestones to keep the human informed of progress.",
        { comment_html: z.string().describe("HTML-formatted comment content") },
        async ({ comment_html }) => {
          await addComment(
            ctx.planeConfig,
            ctx.projectId,
            ctx.issueId,
            comment_html,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Comment added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),

      tool(
        "add_task_link",
        "Add a link to the current Plane task. Use this to attach the Pull Request URL after creating a PR.",
        {
          title: z.string().describe("Display title for the link"),
          url: z.string().url().describe("The URL to link"),
        },
        async ({ title, url }) => {
          await addLink(
            ctx.planeConfig,
            ctx.projectId,
            ctx.issueId,
            title,
            url,
          );
          return {
            content: [
              {
                type: "text" as const,
                text: `Link "${title}" added to task ${ctx.taskDisplayId}.`,
              },
            ],
          };
        },
      ),
    ],
  });
};
