import type { Config, PlaneConfig } from "../config.js";
import type { AgentTask, ActiveAgent } from "../types.js";
import type { Notifier } from "../telegram/notifier.js";
import type { TelegramBridge } from "../telegram/bridge.js";
import type { TaskPoller } from "../poller/task-poller.js";
import { createWorktree, removeWorktree, pushBranch } from "../worktree/manager.js";
import { runAgent } from "./runner.js";

type ManagerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  telegramBridge: TelegramBridge;
  taskPoller: TaskPoller;
};

export function createAgentManager(deps: ManagerDeps) {
  const activeAgents = new Map<string, ActiveAgent>();

  function activeCount(): number {
    return activeAgents.size;
  }

  function isTaskActive(issueId: string): boolean {
    return activeAgents.has(issueId);
  }

  async function spawnAgent(task: AgentTask): Promise<void> {
    const projectConfig = deps.config.projects[task.projectIdentifier];
    if (!projectConfig) {
      console.error(`No project config for ${task.projectIdentifier}`);
      return;
    }

    const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;

    // Create worktree
    let worktreePath: string;
    let branchName: string;
    try {
      const result = await createWorktree(
        projectConfig.repoPath,
        taskSlug,
        projectConfig.defaultBranch
      );
      worktreePath = result.worktreePath;
      branchName = result.branchName;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to create worktree for ${taskSlug}: ${msg}`);
      await deps.notifier.agentErrored(taskSlug, task.title, `Worktree creation failed: ${msg}`);
      deps.taskPoller.releaseTask(task.issueId);
      return;
    }

    // Register as active
    const agent: ActiveAgent = {
      task,
      worktreePath,
      branchName,
      startedAt: Date.now(),
      status: "running",
    };
    activeAgents.set(task.issueId, agent);

    // Run agent in background (don't await — it runs concurrently)
    runAgent(task, worktreePath, branchName, {
      planeConfig: deps.planeConfig,
      config: deps.config,
      notifier: deps.notifier,
      telegramBridge: deps.telegramBridge,
      taskPoller: deps.taskPoller,
    })
      .then(async () => {
        agent.status = "completed";
        await cleanup(task.issueId, taskSlug, projectConfig.repoPath);
      })
      .catch(async (err) => {
        agent.status = "errored";
        console.error(`Agent ${taskSlug} failed:`, err);
        // Don't clean up worktree on error — preserve for debugging
        activeAgents.delete(task.issueId);
        deps.taskPoller.releaseTask(task.issueId);
      });
  }

  async function cleanup(issueId: string, taskSlug: string, repoPath: string): Promise<void> {
    try {
      await removeWorktree(repoPath, taskSlug);
      console.log(`Cleaned up worktree for ${taskSlug}`);
    } catch (err) {
      console.error(`Failed to cleanup worktree for ${taskSlug}:`, err);
    }
    activeAgents.delete(issueId);
    deps.taskPoller.releaseTask(issueId);
  }

  function getActiveAgents(): ActiveAgent[] {
    return [...activeAgents.values()];
  }

  return { activeCount, isTaskActive, spawnAgent, getActiveAgents };
}

export type AgentManager = ReturnType<typeof createAgentManager>;
