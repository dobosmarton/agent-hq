import type { GitHubPullRequest } from "./types";

/**
 * Extracts task IDs from a pull request using multiple strategies:
 * 1. PR description (e.g., "Closes AGENTHQ-123", "Fixes AGENTHQ-123")
 * 2. Branch name (e.g., "feature/AGENTHQ-123-description", "agent/AGENTHQ-123")
 * 3. Commit messages (searches all commits for task IDs)
 *
 * @param pr - GitHub pull request object
 * @param commits - Array of commit objects (optional, for commit message extraction)
 * @param pattern - Regex pattern to match task IDs (default: ([A-Z]+-\d+))
 * @returns Array of unique task IDs found
 */
export const extractTaskIds = (
  pr: GitHubPullRequest,
  commits?: Array<{ message: string }>,
  pattern = "([A-Z]+-\\d+)",
): string[] => {
  const taskIds = new Set<string>();
  const regex = new RegExp(pattern, "g");

  // Strategy 1: Extract from PR description
  if (pr.body) {
    const matches = pr.body.matchAll(regex);
    for (const match of matches) {
      if (match[1]) {
        taskIds.add(match[1]);
      }
    }
  }

  // Strategy 2: Extract from branch name
  const branchName = pr.head.ref;
  const branchMatches = branchName.matchAll(regex);
  for (const match of branchMatches) {
    if (match[1]) {
      taskIds.add(match[1]);
    }
  }

  // Strategy 3: Extract from commit messages
  if (commits) {
    for (const commit of commits) {
      const commitMatches = commit.message.matchAll(regex);
      for (const match of commitMatches) {
        if (match[1]) {
          taskIds.add(match[1]);
        }
      }
    }
  }

  return Array.from(taskIds);
};

/**
 * Validates that a task ID matches the expected format
 * @param taskId - Task ID to validate
 * @param pattern - Regex pattern to match (default: ([A-Z]+-\d+))
 * @returns true if valid, false otherwise
 */
export const validateTaskId = (
  taskId: string,
  pattern = "([A-Z]+-\\d+)",
): boolean => {
  const regex = new RegExp(`^${pattern}$`);
  return regex.test(taskId);
};

/**
 * Extracts the project identifier from a task ID
 * @param taskId - Task ID (e.g., "AGENTHQ-123")
 * @returns Project identifier (e.g., "AGENTHQ")
 */
export const extractProjectIdentifier = (taskId: string): string => {
  const parts = taskId.split("-");
  return parts[0] ?? "";
};

/**
 * Extracts the sequence ID from a task ID
 * @param taskId - Task ID (e.g., "AGENTHQ-123")
 * @returns Sequence ID (e.g., 123)
 */
export const extractSequenceId = (taskId: string): number => {
  const parts = taskId.split("-");
  return parseInt(parts[1] ?? "0", 10);
};
