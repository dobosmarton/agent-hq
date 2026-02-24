import { resolve } from "node:path";
import { createAgentManager } from "./agent/manager";
import { buildPlaneConfig, loadConfig, loadEnv } from "./config";
import { updateIssue } from "./plane/client";
import { createTaskPoller } from "./poller/task-poller";
import { createTaskQueue } from "./queue/task-queue";
import { createStatePersistence } from "./state/persistence";
import { createNoopNotifier, createNotifier } from "./telegram/notifier";
import { startWebhookServer } from "./webhooks/server";
import { ensureWorktreeGitignore } from "./worktree/manager";

const RETRYABLE_ERRORS = new Set(["rate_limited", "unknown"]);

const main = async (): Promise<void> => {
  console.log("Agent Runner starting...");

  // Load configuration
  const config = loadConfig();
  const env = loadEnv();
  const planeConfig = buildPlaneConfig(config, env);

  // Initialize Telegram (optional — no-op when tokens missing)
  const notifier =
    env.TELEGRAM_BOT_TOKEN && env.TELEGRAM_CHAT_ID
      ? createNotifier({
          botToken: env.TELEGRAM_BOT_TOKEN,
          chatId: env.TELEGRAM_CHAT_ID,
        })
      : createNoopNotifier();

  // Ensure .worktrees/ is gitignored in all repos
  for (const projectConfig of Object.values(config.projects)) {
    try {
      ensureWorktreeGitignore(projectConfig.repoPath);
    } catch (err) {
      console.warn(
        `Could not update .gitignore in ${projectConfig.repoPath}: ${err}`,
      );
    }
  }

  // Initialize task poller (fetches projects, labels, states from Plane)
  const taskPoller = createTaskPoller(planeConfig, config);
  await taskPoller.initialize();

  // Start webhook server if enabled
  if (config.webhook.enabled) {
    try {
      await startWebhookServer(config, env, planeConfig, taskPoller);
    } catch (err) {
      console.error("Failed to start webhook server:", err);
      console.warn("Continuing without webhook server...");
    }
  } else {
    console.log("Webhook server disabled in config");
  }

  // Initialize state persistence
  const statePath =
    env.STATE_PATH ?? resolve(process.cwd(), "state/runner-state.json");
  const statePersistence = createStatePersistence(statePath);

  // Initialize task queue
  const queue = createTaskQueue(config.agent.retryBaseDelayMs);

  // Restore queued tasks from previous run
  const savedState = statePersistence.load();
  if (savedState.queuedTasks?.length) {
    queue.hydrate(savedState.queuedTasks);
    console.log(
      `Restored ${savedState.queuedTasks.length} queued tasks from state`,
    );
  }

  // Recover orphaned agents from previous run
  const orphaned = Object.values(savedState.activeAgents).filter(
    (a) => a.status === "running" || a.status === "blocked",
  );
  for (const agent of orphaned) {
    const slug = `${agent.task.projectIdentifier}-${agent.task.sequenceId}`;
    console.log(`Recovering orphaned agent ${slug}`);
    queue.enqueue(agent.task);
    const cache = taskPoller.getProjectCache(agent.task.projectIdentifier);
    if (cache) {
      try {
        await updateIssue(
          planeConfig,
          agent.task.projectId,
          agent.task.issueId,
          {
            state: cache.todoStateId,
          },
        );
      } catch (err) {
        console.error(`Failed to reset state for ${slug}:`, err);
      }
    }
  }

  // Central state save — single writer for both manager and queue state
  const saveState = (): void => {
    try {
      statePersistence.save({
        ...agentManager.getState(),
        queuedTasks: queue.toJSON(),
      });
    } catch (err) {
      console.error("Failed to persist state:", err);
    }
  };

  // Initialize agent manager with completion callback
  const agentManager = createAgentManager({
    planeConfig,
    config,
    notifier,
    taskPoller,
    statePersistence,
    onAgentDone: (task, result, retryCount) => {
      const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;

      // Handle retryable errors
      const isRetryable =
        (result.errorType && RETRYABLE_ERRORS.has(result.errorType)) ||
        result.crashed;

      if (isRetryable && retryCount < config.agent.maxRetries) {
        const nextRetry = retryCount + 1;
        const delay = Math.round(
          config.agent.retryBaseDelayMs * Math.pow(2, retryCount),
        );
        const reason = result.crashed
          ? `Crashed: ${result.error}`
          : `Error: ${result.errorType}`;

        console.log(
          `Agent ${taskSlug} failed (${reason}), scheduling retry ${nextRetry}/${config.agent.maxRetries} in ${delay / 1000}s`,
        );

        notifier
          .sendMessage(
            `<b>Retrying ${taskSlug}</b>\n${reason}\nAttempt ${nextRetry}/${config.agent.maxRetries} in ${delay / 1000}s`,
          )
          .catch(() => {});

        // Move task back to Todo for re-pickup
        const cache = taskPoller.getProjectCache(task.projectIdentifier);
        if (cache) {
          updateIssue(planeConfig, task.projectId, task.issueId, {
            state: cache.todoStateId,
          }).catch((err) =>
            console.error(`Failed to reset state for ${taskSlug}:`, err),
          );
        }

        queue.requeue(task, nextRetry);
      }

      saveState();
    },
  });

  // Start polling loop
  console.log(
    `Polling every ${config.agent.pollIntervalMs}ms, spawning every ${config.agent.spawnDelayMs}ms (max ${config.agent.maxConcurrent} concurrent)`,
  );
  await notifier.sendMessage(
    "<b>Agent Runner started</b>\nPolling for tasks...",
  );

  // Save initial state (clears orphaned agents)
  saveState();

  // Discovery: find tasks and enqueue them
  const discoveryCycle = async (): Promise<void> => {
    try {
      await agentManager.checkStaleAgents();

      const maxToDiscover = config.agent.maxConcurrent * 2;
      const tasks = await taskPoller.pollForTasks(maxToDiscover);

      for (const task of tasks) {
        // Skip if already active or queued
        if (agentManager.isTaskActive(task.issueId)) continue;
        if (queue.has(task.issueId)) continue;

        // Skip if no project config — don't claim tasks we can't handle
        if (!config.projects[task.projectIdentifier]) {
          console.warn(
            `Skipping task ${task.projectIdentifier}-${task.sequenceId}: no project config`,
          );
          continue;
        }

        const claimed = await taskPoller.claimTask(task);
        if (!claimed) continue;

        const taskId = `${task.projectIdentifier}-${task.sequenceId}`;
        console.log(`Claimed task ${taskId}: "${task.title}"`);
        queue.enqueue(task);
        saveState();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Discovery cycle error: ${msg}`);
    }
  };

  // Processing: dequeue and spawn agents one at a time
  const processCycle = async (): Promise<void> => {
    try {
      const availableSlots =
        config.agent.maxConcurrent - agentManager.activeCount();
      if (availableSlots <= 0) return;

      const entry = queue.dequeue();
      if (!entry) return;

      const taskId = `${entry.task.projectIdentifier}-${entry.task.sequenceId}`;
      if (entry.retryCount > 0) {
        console.log(`Dequeued ${taskId} for retry attempt ${entry.retryCount}`);
      }

      const result = await agentManager.spawnAgent(
        entry.task,
        entry.retryCount,
      );

      if (
        result.outcome === "rejected" &&
        result.reason === "budget_exceeded"
      ) {
        // Budget exceeded — re-enqueue for later
        await notifier.sendMessage(
          `<b>Budget limit reached</b>\nDaily spend: $${agentManager.getDailySpend().toFixed(2)} / $${agentManager.getDailyBudget()}\nRe-queuing <code>${taskId}</code>: ${entry.task.title}`,
        );
        queue.enqueue(entry.task);
      } else if (
        result.outcome === "rejected" &&
        result.reason === "no_project_config"
      ) {
        // No config — release the task back to Plane
        taskPoller.releaseTask(entry.task.issueId);
        const cache = taskPoller.getProjectCache(entry.task.projectIdentifier);
        if (cache) {
          await updateIssue(
            planeConfig,
            entry.task.projectId,
            entry.task.issueId,
            { state: cache.todoStateId },
          ).catch(() => {});
        }
      }

      saveState();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Process cycle error: ${msg}`);
    }
  };

  // Initial discovery
  await discoveryCycle();
  // Initial process
  await processCycle();

  // Recurring intervals
  const discoveryInterval = setInterval(
    discoveryCycle,
    config.agent.pollIntervalMs,
  );
  const processInterval = setInterval(processCycle, config.agent.spawnDelayMs);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("Shutting down...");
    clearInterval(discoveryInterval);
    clearInterval(processInterval);

    saveState();

    const active = agentManager.getActiveAgents();
    if (active.length > 0) {
      const names = active
        .map((a) => `${a.task.projectIdentifier}-${a.task.sequenceId}`)
        .join(", ");
      await notifier
        .sendMessage(
          `<b>Agent Runner shutting down</b>\n${active.length} agent(s) still running: ${names}`,
        )
        .catch(() => {});
    }

    process.exit(0);
  };

  process.on("SIGINT", () => void shutdown());
  process.on("SIGTERM", () => void shutdown());
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
