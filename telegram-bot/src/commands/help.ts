import type { Context } from "grammy";

const HELP_TEXT = [
  "Agent HQ — Manage Plane tasks from Telegram\n",
  "Just type naturally! Examples:",
  '  "List my projects"',
  '  "What tasks are open in Verdandi?"',
  '  "Create a task in Verdandi about rate limiting"',
  '  "What workflow states does Style-swipe have?"\n',
  "Commands:",
  "/clear — Reset conversation",
  "/help — Show this message",
].join("\n");

export const handleStart = async (ctx: Context): Promise<void> => {
  await ctx.reply(`Welcome to Agent HQ!\n\n${HELP_TEXT}`);
};

export const handleHelp = async (ctx: Context): Promise<void> => {
  await ctx.reply(HELP_TEXT);
};
