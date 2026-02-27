import type { Config, PlaneConfig } from "../config";
import { addComment, listComments } from "../plane/client";
import type { TaskPoller } from "../poller/task-poller";
import type { StatePersistence } from "../state/persistence";
import type { Notifier } from "../telegram/notifier";
import type {
  ActiveAgent,
  AgentDoneResult,
  AgentTask,
  SpawnResult,
} from "../types";
import { resolve } from "node:path";
import { getOrCreateWorktree, removeWorktree } from "../worktree/manager";
import { readCiWorkflows } from "./ci-discovery";
import { detectPhase } from "./phase";
import { runAgent } from "./runner";
import { loadSkills } from "../skills/loader";
import { formatSkillsCatalog } from "../skills/formatter";
import { analyzeComments } from "../plane/comment-analyzer";
import { getCommitLog, getDiff } from "../git/operations";
import { createResumeComment } from "./comment-formatter";

export type OnAgentDone = (
  task: AgentTask,
  result: AgentDoneResult,
  retryCount: number,
) => void;

type ManagerDeps = {
  planeConfig: PlaneConfig;
  config: Config;
  notifier: Notifier;
  taskPoller: TaskPoller;
  statePersistence: StatePersistence;
  onAgentDone: OnAgentDone;
};

const STALE_THRESHOLD_MS = 6 * 60 * 60 * 1000; // 6 hours

export const createAgentManager = (deps: ManagerDeps) => {
  const activeAgents = new Map<string, ActiveAgent>();
  let dailySpendUsd = 0;
  let dailySpendDate = new Date().toISOString().slice(0, 10);

  // Load persisted state
  const savedState = deps.statePersistence.load();
  dailySpendUsd = savedState.dailySpendUsd;
  dailySpendDate = savedState.dailySpendDate;

  // Reset daily spend if date changed
  const today = new Date().toISOString().slice(0, 10);
  if (dailySpendDate !== today) {
    dailySpendUsd = 0;
    dailySpendDate = today;
  }

  const activeCount = (): number => activeAgents.size;

  const isTaskActive = (issueId: string): boolean => activeAgents.has(issueId);

  const checkBudget = (): boolean => {
    const currentDay = new Date().toISOString().slice(0, 10);
    if (dailySpendDate !== currentDay) {
      dailySpendUsd = 0;
      dailySpendDate = currentDay;
    }

    return (
      dailySpendUsd + deps.config.agent.maxBudgetPerTask <=
      deps.config.agent.maxDailyBudget
    );
  };

  const cleanup = async (
    issueId: string,
    taskSlug: string,
    repoPath: string,
  ): Promise<void> => {
    try {
      await removeWorktree(repoPath, taskSlug);
      console.log(`Cleaned up worktree for ${taskSlug}`);
    } catch (err) {
      console.error(`Failed to cleanup worktree for ${taskSlug}:`, err);
    }
    activeAgents.delete(issueId);
    deps.taskPoller.releaseTask(issueId);
  };

  const spawnAgent = async (
    task: AgentTask,
    retryCount: number = 0,
  ): Promise<SpawnResult> => {
    const projectConfig = deps.config.projects[task.projectIdentifier];
    if (!projectConfig) {
      console.error(`No project config for ${task.projectIdentifier}`);
      return { outcome: "rejected", reason: "no_project_config" };
    }

    if (!projectConfig.repoPath) {
      console.error(`No repoPath configured for ${task.projectIdentifier}`);
      return { outcome: "rejected", reason: "no_repo_path" };
    }

    // Store repoPath for type narrowing (proven to be non-null above)
    const repoPath = projectConfig.repoPath;

    if (!checkBudget()) {
      const taskSlug = `${task.projectIdentifier}-${task.sequenceId}`;
      console.warn(
        `Daily budget limit reached ($${dailySpendUsd.toFixed(2)}/$${deps.config.agent.maxDailyBudget}), skipping ${taskSlug}`,
      );
      return { outcome: "rejected", reason: "budget_exceeded" };
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
    let isResuming = false;
    let resumeContext: {
      gitLog: string;
      gitDiff: string;
      lastCommit: string | null;
      analysis: ReturnType<typeof analyzeComments>;
    } | null = null;

    try {
      const result = await getOrCreateWorktree(
        repoPath,
        taskSlug,
        projectConfig.defaultBranch,
      );
      workingDir = result.worktreePath;
      branchName = result.branchName;
      isResuming = result.isExisting;

      if (isResuming) {
        console.log(
          `Resuming work on ${taskSlug} (branch ${branchName} already exists)`,
        );

        // Analyze comments to identify new feedback
        const analysis = analyzeComments(comments);

        // Get git history and diff
        const [gitLog, gitDiff] = await Promise.all([
          getCommitLog(
            workingDir,
            `origin/${projectConfig.defaultBranch}`,
            "HEAD",
          ),
          getDiff(workingDir, `origin/${projectConfig.defaultBranch}`, "HEAD"),
        ]);

        const commitCount = gitLog.split("\n").filter((line) => line).length;

        resumeContext = {
          gitLog,
          gitDiff,
          lastCommit: result.lastCommitMessage,
          analysis,
        };

        // Post a resume comment to the task
        const resumeComment = createResumeComment(
          analysis,
          branchName,
          gitLog,
          commitCount,
        );

        await addComment(
          deps.planeConfig,
          task.projectId,
          task.issueId,
          resumeComment,
        );

        console.log(`Posted resume comment for ${taskSlug}`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`Failed to setup worktree for ${taskSlug}: ${msg}`);
      await deps.notifier.agentErrored(
        taskSlug,
        task.title,
        `Worktree setup failed: ${msg}`,
      );
      deps.taskPoller.releaseTask(task.issueId);
      return { outcome: "error", reason: `Worktree setup failed: ${msg}` };
    }

    // Build CI context for validation
    const ciContext = projectConfig.ciChecks
      ? { workflowFiles: {}, overrideCommands: projectConfig.ciChecks }
      : readCiWorkflows(repoPath);

    // Load skills for the phase
    const skills = loadSkills(phase, repoPath, deps.config.agent.skills);
    const skillsSection =
      skills.length > 0 ? formatSkillsCatalog(skills) : undefined;

    if (skills.length > 0) {
      console.log(
        `Loaded ${skills.length} skill(s) for ${taskSlug} (${phase} phase): ${skills.map((s) => s.name).join(", ")}`,
      );
    }

    // Register as active
    const agent: ActiveAgent = {
      task,
      phase,
      worktreePath: workingDir,
      branchName,
      startedAt: Date.now(),
      status: "running",
      retryCount,
    };
    activeAgents.set(task.issueId, agent);

    // Run agent in background — notify caller via onAgentDone
    runAgent(
      task,
      phase,
      workingDir,
      branchName,
      comments,
      ciContext,
      skillsSection,
      skills,
      {
        planeConfig: deps.planeConfig,
        config: deps.config,
        notifier: deps.notifier,
        taskPoller: deps.taskPoller,
        retryContext: {
          retryCount,
          maxRetries: deps.config.agent.maxRetries,
        },
      },
      repoPath,
      resolve(process.cwd()),
      resumeContext,
    )
      .then(async (result) => {
        agent.costUsd = result.costUsd;
        dailySpendUsd += result.costUsd;

        agent.status = result.errorType ? "errored" : "completed";

        console.log(
          `Daily spend: $${dailySpendUsd.toFixed(2)} / $${deps.config.agent.maxDailyBudget}`,
        );

        if (!result.errorType) {
          await cleanup(task.issueId, taskSlug, repoPath);
        } else {
          activeAgents.delete(task.issueId);
          deps.taskPoller.releaseTask(task.issueId);
        }

        deps.onAgentDone(
          task,
          { costUsd: result.costUsd, errorType: result.errorType },
          retryCount,
        );
      })
      .catch(async (err) => {
        agent.status = "errored";
        const errMsg = err instanceof Error ? err.message : String(err);
        console.error(`Agent ${taskSlug} (${phase}) failed:`, err);

        activeAgents.delete(task.issueId);
        deps.taskPoller.releaseTask(task.issueId);

        deps.onAgentDone(
          task,
          { costUsd: 0, crashed: true, error: errMsg },
          retryCount,
        );
      });

    return { outcome: "started" };
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
      }
    }
  };

  const getActiveAgents = (): ActiveAgent[] => [...activeAgents.values()];

  const getDailySpend = (): number => dailySpendUsd;

  const getDailyBudget = (): number => deps.config.agent.maxDailyBudget;

  const getState = () => ({
    activeAgents: Object.fromEntries(activeAgents) as Record<
      string,
      ActiveAgent
    >,
    dailySpendUsd,
    dailySpendDate,
  });

  return {
    activeCount,
    isTaskActive,
    spawnAgent,
    getActiveAgents,
    checkStaleAgents,
    getDailySpend,
    getDailyBudget,
    getState,
  };
};

export type AgentManager = ReturnType<typeof createAgentManager>;
