import { z } from "zod";

const TELEGRAM_API = "https://api.telegram.org";

const TelegramResponseSchema = z.object({
  result: z
    .object({
      message_id: z.number(),
    })
    .optional(),
});

type NotifierConfig = {
  botToken: string;
  chatId: string;
};

export const createNotifier = (config: NotifierConfig) => {
  const sendMessage = async (
    text: string,
    replyToMessageId?: number,
  ): Promise<number> => {
    const res = await fetch(
      `${TELEGRAM_API}/bot${config.botToken}/sendMessage`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          text,
          parse_mode: "HTML",
          ...(replyToMessageId
            ? { reply_to_message_id: replyToMessageId }
            : {}),
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram API error: ${res.status} ${body}`);
      return 0;
    }

    const data = TelegramResponseSchema.parse(await res.json());
    return data.result?.message_id ?? 0;
  };

  const editMessage = async (
    messageId: number,
    text: string,
  ): Promise<boolean> => {
    const res = await fetch(
      `${TELEGRAM_API}/bot${config.botToken}/editMessageText`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          chat_id: config.chatId,
          message_id: messageId,
          text,
          parse_mode: "HTML",
        }),
      },
    );

    if (!res.ok) {
      const body = await res.text();
      console.error(`Telegram edit error: ${res.status} ${body}`);
      return false;
    }

    return true;
  };

  return {
    agentStarted: async (taskId: string, title: string): Promise<number> => {
      return sendMessage(
        `<b>Agent started</b>\n<code>${taskId}</code>: ${title}`,
      );
    },

    agentCompleted: async (taskId: string, title: string): Promise<void> => {
      await sendMessage(
        `<b>Agent completed</b>\n<code>${taskId}</code>: ${title}`,
      );
    },

    agentErrored: async (
      taskId: string,
      title: string,
      error: string,
    ): Promise<void> => {
      await sendMessage(
        `<b>Agent error</b>\n<code>${taskId}</code>: ${title}\n\n<pre>${error.slice(0, 500)}</pre>`,
      );
    },

    agentBlocked: async (taskId: string, question: string): Promise<number> => {
      return sendMessage(
        `<b>Agent needs help</b>\n<code>${taskId}</code>\n\n${question}\n\n<i>Reply to this message to answer.</i>`,
      );
    },

    agentProgress: async (
      messageId: number,
      text: string,
    ): Promise<boolean> => {
      return editMessage(messageId, text);
    },

    sendMessage,
  };
};

export type Notifier = ReturnType<typeof createNotifier>;

export const createNoopNotifier = (): Notifier => ({
  agentStarted: async () => 0,
  agentCompleted: async () => {},
  agentErrored: async () => {},
  agentBlocked: async () => 0,
  agentProgress: async () => false,
  sendMessage: async () => 0,
});
