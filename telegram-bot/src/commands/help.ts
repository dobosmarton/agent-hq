import type { Context } from "grammy";

const HELP_TEXT = [
  "<b>📋 Agent HQ</b> — Manage Plane tasks from Telegram\n",
  "Just type naturally! Examples:",
  '  • "List my projects"',
  '  • "What tasks are open in Verdandi?"',
  '  • "Create a task in Verdandi about rate limiting"',
  '  • "What workflow states does Style-swipe have?"\n',
  "<b>Basic Commands:</b>",
  "<code>/clear</code> — Reset conversation",
  "<code>/help</code> — Show this message\n",
  "<b>Agent Monitoring:</b>",
  "<code>/agent_status</code> — Show running agents & metrics",
  "<code>/agent_queue</code> — Show queued tasks",
  "<code>/agent_health</code> — System health check",
  "<code>/agent_history [days]</code> — Recent executions (default: 7d)",
  "<code>/agent_errors</code> — Recent errors",
].join("\n");

export const handleStart = async (ctx: Context): Promise<void> => {
  await ctx.reply(`✅ Welcome to Agent HQ!\n\n${HELP_TEXT}`, {
    parse_mode: "HTML",
  });
};

export const handleHelp = async (ctx: Context): Promise<void> => {
  await ctx.reply(HELP_TEXT, {
    parse_mode: "HTML",
  });
};
