import { createServer, type Server } from "node:http";
import { z } from "zod";
import type { AgentManager } from "../agent/manager";
import type { TaskQueue } from "../queue/task-queue";
import type { Notifier } from "./notifier";
import type { MetricsCollector } from "../metrics/collector";
import type { ExecutionHistory } from "../metrics/history";

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
  metricsCollector?: MetricsCollector;
  executionHistory?: ExecutionHistory;
  startTime?: number;
};

export const createTelegramBridge = (deps: BridgeDeps) => {
  const pending = new Map<string, PendingQuestion>();
  let server: Server | null = null;

  const startAnswerServer = (): void => {
    server = createServer(async (req, res) => {
      const setCors = () => {
        res.setHeader("Content-Type", "application/json");
      };

      // GET /status — queue + active agents + daily spend + metrics
      if (req.method === "GET" && req.url === "/status") {
        setCors();
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

        const metrics = deps.metricsCollector?.getMetrics();

        res.writeHead(200);
        res.end(
          JSON.stringify({
            queue: queueEntries,
            active: activeAgents,
            dailySpend: deps.agentManager?.getDailySpend() ?? 0,
            dailyBudget: deps.agentManager?.getDailyBudget() ?? 0,
            metrics: metrics ?? null,
            uptime: deps.startTime ? Date.now() - deps.startTime : 0,
          }),
        );
        return;
      }

      // DELETE /queue/{issueId} — remove task from queue
      if (req.method === "DELETE" && req.url?.startsWith("/queue/")) {
        setCors();
        const issueId = req.url.slice("/queue/".length);

        if (deps.agentManager?.isTaskActive(issueId)) {
          res.writeHead(409);
          res.end(
            JSON.stringify({
              error: "Task is currently active and cannot be removed",
            }),
          );
          return;
        }

        const removed = deps.queue?.remove(issueId) ?? false;
        if (removed) {
          res.writeHead(200);
          res.end(JSON.stringify({ ok: true }));
        } else {
          res.writeHead(404);
          res.end(JSON.stringify({ error: "Task not found in queue" }));
        }
        return;
      }

      // POST /answers/{taskId}
      if (req.method === "POST" && req.url?.startsWith("/answers/")) {
        const taskId = req.url.slice("/answers/".length);
        const question = pending.get(taskId);

        if (!question) {
          res.writeHead(404);
          res.end(
            JSON.stringify({ error: "No pending question for this task" }),
          );
          return;
        }

        const chunks: Buffer[] = [];
        for await (const chunk of req) {
          chunks.push(chunk as Buffer);
        }
        const body = AnswerBodySchema.parse(
          JSON.parse(Buffer.concat(chunks).toString()),
        );

        clearTimeout(question.timeoutHandle);
        pending.delete(taskId);
        question.resolve(body.answer);

        res.writeHead(200);
        res.end(JSON.stringify({ ok: true }));
        return;
      }

      // GET /history — execution history with optional filters
      if (req.method === "GET" && req.url?.startsWith("/history")) {
        setCors();
        const url = new URL(req.url, `http://${req.headers.host}`);
        const days = parseInt(url.searchParams.get("days") ?? "7", 10);
        const project = url.searchParams.get("project");

        let executions = deps.executionHistory?.getRecent(100) ?? [];

        // Filter by time range
        const cutoff = Date.now() - days * 24 * 60 * 60 * 1000;
        executions = executions.filter((e) => e.completedAt >= cutoff);

        // Filter by project if specified
        if (project) {
          executions = executions.filter(
            (e) => e.projectIdentifier === project,
          );
        }

        res.writeHead(200);
        res.end(JSON.stringify({ executions }));
        return;
      }

      // GET /errors — recent errors
      if (req.method === "GET" && req.url === "/errors") {
        setCors();
        const errors = deps.executionHistory?.getErrors(50) ?? [];
        res.writeHead(200);
        res.end(JSON.stringify({ errors }));
        return;
      }

      // Health check with thresholds
      if (req.method === "GET" && req.url === "/health") {
        setCors();
        const queueDepth = deps.queue?.size() ?? 0;
        const activeCount = deps.agentManager?.getActiveAgents().length ?? 0;
        const metrics = deps.metricsCollector?.getMetrics();
        const dailySpend = deps.agentManager?.getDailySpend() ?? 0;
        const dailyBudget = deps.agentManager?.getDailyBudget() ?? 0;

        const queueThreshold = 20;
        const budgetThreshold = 0.9;

        const issues: string[] = [];
        if (queueDepth > queueThreshold) {
          issues.push(`Queue depth ${queueDepth} > ${queueThreshold}`);
        }
        if (dailyBudget > 0 && dailySpend / dailyBudget > budgetThreshold) {
          issues.push(
            `Budget ${((dailySpend / dailyBudget) * 100).toFixed(0)}% consumed`,
          );
        }
        if (metrics && metrics.totalTasks > 10 && metrics.successRate < 0.7) {
          issues.push(
            `Success rate ${(metrics.successRate * 100).toFixed(0)}% < 70%`,
          );
        }

        const status = issues.length > 0 ? "degraded" : "healthy";

        res.writeHead(200);
        res.end(
          JSON.stringify({
            ok: true,
            status,
            pending: pending.size,
            queueDepth,
            activeCount,
            dailySpend,
            dailyBudget,
            metrics: metrics ?? null,
            issues,
          }),
        );
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: "Not found" }));
    });

    server.listen(ANSWER_PORT, "127.0.0.1", () => {
      console.log(`Answer server listening on http://127.0.0.1:${ANSWER_PORT}`);
    });
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
    server?.close();
  };

  return { startAnswerServer, askAndWait, stop };
};

export type TelegramBridge = ReturnType<typeof createTelegramBridge>;
