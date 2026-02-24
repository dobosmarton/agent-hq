import { execFile } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { promisify } from "node:util";

const exec = promisify(execFile);

const WORKTREE_DIR = ".worktrees";

const worktreePath = (repoPath: string, branchSlug: string): string =>
  join(repoPath, WORKTREE_DIR, branchSlug);

const git = async (repoPath: string, args: string[]): Promise<string> => {
  const { stdout } = await exec("git", ["-C", repoPath, ...args]);
  return stdout.trim();
};

export const createWorktree = async (
  repoPath: string,
  taskSlug: string,
  defaultBranch: string,
): Promise<{ worktreePath: string; branchName: string }> => {
  const branchName = `agent/${taskSlug}`;
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);

  // Fetch and reset to latest main (reset --hard handles dirty state from planning agents)
  await git(repoPath, ["fetch", "origin", defaultBranch]);
  await git(repoPath, ["reset", "--hard", `origin/${defaultBranch}`]);
  await git(repoPath, ["clean", "-fd", "--exclude", WORKTREE_DIR]);

  // If worktree already exists, someone is working on this task
  if (existsSync(wtPath)) {
    throw new Error(
      `Worktree already exists at ${wtPath} — task is already in progress`,
    );
  }

  // If branch already exists, task is being worked on (or PR not yet merged)
  try {
    await git(repoPath, ["rev-parse", "--verify", branchName]);
    throw new Error(
      `Branch ${branchName} already exists — task is already in progress`,
    );
  } catch (err) {
    // rev-parse throws if branch doesn't exist — that's the happy path
    if (err instanceof Error && err.message.includes("already in progress")) {
      throw err;
    }
  }

  // Create worktree with new branch based on origin/main
  await git(repoPath, [
    "worktree",
    "add",
    wtPath,
    "-b",
    branchName,
    `origin/${defaultBranch}`,
  ]);

  return { worktreePath: wtPath, branchName };
};

export const removeWorktree = async (
  repoPath: string,
  taskSlug: string,
): Promise<void> => {
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);

  try {
    await git(repoPath, ["worktree", "remove", wtPath, "--force"]);
  } catch {
    // Worktree might already be removed
  }

  // Never delete branches — they are cleaned up after PR merge on the remote
};

export const listWorktrees = async (repoPath: string): Promise<string[]> => {
  const output = await git(repoPath, ["worktree", "list", "--porcelain"]);
  const paths: string[] = [];
  for (const line of output.split("\n")) {
    if (line.startsWith("worktree ")) {
      paths.push(line.slice("worktree ".length));
    }
  }
  return paths;
};

export const ensureWorktreeGitignore = (repoPath: string): void => {
  const gitignorePath = join(repoPath, ".gitignore");
  const entry = `${WORKTREE_DIR}/`;

  if (existsSync(gitignorePath)) {
    const content = readFileSync(gitignorePath, "utf-8");
    if (content.includes(entry)) return;
    appendFileSync(gitignorePath, `\n${entry}\n`);
  } else {
    appendFileSync(gitignorePath, `${entry}\n`);
  }
};

export const pushBranch = async (
  worktreePath: string,
  branchName: string,
): Promise<void> => {
  await git(worktreePath, ["push", "-u", "origin", branchName]);
};

/**
 * Check if a branch exists locally or remotely
 */
export const checkBranchExists = async (
  repoPath: string,
  branchName: string,
): Promise<{ local: boolean; remote: boolean }> => {
  const result = { local: false, remote: false };

  // Check local branch
  try {
    await git(repoPath, ["rev-parse", "--verify", branchName]);
    result.local = true;
  } catch {
    // Branch doesn't exist locally
  }

  // Check remote branch
  try {
    await git(repoPath, ["rev-parse", "--verify", `origin/${branchName}`]);
    result.remote = true;
  } catch {
    // Branch doesn't exist remotely
  }

  return result;
};

/**
 * Check if a worktree exists for a task
 */
export const checkWorktreeExists = async (
  repoPath: string,
  taskSlug: string,
): Promise<boolean> => {
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);
  return existsSync(wtPath);
};

/**
 * Find worktree path for a given branch
 */
export const findWorktreeForBranch = async (
  repoPath: string,
  branchName: string,
): Promise<string | null> => {
  try {
    const output = await git(repoPath, ["worktree", "list", "--porcelain"]);
    const lines = output.split("\n");

    let currentPath: string | null = null;
    for (const line of lines) {
      if (line.startsWith("worktree ")) {
        currentPath = line.slice("worktree ".length);
      } else if (line.startsWith("branch ") && currentPath) {
        const branch = line.slice("branch ".length).replace("refs/heads/", "");
        if (branch === branchName) {
          return currentPath;
        }
      }
    }
  } catch {
    // No worktrees or error listing
  }

  return null;
};

/**
 * Get the last commit message from a branch
 */
export const getLastCommitMessage = async (
  repoPath: string,
  branchName?: string,
): Promise<string | null> => {
  try {
    const args = branchName
      ? ["log", "-1", "--format=%s", branchName]
      : ["log", "-1", "--format=%s"];
    return await git(repoPath, args);
  } catch {
    return null;
  }
};

export type WorktreeResult = {
  worktreePath: string;
  branchName: string;
  isExisting: boolean;
  lastCommitMessage: string | null;
};

/**
 * Get or create a worktree for a task. This is the smart version of createWorktree
 * that handles existing branches/worktrees gracefully.
 */
export const getOrCreateWorktree = async (
  repoPath: string,
  taskSlug: string,
  defaultBranch: string,
): Promise<WorktreeResult> => {
  const branchName = `agent/${taskSlug}`;
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);

  // Fetch latest from remote
  await git(repoPath, ["fetch", "origin", defaultBranch]);
  await git(repoPath, ["reset", "--hard", `origin/${defaultBranch}`]);
  await git(repoPath, ["clean", "-fd", "--exclude", WORKTREE_DIR]);

  // Check if branch exists
  const branchExists = await checkBranchExists(repoPath, branchName);

  if (branchExists.local || branchExists.remote) {
    // Branch exists — this is a resume scenario
    console.log(
      `Branch ${branchName} exists (local: ${branchExists.local}, remote: ${branchExists.remote}) — resuming work`,
    );

    // If remote but not local, fetch it
    if (branchExists.remote && !branchExists.local) {
      await git(repoPath, [
        "branch",
        "--track",
        branchName,
        `origin/${branchName}`,
      ]);
    }

    // Check if worktree already exists
    const existingWorktree = await findWorktreeForBranch(repoPath, branchName);

    if (existingWorktree) {
      // Worktree exists, use it
      const lastCommit = await getLastCommitMessage(existingWorktree);
      return {
        worktreePath: existingWorktree,
        branchName,
        isExisting: true,
        lastCommitMessage: lastCommit,
      };
    } else if (existsSync(wtPath)) {
      // Worktree directory exists but is broken/orphaned — remove and recreate
      console.warn(
        `Worktree directory ${wtPath} exists but is not tracked by git — removing`,
      );
      await git(repoPath, ["worktree", "remove", wtPath, "--force"]).catch(
        () => {
          // If removal fails, continue anyway
        },
      );
    }

    // Create worktree for existing branch
    await git(repoPath, ["worktree", "add", wtPath, branchName]);
    const lastCommit = await getLastCommitMessage(wtPath);

    return {
      worktreePath: wtPath,
      branchName,
      isExisting: true,
      lastCommitMessage: lastCommit,
    };
  }

  // Branch doesn't exist — create new worktree with new branch
  if (existsSync(wtPath)) {
    throw new Error(
      `Worktree directory ${wtPath} exists but branch ${branchName} doesn't exist — inconsistent state`,
    );
  }

  await git(repoPath, [
    "worktree",
    "add",
    wtPath,
    "-b",
    branchName,
    `origin/${defaultBranch}`,
  ]);

  return {
    worktreePath: wtPath,
    branchName,
    isExisting: false,
    lastCommitMessage: null,
  };
};
