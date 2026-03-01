import { Hono } from "hono";
import { serve } from "@hono/node-server";
import { z } from "zod";
import type { AgentManager } from "../agent/manager";
import type { TaskQueue } from "../queue/task-queue";
import type { Notifier } from "./notifier";

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

type BridgeDeps = {
  notifier: Notifier;
  queue?: TaskQueue;
  agentManager?: AgentManager;
};

const createBridgeApp = (
  deps: BridgeDeps,
  pending: Map<string, PendingQuestion>,
): Hono => {
  const app = new Hono();

  // GET /status — queue + active agents + daily spend
  app.get("/status", (c) => {
    const queueEntries = (deps.queue?.entries() ?? []).map((e) => ({
      issueId: e.task.issueId,
      projectIdentifier: e.task.projectIdentifier,
      sequenceId: e.task.sequenceId,
      title: e.task.title,
      retryCount: e.retryCount,
      nextAttemptAt: e.nextAttemptAt,
      enqueuedAt: e.enqueuedAt,
    }));

    const activeAgents = (deps.agentManager?.getActiveAgents() ?? []).map(
      (a) => ({
        issueId: a.task.issueId,
        projectIdentifier: a.task.projectIdentifier,
        sequenceId: a.task.sequenceId,
        title: a.task.title,
        phase: a.phase,
        status: a.status,
        startedAt: a.startedAt,
        costUsd: a.costUsd,
        retryCount: a.retryCount,
      }),
    );

    return c.json({
      queue: queueEntries,
      active: activeAgents,
      dailySpend: deps.agentManager?.getDailySpend() ?? 0,
      dailyBudget: deps.agentManager?.getDailyBudget() ?? 0,
    });
  });

  // DELETE /queue/:issueId — remove task from queue
  app.delete("/queue/:issueId", (c) => {
    const issueId = c.req.param("issueId");

    if (deps.agentManager?.isTaskActive(issueId)) {
      return c.json(
        { error: "Task is currently active and cannot be removed" },
        409,
      );
    }

    const removed = deps.queue?.remove(issueId) ?? false;
    if (removed) {
      return c.json({ ok: true });
    }

    return c.json({ error: "Task not found in queue" }, 404);
  });

  // POST /answers/:taskId
  app.post("/answers/:taskId", async (c) => {
    const taskId = c.req.param("taskId");
    const question = pending.get(taskId);

    if (!question) {
      return c.json({ error: "No pending question for this task" }, 404);
    }

    const body = AnswerBodySchema.parse(await c.req.json());

    clearTimeout(question.timeoutHandle);
    pending.delete(taskId);
    question.resolve(body.answer);

    return c.json({ ok: true });
  });

  // Health check
  app.get("/health", (c) => {
    return c.json({ ok: true, pending: pending.size });
  });

  return app;
};

export const createTelegramBridge = (deps: BridgeDeps) => {
  const pending = new Map<string, PendingQuestion>();
  let serverInstance: ReturnType<typeof serve> | null = null;

  const startAnswerServer = (): void => {
    const app = createBridgeApp(deps, pending);

    serverInstance = serve(
      {
        fetch: app.fetch,
        port: ANSWER_PORT,
        hostname: "127.0.0.1",
      },
      () => {
        console.log(
          `Answer server listening on http://127.0.0.1:${ANSWER_PORT}`,
        );
      },
    );
  };

  const askAndWait = async (
    taskId: string,
    question: string,
  ): Promise<string> => {
    const messageId = await deps.notifier.agentBlocked(taskId, question);

    return new Promise<string>((resolve) => {
      const timeoutHandle = setTimeout(() => {
        pending.delete(taskId);
        resolve(
          "[No answer received within timeout. Proceeding with best judgment.]",
        );
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
    serverInstance?.close();
  };

  return { startAnswerServer, askAndWait, stop };
};

export type TelegramBridge = ReturnType<typeof createTelegramBridge>;
