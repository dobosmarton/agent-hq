import { serve } from "@hono/node-server";
import { createRoute, OpenAPIHono, z } from "@hono/zod-openapi";
import type { AgentManager } from "../agent/manager";
import type { TaskQueue } from "../queue/task-queue";
import type { Notifier } from "./notifier";

type PendingQuestion = {
  taskId: string;
  messageId: number;
  resolve: (answer: string) => void;
  timeoutHandle: ReturnType<typeof setTimeout>;
};

// --- Hono env type with context variables ---

type BridgeDeps = {
  notifier: Notifier;
  queue?: TaskQueue;
  agentManager?: AgentManager;
};

type BridgeEnv = {
  Variables: {
    deps: BridgeDeps;
    pending: Map<string, PendingQuestion>;
  };
};

// --- Zod schemas ---

const AnswerBodySchema = z.object({
  answer: z.string(),
});

const QueueEntrySchema = z.object({
  issueId: z.string(),
  projectIdentifier: z.string(),
  sequenceId: z.number(),
  title: z.string(),
  retryCount: z.number(),
  nextAttemptAt: z.string().nullable(),
  enqueuedAt: z.string(),
});

const ActiveAgentSchema = z.object({
  issueId: z.string(),
  projectIdentifier: z.string(),
  sequenceId: z.number(),
  title: z.string(),
  phase: z.string(),
  status: z.string(),
  startedAt: z.string(),
  costUsd: z.number().optional(),
  retryCount: z.number(),
});

const StatusResponseSchema = z.object({
  queue: z.array(QueueEntrySchema),
  active: z.array(ActiveAgentSchema),
  dailySpend: z.number(),
  dailyBudget: z.number(),
});

const ErrorResponseSchema = z.object({
  error: z.string(),
});

const SuccessResponseSchema = z.object({
  ok: z.literal(true),
});

const HealthResponseSchema = z.object({
  ok: z.literal(true),
  pending: z.number(),
});

// --- Route definitions (static metadata, no runtime deps) ---

const statusRoute = createRoute({
  method: "get",
  path: "/status",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: StatusResponseSchema,
        },
      },
      description: "Queue status, active agents, and daily spend",
    },
  },
});

const deleteQueueRoute = createRoute({
  method: "delete",
  path: "/queue/{issueId}",
  request: {
    params: z.object({
      issueId: z.string(),
    }),
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
      description: "Task removed from queue",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Task not found in queue",
    },
    409: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "Task is currently active",
    },
  },
});

const postAnswerRoute = createRoute({
  method: "post",
  path: "/answers/{taskId}",
  request: {
    params: z.object({
      taskId: z.string(),
    }),
    body: {
      content: {
        "application/json": {
          schema: AnswerBodySchema,
        },
      },
    },
  },
  responses: {
    200: {
      content: {
        "application/json": {
          schema: SuccessResponseSchema,
        },
      },
      description: "Answer submitted successfully",
    },
    404: {
      content: {
        "application/json": {
          schema: ErrorResponseSchema,
        },
      },
      description: "No pending question for this task",
    },
  },
});

const healthRoute = createRoute({
  method: "get",
  path: "/health",
  responses: {
    200: {
      content: {
        "application/json": {
          schema: HealthResponseSchema,
        },
      },
      description: "Health check with pending question count",
    },
  },
});

// --- App factory (fresh instance per bridge, deps injected via middleware) ---

const createBridgeApp = (
  deps: BridgeDeps,
  pending: Map<string, PendingQuestion>,
): OpenAPIHono<BridgeEnv> => {
  const app = new OpenAPIHono<BridgeEnv>();

  app.onError((err, c) => {
    console.error(`[Bridge] ${err.message}`, err.stack);
    return c.json({ error: "Internal server error" }, 500);
  });

  app.notFound((c) => {
    return c.json({ error: "Not found" }, 404);
  });

  // Inject deps and pending into every request
  app.use("*", async (c, next) => {
    c.set("deps", deps);
    c.set("pending", pending);
    await next();
  });

  // GET /status
  app.openapi(statusRoute, (c) => {
    const { deps: d } = c.var;

    const queueEntries = (d.queue?.entries() ?? []).map((e) => ({
      issueId: e.task.issueId,
      projectIdentifier: e.task.projectIdentifier,
      sequenceId: e.task.sequenceId,
      title: e.task.title,
      retryCount: e.retryCount,
      nextAttemptAt: e.nextAttemptAt
        ? new Date(e.nextAttemptAt).toISOString()
        : null,
      enqueuedAt: new Date(e.enqueuedAt).toISOString(),
    }));

    const activeAgents = (d.agentManager?.getActiveAgents() ?? []).map((a) => ({
      issueId: a.task.issueId,
      projectIdentifier: a.task.projectIdentifier,
      sequenceId: a.task.sequenceId,
      title: a.task.title,
      phase: a.phase,
      status: a.status,
      startedAt: new Date(a.startedAt).toISOString(),
      costUsd: a.costUsd,
      retryCount: a.retryCount,
    }));

    return c.json(
      {
        queue: queueEntries,
        active: activeAgents,
        dailySpend: d.agentManager?.getDailySpend() ?? 0,
        dailyBudget: d.agentManager?.getDailyBudget() ?? 0,
      },
      200,
    );
  });

  // DELETE /queue/:issueId
  app.openapi(deleteQueueRoute, (c) => {
    const { deps: d } = c.var;
    const { issueId } = c.req.valid("param");

    if (d.agentManager?.isTaskActive(issueId)) {
      return c.json(
        { error: "Task is currently active and cannot be removed" },
        409,
      );
    }

    const removed = d.queue?.remove(issueId) ?? false;
    if (removed) {
      return c.json({ ok: true as const }, 200);
    }

    return c.json({ error: "Task not found in queue" }, 404);
  });

  // POST /answers/:taskId
  app.openapi(postAnswerRoute, async (c) => {
    const { pending: p } = c.var;
    const { taskId } = c.req.valid("param");
    const body = c.req.valid("json");
    const question = p.get(taskId);

    if (!question) {
      return c.json({ error: "No pending question for this task" }, 404);
    }

    clearTimeout(question.timeoutHandle);
    p.delete(taskId);
    question.resolve(body.answer);

    return c.json({ ok: true as const }, 200);
  });

  // GET /health
  app.openapi(healthRoute, (c) => {
    return c.json({ ok: true as const, pending: c.var.pending.size }, 200);
  });

  return app;
};

// --- Bridge (manages pending questions + answer server) ---

const DEFAULT_TIMEOUT_MS = 2 * 60 * 60 * 1000; // 2 hours
const ANSWER_PORT = 3847;

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
