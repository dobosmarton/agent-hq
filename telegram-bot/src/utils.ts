import type { Context } from "grammy";

/**
 * Send a reply with HTML formatting, falling back to plain text
 * if Telegram rejects the HTML (e.g. agent outputs "<50ms").
 */
export const sendReply = async (ctx: Context, text: string): Promise<void> => {
  try {
    await ctx.reply(text, { parse_mode: "HTML" });
  } catch (err) {
    const isParseError = err instanceof Error && err.message.includes("can't parse entities");
    if (isParseError) {
      console.warn("HTML parse failed, retrying without formatting");
      await ctx.reply(text);
    } else {
      throw err;
    }
  }
};

/**
 * Extract a Plane task ID (e.g. "HQ-123", "VERDANDI-42") from text.
 * Returns the first match or null.
 */
export const extractTaskId = (text: string): string | null => {
  const match = text.match(/([A-Z0-9]+-\d+)/);
  return match?.[1] ?? null;
};

/**
 * Split a message into chunks that fit Telegram's 4096 character limit.
 */
export const chunkMessage = (text: string, maxLen = 4096): string[] => {
  if (text.length <= maxLen) return [text];
  const chunks: string[] = [];
  for (let i = 0; i < text.length; i += maxLen) {
    chunks.push(text.slice(i, i + maxLen));
  }
  return chunks;
};
