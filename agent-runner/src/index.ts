import { resolve } from "node:path";
import { loadConfig, loadEnv, buildPlaneConfig } from "./config.js";
import { createTaskPoller } from "./poller/task-poller.js";
import { createAgentManager } from "./agent/manager.js";
import { createNotifier, createNoopNotifier } from "./telegram/notifier.js";
import { ensureWorktreeGitignore } from "./worktree/manager.js";
import { createStatePersistence } from "./state/persistence.js";
import { createTaskQueue } from "./queue/task-queue.js";

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

  // Initialize state persistence
  const statePath =
    env.STATE_PATH ?? resolve(process.cwd(), "state/runner-state.json");
  const statePersistence = createStatePersistence(statePath);

  // Initialize task queue
  const queue = createTaskQueue(config.agent.retryBaseDelayMs);

  // Initialize agent manager
  const agentManager = createAgentManager({
    planeConfig,
    config,
    notifier,
    taskPoller,
    statePersistence,
    queue,
  });

  // Start polling loop
  console.log(
    `Polling every ${config.agent.pollIntervalMs}ms, spawning every ${config.agent.spawnDelayMs}ms (max ${config.agent.maxConcurrent} concurrent)`,
  );
  await notifier.sendMessage(
    "<b>Agent Runner started</b>\nPolling for tasks...",
  );

  // Discovery: find tasks and enqueue them
  const discoveryCycle = async (): Promise<void> => {
    try {
      await agentManager.checkStaleAgents();

      const maxToDiscover = config.agent.maxConcurrent * 2; // buffer
      const tasks = await taskPoller.pollForTasks(maxToDiscover);

      for (const task of tasks) {
        if (agentManager.isTaskActive(task.issueId)) continue;
        if (queue.has(task.issueId)) continue;

        const claimed = await taskPoller.claimTask(task);
        if (!claimed) continue;

        const taskId = `${task.projectIdentifier}-${task.sequenceId}`;
        console.log(`Claimed task ${taskId}: "${task.title}"`);
        queue.enqueue(task);
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

      await agentManager.spawnAgent(entry.task, entry.retryCount);
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
  const shutdown = (): void => {
    console.log("Shutting down...");
    clearInterval(discoveryInterval);
    clearInterval(processInterval);
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
