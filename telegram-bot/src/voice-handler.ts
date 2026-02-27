import type { Context } from "grammy";
import { InlineKeyboard } from "grammy";
import type { VoiceTranscriptionResult } from "./types";
import { storePendingCommand } from "./pending-commands";
import { formatDuration } from "./utils";

/**
 * Download a voice file from Telegram
 */
const downloadVoiceFile = async (ctx: Context, fileId: string): Promise<Buffer> => {
  const file = await ctx.api.getFile(fileId);

  if (!file.file_path) {
    throw new Error("File path not available");
  }

  const fileUrl = `https://api.telegram.org/file/bot${ctx.api.token}/${file.file_path}`;
  const response = await fetch(fileUrl);

  if (!response.ok) {
    throw new Error(`Failed to download file: ${response.statusText}`);
  }

  const arrayBuffer = await response.arrayBuffer();
  return Buffer.from(arrayBuffer);
};

/**
 * Transcribe voice using OpenAI Whisper API
 */
const transcribeVoice = async (
  audioBuffer: Buffer,
  apiKey: string
): Promise<VoiceTranscriptionResult> => {
  const formData = new FormData();

  // Create a File from the buffer (OGG/Opus format from Telegram)
  const audioBlob = new Blob([audioBuffer], { type: "audio/ogg" });
  const audioFile = new File([audioBlob], "voice.ogg", { type: "audio/ogg" });

  formData.append("file", audioFile);
  formData.append("model", "whisper-1");
  formData.append("response_format", "verbose_json");

  const response = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`Whisper API error: ${response.status} ${errorText}`);
  }

  const result = (await response.json()) as { text: string; duration: number };

  return {
    text: result.text.trim(),
    duration: Math.round(result.duration),
  };
};

/**
 * Handle voice message with confirmation flow
 */
export const handleVoiceMessage = async (
  ctx: Context,
  apiKey: string,
  maxDurationSeconds: number,
  confirmationRequired: boolean
): Promise<{ commandId: string; text: string } | null> => {
  const voice = ctx.msg?.voice;

  if (!voice) {
    return null;
  }

  const userId = String(ctx.from?.id);

  try {
    // Validate duration
    if (voice.duration > maxDurationSeconds) {
      await ctx.reply(
        `⚠️ Voice message too long (${formatDuration(voice.duration)}). Maximum is ${formatDuration(maxDurationSeconds)}.`,
        { parse_mode: "HTML" }
      );
      return null;
    }

    // Show processing status
    await ctx.replyWithChatAction("typing");
    const statusMsg = await ctx.reply("🎤 Processing voice message...", { parse_mode: "HTML" });

    // Download voice file
    const audioBuffer = await downloadVoiceFile(ctx, voice.file_id);

    // Transcribe
    const result = await transcribeVoice(audioBuffer, apiKey);

    // Delete processing status
    if (ctx.chat) {
      await ctx.api.deleteMessage(ctx.chat.id, statusMsg.message_id);
    }

    if (!result.text || result.text.length === 0) {
      await ctx.reply(
        "⚠️ Could not understand voice message clearly. Please try again or use text.",
        {
          parse_mode: "HTML",
        }
      );
      return null;
    }

    // Log transcription
    console.log(
      `Voice transcribed (${formatDuration(result.duration)}): "${result.text.substring(0, 50)}${result.text.length > 50 ? "..." : ""}"`
    );

    if (!confirmationRequired) {
      // No confirmation needed — return text directly for processing
      return { commandId: "", text: result.text };
    }

    // Store pending command
    const commandId = storePendingCommand(userId, result.text);

    // Send confirmation message with inline keyboard
    const keyboard = new InlineKeyboard()
      .text("✅ Yes, proceed", `voice_confirm_${commandId}`)
      .text("❌ Cancel", `voice_cancel_${commandId}`);

    await ctx.reply(`🎤 <b>Voice transcribed:</b>\n"${result.text}"\n\nIs this correct?`, {
      parse_mode: "HTML",
      reply_markup: keyboard,
    });

    return { commandId, text: result.text };
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("Voice processing error:", message);

    if (message.includes("Whisper API error") || message.includes("fetch")) {
      await ctx.reply(
        "⚠️ Speech-to-text service temporarily unavailable. Please try again later.",
        { parse_mode: "HTML" }
      );
    } else {
      await ctx.reply("⚠️ Could not process voice message. Please try again or use text.", {
        parse_mode: "HTML",
      });
    }

    return null;
  }
};
