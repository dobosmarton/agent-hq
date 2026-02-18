import { Bot } from "grammy";
import { EnvSchema, type PlaneConfig } from "./types.js";
import { handleStart, handleHelp } from "./commands/help.js";
import { createAgentHQ } from "./agent/index.js";

const env = EnvSchema.parse(process.env);

const planeConfig: PlaneConfig = {
  apiKey: env.PLANE_API_KEY,
  baseUrl: env.PLANE_BASE_URL,
  workspaceSlug: env.PLANE_WORKSPACE_SLUG,
};

const agent = createAgentHQ(planeConfig, `anthropic/${env.ANTHROPIC_MODEL}`);

const bot = new Bot(env.TELEGRAM_BOT_TOKEN);

// Auth middleware — only respond to allowed user
bot.use(async (ctx, next) => {
  if (String(ctx.from?.id) !== env.ALLOWED_USER_ID) {
    return;
  }
  await next();
});

// Register commands
bot.command("start", (ctx) => handleStart(ctx));
bot.command("help", (ctx) => handleHelp(ctx));
bot.command("clear", async (ctx) => {
  await ctx.reply("Conversation cleared. Send a new message to start fresh.");
});

// Catch-all: send non-command text messages to the LLM agent
bot.on("message:text", async (ctx) => {
  const text = ctx.msg.text;

  // Skip unrecognized commands
  if (text.startsWith("/")) return;

  const chatId = String(ctx.chat.id);
  const userId = String(ctx.from.id);

  try {
    await ctx.replyWithChatAction("typing");

    const result = await agent.generate(text, {
      memory: {
        thread: chatId,
        resource: userId,
      },
    });

    const reply = result.text || "Done.";

    // Telegram has a 4096 char limit — split if needed
    if (reply.length <= 4096) {
      await ctx.reply(reply);
    } else {
      for (let i = 0; i < reply.length; i += 4096) {
        await ctx.reply(reply.slice(i, i + 4096));
      }
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LLM error:", message);
    await ctx.reply("Something went wrong processing your message. Try again or /help for info.");
  }
});

// Error handler
bot.catch((err) => {
  console.error("Bot error:", err.message);
});

// Start
bot.start({
  onStart: () => {
    console.log("Agent HQ bot started (with LLM agent)");
  },
});
