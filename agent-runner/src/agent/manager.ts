import type { Config, PlaneConfig } from "../config.js";
import type { AgentTask, ActiveAgent, RunnerState } from "../types.js";
import type { Notifier } from "../telegram/notifier.js";
import type { TaskPoller } from "../poller/task-poller.js";
import type { StatePersistence } from "../state/persistence.js";
import { createWorktree, removeWorktree } from "../worktree/manager.js";
import { listComments } from "../plane/client.js";
import { detectPhase } from "./phase.js";
import { runAgent } from "./runner.js";

type ManagerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  taskPoller: TaskPoller;
  statePersistence: StatePersistence;
};

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export const createAgentManager = (deps: ManagerDeps) => {
  const activeAgents = new Map<string, ActiveAgent>();
  let state = deps.statePersistence.load();

  // Reset daily spend if date changed
  const today = new Date().toISOString().slice(0, 10);
  if (state.dailySpendDate !== today) {
    state.dailySpendUsd = 0;
    state.dailySpendDate = today;
    deps.statePersistence.save(state);
  }

  const persistState = (): void => {
    state.activeAgents = Object.fromEntries(activeAgents);
    deps.statePersistence.save(state);
  };

  const activeCount = (): number => activeAgents.size;

  const isTaskActive = (issueId: string): boolean => activeAgents.has(issueId);

  const checkBudget = (): boolean => {
    const currentDay = new Date().toISOString().slice(0, 10);
    if (state.dailySpendDate !== currentDay) {
      state.dailySpendUsd = 0;
      state.dailySpendDate = currentDay;
    }

    return (
      state.dailySpendUsd + deps.config.agent.maxBudgetPerTask <=
      deps.config.agent.maxDailyBudget
    );
  };

  const cleanup = async (
    issueId: string,
    taskSlug: string,
    repoPath: string,
    phase: "planning" | "implementation",
  ): Promise<void> => {
    // Only clean up worktree for implementation phase
    if (phase === "implementation") {
      try {
        await removeWorktree(repoPath, taskSlug);
        console.log(`Cleaned up worktree for ${taskSlug}`);
      } catch (err) {
        console.error(`Failed to cleanup worktree for ${taskSlug}:`, err);
      }
    }
    activeAgents.delete(issueId);
    deps.taskPoller.releaseTask(issueId);
    persistState();
  };

  const spawnAgent = async (task: AgentTask): Promise<void> => {
    const projectConfig = deps.config.projects[task.projectIdentifier];
    if (!projectConfig) {
      console.error(`No project config for ${task.projectIdentifier}`);
      return;
    }

    if (!checkBudget()) {
      const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;
      console.warn(
        `Daily budget limit reached ($${state.dailySpendUsd.toFixed(2)}/$${deps.config.agent.maxDailyBudget}), skipping ${taskSlug}`,
      );
      await deps.notifier.sendMessage(
        `<b>Budget limit reached</b>\nDaily spend: $${state.dailySpendUsd.toFixed(2)} / $${deps.config.agent.maxDailyBudget}\nSkipping <code>${taskSlug}</code>: ${task.title}`,
      );
      deps.taskPoller.releaseTask(task.issueId);
      return;
    }

    const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;

    // Fetch comments to determine phase
    const comments = await listComments(
      deps.planeConfig,
      task.projectId,
      task.issueId,
    );
    const phase = detectPhase(comments);

    console.log(`Task ${taskSlug} detected as ${phase} phase`);

    let workingDir: string;
    let branchName: string;

    if (phase === "planning") {
      // Planning runs in the repo dir directly (read-only)
      workingDir = projectConfig.repoPath;
      branchName = "";
    } else {
      // Implementation creates a worktree
      try {
        const result = await createWorktree(
          projectConfig.repoPath,
          taskSlug,
          projectConfig.defaultBranch,
        );
        workingDir = result.worktreePath;
        branchName = result.branchName;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error(`Failed to create worktree for ${taskSlug}: ${msg}`);
        await deps.notifier.agentErrored(
          taskSlug,
          task.title,
          `Worktree creation failed: ${msg}`,
        );
        deps.taskPoller.releaseTask(task.issueId);
        return;
      }
    }

    // Register as active
    const agent: ActiveAgent = {
      task,
      phase,
      worktreePath: workingDir,
      branchName,
      startedAt: Date.now(),
      status: "running",
    };
    activeAgents.set(task.issueId, agent);
    persistState();

    // Run agent in background (don't await — it runs concurrently)
    runAgent(task, phase, workingDir, branchName, comments, {
      planeConfig: deps.planeConfig,
      config: deps.config,
      notifier: deps.notifier,
      taskPoller: deps.taskPoller,
    })
      .then(async (result) => {
        agent.status = "completed";
        agent.costUsd = result.costUsd;
        state.dailySpendUsd += result.costUsd;
        persistState();
        console.log(
          `Daily spend: $${state.dailySpendUsd.toFixed(2)} / $${deps.config.agent.maxDailyBudget}`,
        );
        await cleanup(task.issueId, taskSlug, projectConfig.repoPath, phase);
      })
      .catch(async (err) => {
        agent.status = "errored";
        console.error(`Agent ${taskSlug} (${phase}) failed:`, err);
        persistState();
        // Don't clean up worktree on error — preserve for debugging
        activeAgents.delete(task.issueId);
        deps.taskPoller.releaseTask(task.issueId);
        persistState();
      });
  };

  const checkStaleAgents = async (): Promise<void> => {
    const now = Date.now();
    for (const agent of activeAgents.values()) {
      if (agent.status !== "running") continue;
      if (agent.alertedStale) continue;

      const elapsed = now - agent.startedAt;
      if (elapsed > STALE_THRESHOLD_MS) {
        const taskSlug = `${agent.task.projectIdentifier}-${agent.task.sequenceId}`;
        const hours = Math.floor(elapsed / (60 * 60 * 1000));
        console.warn(`Agent ${taskSlug} has been running for ${hours}h`);
        await deps.notifier.sendMessage(
          `<b>Stale agent detected</b>\n<code>${taskSlug}</code>: ${agent.task.title}\nRunning for ${hours}h with no completion.`,
        );
        agent.alertedStale = true;
        persistState();
      }
    }
  };

  const getActiveAgents = (): ActiveAgent[] => [...activeAgents.values()];

  const getDailySpend = (): number => state.dailySpendUsd;

  return {
    activeCount,
    isTaskActive,
    spawnAgent,
    getActiveAgents,
    checkStaleAgents,
    getDailySpend,
  };
};

export type AgentManager = ReturnType<typeof createAgentManager>;
