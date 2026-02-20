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

  // Fetch and pull latest main
  await git(repoPath, ["fetch", "origin", defaultBranch]);
  await git(repoPath, ["pull", "origin", defaultBranch]);

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
