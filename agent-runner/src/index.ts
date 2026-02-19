import { loadConfig, loadEnv, buildPlaneConfig } from "./config.js";
import { createTaskPoller } from "./poller/task-poller.js";
import { createAgentManager } from "./agent/manager.js";
import { createNotifier } from "./telegram/notifier.js";
import { createTelegramBridge } from "./telegram/bridge.js";
import { ensureWorktreeGitignore } from "./worktree/manager.js";
import { createStatePersistence } from "./state/persistence.js";

const main = async (): Promise<void> => {
  console.log("Agent Runner starting...");

  // Load configuration
  const config = loadConfig();
  const env = loadEnv();
  const planeConfig = buildPlaneConfig(config, env);

  // Initialize Telegram
  const notifier = createNotifier({
    botToken: env.TELEGRAM_BOT_TOKEN,
    chatId: env.TELEGRAM_CHAT_ID,
  });

  const telegramBridge = createTelegramBridge(notifier);
  telegramBridge.startAnswerServer();

  // Ensure .worktrees/ is gitignored in all repos
  for (const projectConfig of Object.values(config.projects)) {
    try {
      ensureWorktreeGitignore(projectConfig.repoPath);
    } catch (err) {
      console.warn(`Could not update .gitignore in ${projectConfig.repoPath}: ${err}`);
    }
  }

  // Initialize task poller (fetches projects, labels, states from Plane)
  const taskPoller = createTaskPoller(planeConfig, config);
  await taskPoller.initialize();

  // Initialize state persistence
  const statePersistence = createStatePersistence("/app/state/runner-state.json");

  // Initialize agent manager
  const agentManager = createAgentManager({
    planeConfig,
    config,
    notifier,
    telegramBridge,
    taskPoller,
    statePersistence,
  });

  // Start polling loop
  console.log(`Polling every ${config.agent.pollIntervalMs}ms for tasks...`);
  await notifier.sendMessage("<b>Agent Runner started</b>\nPolling for tasks...");

  const pollCycle = async (): Promise<void> => {
    try {
      // Check for stale agents
      await agentManager.checkStaleAgents();

      const availableSlots = config.agent.maxConcurrent - agentManager.activeCount();
      if (availableSlots <= 0) return;

      const tasks = await taskPoller.pollForTasks(availableSlots);

      for (const task of tasks) {
        if (agentManager.isTaskActive(task.issueId)) continue;

        const claimed = await taskPoller.claimTask(task);
        if (!claimed) continue;

        const taskId = `${task.projectIdentifier}-${task.sequenceId}`;
        console.log(`Claimed task ${taskId}: "${task.title}"`);

        await agentManager.spawnAgent(task);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Poll cycle error: ${msg}`);
    }
  };

  // Initial poll
  await pollCycle();

  // Recurring poll
  const pollInterval = setInterval(pollCycle, config.agent.pollIntervalMs);

  // Graceful shutdown
  const shutdown = (): void => {
    console.log("Shutting down...");
    clearInterval(pollInterval);
    telegramBridge.stop();
    process.exit(0);
  };

  process.on("SIGINT", shutdown);
  process.on("SIGTERM", shutdown);
};

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
