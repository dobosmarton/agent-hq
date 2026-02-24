import { execFile } from "node:child_process";
import { promisify } from "node:util";

const exec = promisify(execFile);

const git = async (repoPath: string, args: string[]): Promise<string> => {
  const { stdout } = await exec("git", ["-C", repoPath, ...args]);
  return stdout.trim();
};

/**
 * Get commit log between two refs
 */
export const getCommitLog = async (
  repoPath: string,
  baseRef: string,
  headRef: string = "HEAD",
): Promise<string> => {
  try {
    return await git(repoPath, [
      "log",
      "--oneline",
      "--no-decorate",
      `${baseRef}..${headRef}`,
    ]);
  } catch {
    return "";
  }
};

/**
 * Get diff between two refs
 */
export const getDiff = async (
  repoPath: string,
  baseRef: string,
  headRef: string = "HEAD",
): Promise<string> => {
  try {
    // Use --stat for a summary view
    return await git(repoPath, ["diff", "--stat", `${baseRef}...${headRef}`]);
  } catch {
    return "";
  }
};

/**
 * Get the last commit message from a repo
 */
export const getLastCommitMessage = async (
  repoPath: string,
): Promise<string | null> => {
  try {
    return await git(repoPath, ["log", "-1", "--format=%s"]);
  } catch {
    return null;
  }
};

/**
 * Check if a branch is behind the base branch
 */
export const isBranchBehind = async (
  repoPath: string,
  branchName: string,
  baseBranch: string,
): Promise<{ behind: boolean; commitCount: number }> => {
  try {
    const output = await git(repoPath, [
      "rev-list",
      "--count",
      `${branchName}..origin/${baseBranch}`,
    ]);
    const count = parseInt(output, 10);
    return { behind: count > 0, commitCount: count };
  } catch {
    return { behind: false, commitCount: 0 };
  }
};

/**
 * Check for uncommitted changes in a worktree
 */
export const hasUncommittedChanges = async (
  repoPath: string,
): Promise<boolean> => {
  try {
    const status = await git(repoPath, ["status", "--porcelain"]);
    return status.trim().length > 0;
  } catch {
    return false;
  }
};

/**
 * Get file change summary for a branch
 */
export const getFileChangeSummary = async (
  repoPath: string,
  baseRef: string,
  headRef: string = "HEAD",
): Promise<{ filesChanged: number; insertions: number; deletions: number }> => {
  try {
    const output = await git(repoPath, [
      "diff",
      "--shortstat",
      `${baseRef}...${headRef}`,
    ]);

    // Parse: " 5 files changed, 120 insertions(+), 30 deletions(-)"
    const filesMatch = output.match(/(\d+) files? changed/);
    const insertMatch = output.match(/(\d+) insertions?\(\+\)/);
    const deleteMatch = output.match(/(\d+) deletions?\(-\)/);

    return {
      filesChanged: filesMatch ? parseInt(filesMatch[1]!, 10) : 0,
      insertions: insertMatch ? parseInt(insertMatch[1]!, 10) : 0,
      deletions: deleteMatch ? parseInt(deleteMatch[1]!, 10) : 0,
    };
  } catch {
    return { filesChanged: 0, insertions: 0, deletions: 0 };
  }
};
