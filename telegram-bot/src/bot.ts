import { Bot } from "grammy";
import { createAgentHQ } from "./agent/index";
import { handleHelp, handleStart } from "./commands/help";
import { smartChunkMessage } from "./formatter";
import { EnvSchema, type PlaneConfig } from "./types";
import { extractTaskId, sendReply } from "./utils";

const env = EnvSchema.parse(process.env);

const planeConfig: PlaneConfig = {
  apiKey: env.PLANE_API_KEY,
  baseUrl: env.PLANE_BASE_URL,
  workspaceSlug: env.PLANE_WORKSPACE_SLUG,
};

const agent = createAgentHQ({
  planeConfig,
  model: `anthropic/${env.ANTHROPIC_MODEL}`,
  agentRunnerUrl: env.AGENT_RUNNER_URL,
});

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
  await ctx.reply("Conversation cleared. Send a new message to start fresh.", {
    parse_mode: "HTML",
  });
});

// Reply relay: forward replies to agent questions to the agent-runner
bot.on("message:text").filter(
  (ctx) => !!ctx.msg.reply_to_message?.text?.includes("Agent needs help") && !!env.AGENT_RUNNER_URL,
  async (ctx) => {
    const originalText = ctx.msg.reply_to_message?.text ?? "";
    const taskId = extractTaskId(originalText);
    if (!taskId) return;
    const answer = ctx.msg.text;

    try {
      const res = await fetch(`${env.AGENT_RUNNER_URL}/answers/${taskId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answer }),
      });

      if (res.ok) {
        await ctx.reply(`✅ Answer relayed to agent working on ${taskId}.`, {
          parse_mode: "HTML",
        });
      } else {
        await ctx.reply(`⚠️ Could not relay answer (agent may not be waiting).`, {
          parse_mode: "HTML",
        });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      console.error(`Failed to relay answer for ${taskId}: ${msg}`);
      await ctx.reply(`⚠️ Failed to reach agent runner.`, {
        parse_mode: "HTML",
      });
    }
  }
);

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
    // Use smart chunking that respects formatting boundaries
    for (const chunk of smartChunkMessage(reply)) {
      await sendReply(ctx, chunk);
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("LLM error:", message);
    await ctx.reply(
      "⚠️ Something went wrong processing your message. Try again or /help for info.",
      { parse_mode: "HTML" }
    );
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
