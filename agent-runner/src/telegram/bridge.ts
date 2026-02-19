import { z } from "zod";
import { createServer, type Server } from "node:http";
import type { Notifier } from "./notifier.js";

type PendingQuestion = {
  taskId: string;
  messageId: number;
  resolve: (answer: string) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

const AnswerBodySchema = z.object({
  answer: z.string(),
});

const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const ANSWER_PORT = 3847;

export const createTelegramBridge = (notifier: Notifier) => {
  const pending = new Map<string, PendingQuestion>();
  let server: Server | null = null;

  const startAnswerServer = (): void => {
    server = createServer(async (req, res) => {
      // POST /answers/{taskId}
      if (req.method === "POST" && req.url?.startsWith("/answers/")) {
        const taskId = req.url.slice("/answers/".length);
        const question = pending.get(taskId);

        if (!question) {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "No pending question for this task" }));
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = AnswerBodySchema.parse(JSON.parse(Buffer.concat(chunks).toString()));

        clearTimeout(question.timeoutHandle);
        pending.delete(taskId);
        question.resolve(body.answer);

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // Health check
      if (req.method === "GET" && req.url === "/health") {
        res.writeHead(200);
        res.end(JSON.stringify({ ok: true, pending: pending.size }));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(ANSWER_PORT, "127.0.0.1", () => {
      console.log(`Answer server listening on http://127.0.0.1:${ANSWER_PORT}`);
    });
  };

  const askAndWait = async (taskId: string, question: string): Promise<string> => {
    const messageId = await notifier.agentBlocked(taskId, question);

    return new Promise<string>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        pending.delete(taskId);
        resolve("[No answer received within timeout. Proceeding with best judgment.]");
      }, DEFAULT_TIMEOUT_MS);

      pending.set(taskId, { taskId, messageId, resolve, timeoutHandle });
    });
  };

  const stop = (): void => {
    for (const q of pending.values()) {
      clearTimeout(q.timeoutHandle);
      q.resolve("[Agent runner shutting down]");
    }
    pending.clear();
    server?.close();
  };

  return { startAnswerServer, askAndWait, stop };
};

export type TelegramBridge = ReturnType<typeof createTelegramBridge>;
