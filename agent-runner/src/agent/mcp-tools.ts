import { createSdkMcpServer, tool } from "@anthropic-ai/claude-agent-sdk";
import { z } from "zod";
import type { PlaneConfig } from "../config.js";
import { updateIssue, addComment } from "../plane/client.js";
import type { TelegramBridge } from "../telegram/bridge.js";

type McpToolsContext = {
  planeConfig: PlaneConfig;
  projectId: string;
  issueId: string;
  taskDisplayId: string;
  inReviewStateId: string | null;
  doneStateId: string | null;
  telegramBridge: TelegramBridge;
};

export const createAgentMcpServer = (ctx: McpToolsContext) => {
  return createSdkMcpServer({
    name: "agent-plane-tools",
    tools: [
      tool(
        "update_task_status",
        "Move the current task to a different workflow state. Use 'in_review' when work is complete and ready for human review. Use 'done' only if explicitly told the task needs no review.",
        { state: z.enum(["in_review", "done"]) },
        async ({ state }) => {
          const stateId = state === "in_review" ? ctx.inReviewStateId : ctx.doneStateId;
          if (!stateId) {
            return {
              content: [
                { type: "text" as const, text: `State "${state}" not available in this project.` },
              ],
            };
          }

          await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, { state: stateId });
          return {
            content: [
              { type: "text" as const, text: `Task ${ctx.taskDisplayId} moved to ${state}.` },
            ],
          };
        }
      ),

      tool(
        "add_task_comment",
        "Add a progress comment to the current Plane task. Use HTML formatting: <p>, <ul>, <li>, <code>, <strong>. Call this at key milestones to keep the human informed of progress.",
        { comment_html: z.string().describe("HTML-formatted comment content") },
        async ({ comment_html }) => {
          await addComment(ctx.planeConfig, ctx.projectId, ctx.issueId, comment_html);
          return {
            content: [
              { type: "text" as const, text: `Comment added to task ${ctx.taskDisplayId}.` },
            ],
          };
        }
      ),

      tool(
        "ask_human",
        "Ask the human operator a question via Telegram. This will block until they reply. Only use this when you genuinely need clarification — do not use it for status updates (use add_task_comment instead).",
        {
          question: z.string().describe("The question to ask the human"),
        },
        async ({ question }) => {
          const answer = await ctx.telegramBridge.askAndWait(ctx.taskDisplayId, question);
          return {
            content: [{ type: "text" as const, text: `Human answered: ${answer}` }],
          };
        }
      ),
    ],
  });
};
