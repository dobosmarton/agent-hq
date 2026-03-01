import type { Context } from "grammy";
import {
  formatErrorMessage,
  formatFinalMessage,
  formatProgressMessage,
  type ProgressStep,
  type ProgressStepStatus,
} from "./progress-formatter";

type ProgressTrackerConfig = {
  enabled: boolean;
  updateIntervalMs: number;
};

export const createProgressTracker = (ctx: Context, config: ProgressTrackerConfig) => {
  if (!config.enabled) {
    return {
      start: async (): Promise<void> => {},
      update: async (
        _step: string,
        _status: ProgressStepStatus,
        _details?: string
      ): Promise<void> => {},
      complete: async (_finalMessage: string): Promise<void> => {},
      error: async (_errorMessage: string): Promise<void> => {},
    };
  }

  let messageId: number | null = null;
  const steps: ProgressStep[] = [];
  const startTime = Date.now();
  let lastUpdateTime = 0;
  let isCompleted = false;

  const MAX_STEPS = 10;

  const editMessage = async (text: string): Promise<void> => {
    if (messageId === null || isCompleted) return;

    try {
      await ctx.api.editMessageText(ctx.chat!.id, messageId, text, {
        parse_mode: "HTML",
      });
    } catch (err) {
      // If edit fails (e.g., message too old or deleted), send new message
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to edit progress message: ${errorMsg}`);

      // Try sending a new message instead
      try {
        const newMsg = await ctx.reply(text, { parse_mode: "HTML" });
        messageId = newMsg.message_id;
      } catch (sendErr) {
        console.error(
          `Failed to send new progress message: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`
        );
      }
    }
  };

  const updateProgress = async (): Promise<void> => {
    if (messageId === null || isCompleted) return;

    const now = Date.now();
    if (now - lastUpdateTime < config.updateIntervalMs) {
      return;
    }

    lastUpdateTime = now;
    const message = formatProgressMessage(steps, startTime);
    await editMessage(message);
  };

  return {
    start: async (): Promise<void> => {
      try {
        const msg = await ctx.reply("⏳ Processing your request...", {
          parse_mode: "HTML",
        });
        messageId = msg.message_id;
        lastUpdateTime = Date.now();
      } catch (err) {
        console.error(
          `Failed to send initial progress message: ${err instanceof Error ? err.message : String(err)}`
        );
      }
    },

    update: async (step: string, status: ProgressStepStatus, details?: string): Promise<void> => {
      if (isCompleted) return;

      // Find existing step or add new one
      const existingStepIndex = steps.findIndex((s) => s.name === step);
      const stepData: ProgressStep = {
        name: step,
        status,
        details,
        timestamp: Date.now(),
      };

      if (existingStepIndex !== -1) {
        steps[existingStepIndex] = stepData;
      } else {
        steps.push(stepData);
        // Keep only last MAX_STEPS steps
        if (steps.length > MAX_STEPS) {
          steps.shift();
        }
      }

      // Fire-and-forget update with rate limiting
      void updateProgress().catch((err: unknown) => {
        console.error(
          `Progress update failed: ${err instanceof Error ? err.message : String(err)}`
        );
      });
    },

    complete: async (finalMessage: string): Promise<void> => {
      if (isCompleted) return;
      isCompleted = true;

      if (messageId === null) {
        // No progress message was sent, just send final message
        try {
          await ctx.reply(formatFinalMessage(finalMessage), {
            parse_mode: "HTML",
          });
        } catch (err) {
          console.error(
            `Failed to send final message: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        return;
      }

      // Replace progress message with final result
      try {
        await ctx.api.editMessageText(ctx.chat!.id, messageId, formatFinalMessage(finalMessage), {
          parse_mode: "HTML",
        });
      } catch (err) {
        // If edit fails, send new message
        console.error(
          `Failed to edit final message: ${err instanceof Error ? err.message : String(err)}`
        );
        try {
          await ctx.reply(formatFinalMessage(finalMessage), {
            parse_mode: "HTML",
          });
        } catch (sendErr) {
          console.error(
            `Failed to send final message: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`
          );
        }
      }
    },

    error: async (errorMessage: string): Promise<void> => {
      if (isCompleted) return;
      isCompleted = true;

      if (messageId === null) {
        try {
          await ctx.reply(formatErrorMessage(errorMessage), {
            parse_mode: "HTML",
          });
        } catch (err) {
          console.error(
            `Failed to send error message: ${err instanceof Error ? err.message : String(err)}`
          );
        }
        return;
      }

      try {
        await ctx.api.editMessageText(ctx.chat!.id, messageId, formatErrorMessage(errorMessage), {
          parse_mode: "HTML",
        });
      } catch (err) {
        console.error(
          `Failed to edit error message: ${err instanceof Error ? err.message : String(err)}`
        );
        try {
          await ctx.reply(formatErrorMessage(errorMessage), {
            parse_mode: "HTML",
          });
        } catch (sendErr) {
          console.error(
            `Failed to send error message: ${sendErr instanceof Error ? sendErr.message : String(sendErr)}`
          );
        }
      }
    },
  };
};

export type ProgressTracker = ReturnType<typeof createProgressTracker>;
