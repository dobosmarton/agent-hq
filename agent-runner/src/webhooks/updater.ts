import type { PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { addComment, listIssues, updateIssue } from "../plane/client";
import type { GitHubPullRequest } from "./types";
import {
  extractProjectIdentifier,
  extractSequenceId,
  validateTaskId,
} from "./task-matcher";

export type UpdateResult =
  | {
      taskId: string;
      success: true;
      status: "moved" | "already_done";
      previousState?: string;
    }
  | { taskId: string; success: false; reason: string };

/**
 * Updates a single Plane task to "Done" state when a PR is merged
 *
 * @param planeConfig - Plane API configuration
 * @param taskPoller - Task poller with project caches
 * @param taskId - Task ID to update (e.g., "AGENTHQ-123")
 * @param pr - GitHub pull request object
 * @param pattern - Task ID regex pattern
 * @returns Update result with success status and reason
 */
export const updateTaskState = async (
  planeConfig: PlaneConfig,
  taskPoller: TaskPoller,
  taskId: string,
  pr: GitHubPullRequest,
  pattern: string,
): Promise<UpdateResult> => {
  // Validate task ID format
  if (!validateTaskId(taskId, pattern)) {
    return {
      taskId,
      success: false,
      reason: `Invalid task ID format: ${taskId}`,
    };
  }

  // Extract project identifier and sequence ID
  const projectIdentifier = extractProjectIdentifier(taskId);
  const sequenceId = extractSequenceId(taskId);

  // Get project cache
  const cache = taskPoller.getProjectCache(projectIdentifier);
  if (!cache) {
    return {
      taskId,
      success: false,
      reason: `Project not configured: ${projectIdentifier}`,
    };
  }

  // Check if "Done" state exists
  if (!cache.doneStateId) {
    return {
      taskId,
      success: false,
      reason: `Done state not found for project ${projectIdentifier}`,
    };
  }

  try {
    // TODO: This fetches all project issues to find one — use a filtered API query
    // when Plane supports filtering by sequence_id to avoid loading the full list.
    const issues = await listIssues(planeConfig, cache.project.id);
    const issue = issues.find((i) => i.sequence_id === sequenceId);

    if (!issue) {
      return {
        taskId,
        success: false,
        reason: `Task not found: ${taskId}`,
      };
    }

    // Check if task is already in Done state
    if (issue.state === cache.doneStateId) {
      return {
        taskId,
        success: true,
        status: "already_done" as const,
        previousState: cache.doneStateId,
      };
    }

    // Update task state to Done
    const previousState = issue.state;
    await updateIssue(planeConfig, cache.project.id, issue.id, {
      state: cache.doneStateId,
    });

    // Add comment with PR merge information
    const commentHtml = `<p>✅ <strong>PR merged</strong>: <a href="${pr.html_url}">#${pr.number} ${pr.title}</a></p><p>Task automatically moved to Done by webhook automation.</p>`;
    await addComment(planeConfig, cache.project.id, issue.id, commentHtml);

    console.log(
      `✅ Updated ${taskId} to Done (PR #${pr.number}: ${pr.html_url})`,
    );

    return {
      taskId,
      success: true,
      status: "moved" as const,
      previousState,
    };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`❌ Failed to update ${taskId}: ${message}`);

    return {
      taskId,
      success: false,
      reason: `Error updating task: ${message}`,
    };
  }
};

/**
 * Updates multiple tasks to "Done" state when a PR is merged
 *
 * @param planeConfig - Plane API configuration
 * @param taskPoller - Task poller with project caches
 * @param taskIds - Array of task IDs to update
 * @param pr - GitHub pull request object
 * @param pattern - Task ID regex pattern
 * @returns Array of update results
 */
export const updateMultipleTasks = async (
  planeConfig: PlaneConfig,
  taskPoller: TaskPoller,
  taskIds: string[],
  pr: GitHubPullRequest,
  pattern: string,
): Promise<UpdateResult[]> => {
  const results: UpdateResult[] = [];

  for (const taskId of taskIds) {
    const result = await updateTaskState(
      planeConfig,
      taskPoller,
      taskId,
      pr,
      pattern,
    );
    results.push(result);
  }

  return results;
};
