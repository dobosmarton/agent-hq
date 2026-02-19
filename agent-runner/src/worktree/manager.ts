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
  defaultBranch: string
): Promise<{ worktreePath: string; branchName: string }> => {
  const branchName = `agent/${taskSlug}`;
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);

  // Fetch latest from origin
  await git(repoPath, ["fetch", "origin", defaultBranch]);

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

export const removeWorktree = async (repoPath: string, taskSlug: string): Promise<void> => {
  const wtPath = worktreePath(repoPath, `agent-${taskSlug}`);
  const branchName = `agent/${taskSlug}`;

  try {
    await git(repoPath, ["worktree", "remove", wtPath, "--force"]);
  } catch {
    // Worktree might already be removed
  }

  try {
    await git(repoPath, ["branch", "-D", branchName]);
  } catch {
    // Branch might already be deleted
  }
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

export const pushBranch = async (worktreePath: string, branchName: string): Promise<void> => {
  await git(worktreePath, ["push", "-u", "origin", branchName]);
};
