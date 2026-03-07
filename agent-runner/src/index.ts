import type { ReviewOrchestrator } from "@agent-hq/review-agent";
import { createReviewOrchestrator, createGitHubClient } from "@agent-hq/review-agent";
import { createAgentManager } from "@agent-hq/task-agent";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { buildPlaneClient, loadConfig, loadEnv } from "./config";
import { createTaskPoller } from "./poller/task-poller";
import { createTaskQueue } from "./queue/task-queue";
import { createStatePersistence } from "./state/persistence";
import { createTelegramBridge } from "./telegram/bridge";
import { createNoopNotifier, createNotifier } from "./telegram/notifier";
import { startWebhookServer } from "./webhooks/server";
import { ensureWorktreeGitignore, getOrCreateWorktree, removeWorktree } from "./worktree/manager";

import type { Config } from "./config";

const RETRYABLE_ERRORS = new Set(["rate_limited", "unknown"]);

/**
 * Inject runtime env vars (e.g. GITHUB_PAT) into MCP server configs.
 * Mutates the config in place for simplicity.
 */
const injectMcpTokens = (config: Config, githubPat: string): void => {
  const inject = (servers: Record<string, { env?: Record<string, string> }> | undefined): void => {
    if (!servers?.github) return;
    servers.github.env = {
      ...servers.github.env,
      GITHUB_PERSONAL_ACCESS_TOKEN: githubPat,
    };
  };

  inject(config.agent.mcpServers);
  for (const project of Object.values(config.projects)) {
    inject(project.mcpServers);
  }
};

const main = async (): Promise<void> => {
  console.log("Agent Runner starting...");

  // Load configuration
  const config = loadConfig();
  const env = loadEnv();
  injectMcpTokens(config, env.GITHUB_PAT);
  const plane = buildPlaneClient(config, env);

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
    if (projectConfig.repoPath) {
      try {
        ensureWorktreeGitignore(projectConfig.repoPath);
      } catch (err) {
        console.warn(`Could not update .gitignore in ${projectConfig.repoPath}: ${err}`);
      }
    }
  }

  // Initialize task poller (fetches projects, labels, states from Plane)
  const taskPoller = createTaskPoller(plane, config);
  await taskPoller.initialize();

  // Initialize review agent if enabled
  let reviewAgent: ReviewOrchestrator | undefined;
  if (config.review.enabled) {
    console.log("✅ Review agent enabled");
    const githubAppPrivateKey = env.GITHUB_APP_PRIVATE_KEY_PATH
      ? readFileSync(env.GITHUB_APP_PRIVATE_KEY_PATH, "utf-8")
      : undefined;

    reviewAgent = createReviewOrchestrator({
      createGitHub: (owner, repo) =>
        createGitHubClient({
          auth:
            env.GITHUB_APP_ID && githubAppPrivateKey && env.GITHUB_APP_INSTALLATION_ID
              ? {
                  type: "app",
                  appId: env.GITHUB_APP_ID,
                  privateKey: githubAppPrivateKey,
                  installationId: env.GITHUB_APP_INSTALLATION_ID,
                }
              : { type: "token", token: env.GITHUB_PAT },
          owner,
          repo,
        }),
      plane,
      config: config.review,
      anthropicApiKey: env.ANTHROPIC_API_KEY,
    });
  } else {
    console.log("ℹ️  Review agent disabled in config");
  }

  // Start webhook server if enabled
  if (config.webhook.enabled) {
    try {
      await startWebhookServer({
        config,
        env,
        plane,
        taskPoller,
        reviewAgent,
        notifier,
      });
    } catch (err) {
      console.error("Failed to start webhook server:", err);
      console.warn("Continuing without webhook server...");
    }
  } else {
    console.log("Webhook server disabled in config");
  }

  // Initialize state persistence
  const statePath = env.STATE_PATH ?? resolve(process.cwd(), "state/runner-state.json");
  const statePersistence = createStatePersistence(statePath);

  // Initialize task queue
  const queue = createTaskQueue(config.agent.retryBaseDelayMs);

  // Restore queued tasks from previous run
  const savedState = statePersistence.load();
  if (savedState.queuedTasks?.length) {
    queue.hydrate(savedState.queuedTasks);
    console.log(`Restored ${savedState.queuedTasks.length} queued tasks from state`);
  }

  // Recover orphaned agents from previous run
  const orphaned = Object.values(savedState.activeAgents).filter(
    (a) => a.status === "running" || a.status === "blocked"
  );
  for (const agent of orphaned) {
    const slug = `${agent.task.projectIdentifier}-${agent.task.sequenceId}`;
    console.log(`Recovering orphaned agent ${slug}`);
    queue.enqueue(agent.task);
    const cache = taskPoller.getProjectCache(agent.task.projectIdentifier);
    if (cache) {
      try {
        await plane.updateIssue(agent.task.projectId, agent.task.issueId, {
          state: cache.todoStateId,
        });
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
    plane,
    config,
    notifier,
    taskPoller,
    statePersistence,
    worktree: { getOrCreateWorktree, removeWorktree },
    onAgentDone: (task, result, retryCount) => {
      const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;

      // Handle retryable errors
      const isRetryable =
        (result.errorType && RETRYABLE_ERRORS.has(result.errorType)) || result.crashed;

      if (isRetryable && retryCount < config.agent.maxRetries) {
        const nextRetry = retryCount + 1;
        const delay = Math.round(config.agent.retryBaseDelayMs * Math.pow(2, retryCount));
        const reason = result.crashed ? `Crashed: ${result.error}` : `Error: ${result.errorType}`;

        console.log(
          `Agent ${taskSlug} failed (${reason}), scheduling retry ${nextRetry}/${config.agent.maxRetries} in ${delay / 1000}s`
        );

        notifier
          .sendMessage(
            `<b>Retrying ${taskSlug}</b>\n${reason}\nAttempt ${nextRetry}/${config.agent.maxRetries} in ${delay / 1000}s`
          )
          .catch(() => {});

        // Move task back to Todo for re-pickup
        const cache = taskPoller.getProjectCache(task.projectIdentifier);
        if (cache) {
          plane
            .updateIssue(task.projectId, task.issueId, {
              state: cache.todoStateId,
            })
            .catch((err) => console.error(`Failed to reset state for ${taskSlug}:`, err));
        }

        queue.requeue(task, nextRetry);
      }

      saveState();
    },
  });

  // Start Telegram bridge (answer server for agent questions)
  const bridge = createTelegramBridge({ notifier, queue, agentManager });
  bridge.startAnswerServer();

  // Start polling loop
  console.log(
    `Polling every ${config.agent.pollIntervalMs}ms, spawning every ${config.agent.spawnDelayMs}ms (max ${config.agent.maxConcurrent} concurrent)`
  );
  await notifier.sendMessage("<b>Agent Runner started</b>\nPolling for tasks...");

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
            `Skipping task ${task.projectIdentifier}-${task.sequenceId}: no project config`
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
      const availableSlots = config.agent.maxConcurrent - agentManager.activeCount();
      if (availableSlots <= 0) return;

      const entry = queue.dequeue();
      if (!entry) return;

      const taskId = `${entry.task.projectIdentifier}-${entry.task.sequenceId}`;
      if (entry.retryCount > 0) {
        console.log(`Dequeued ${taskId} for retry attempt ${entry.retryCount}`);
      }

      const result = await agentManager.spawnAgent(entry.task, entry.retryCount);

      if (result.outcome === "rejected" && result.reason === "budget_exceeded") {
        // Budget exceeded — move task back to Plan Review instead of
        // re-queuing to avoid infinite re-queue loop while budget remains
        // exhausted. The task can be manually re-queued or will wait for
        // the next budget cycle.
        taskPoller.releaseTask(entry.task.issueId);
        const cache = taskPoller.getProjectCache(entry.task.projectIdentifier);
        const fallbackState = cache?.planReviewStateId ?? cache?.backlogStateId;
        if (cache && fallbackState) {
          await plane
            .updateIssue(entry.task.projectId, entry.task.issueId, {
              state: fallbackState,
            })
            .catch((err) => console.error(`Failed to reset state for ${taskId}:`, err));
        }
        const targetStatus = cache?.planReviewStateId ? "Plan Review" : "Backlog";
        await notifier.sendMessage(
          `<b>Budget limit reached</b>\nDaily spend: $${agentManager.getDailySpend().toFixed(2)} / $${agentManager.getDailyBudget()}\nMoving <code>${taskId}</code> back to ${targetStatus}: ${entry.task.title}`
        );
      } else if (result.outcome === "rejected" && result.reason === "no_project_config") {
        // No config — release the task back to Plane
        taskPoller.releaseTask(entry.task.issueId);
        const cache = taskPoller.getProjectCache(entry.task.projectIdentifier);
        if (cache) {
          await plane
            .updateIssue(entry.task.projectId, entry.task.issueId, {
              state: cache.todoStateId,
            })
            .catch(() => {});
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
  const discoveryInterval = setInterval(discoveryCycle, config.agent.pollIntervalMs);
  const processInterval = setInterval(processCycle, config.agent.spawnDelayMs);

  // Graceful shutdown
  const shutdown = async (): Promise<void> => {
    console.log("Shutting down...");
    clearInterval(discoveryInterval);
    clearInterval(processInterval);

    saveState();
    bridge.stop();

    const active = agentManager.getActiveAgents();
    if (active.length > 0) {
      const names = active
        .map((a) => `${a.task.projectIdentifier}-${a.task.sequenceId}`)
        .join(", ");
      await notifier
        .sendMessage(
          `<b>Agent Runner shutting down</b>\n${active.length} agent(s) still running: ${names}`
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
