import type { Config, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { extractTaskIds } from "./task-matcher";
import type { GitHubPullRequestEvent, WebhookProcessResult } from "./types";
import { updateMultipleTasks } from "./updater";

const EMPTY_RESULT: WebhookProcessResult = {
  success: true,
  taskIds: [],
  updatedTasks: [],
  skippedTasks: [],
  errors: [],
};

/**
 * Processes a GitHub pull request webhook event
 *
 * @param event - GitHub webhook event payload
 * @param planeConfig - Plane API configuration
 * @param config - Application configuration
 * @param taskPoller - Task poller with project caches
 * @returns Result with updated tasks, skipped tasks, and errors
 */
export const handlePullRequestEvent = async (
  event: GitHubPullRequestEvent,
  planeConfig: PlaneConfig,
  config: Config,
  taskPoller: TaskPoller,
): Promise<WebhookProcessResult> => {
  // Only process closed PRs that were merged
  if (event.action !== "closed" || !event.pull_request.merged) {
    console.log(
      `ℹ️  Webhook: Ignoring PR #${event.number} (action: ${event.action}, merged: ${event.pull_request.merged})`,
    );
    return EMPTY_RESULT;
  }

  const pr = event.pull_request;
  console.log(
    `🔔 Webhook: Processing merged PR #${pr.number}: ${pr.title} (${pr.html_url})`,
  );

  // Extract task IDs from PR
  const taskIds = extractTaskIds(
    pr,
    undefined, // We don't have commits in the webhook payload by default
    config.webhook.taskIdPattern,
  );

  if (taskIds.length === 0) {
    console.log(
      `ℹ️  Webhook: No task IDs found in PR #${pr.number} (description: "${pr.body?.substring(0, 50) || "empty"}", branch: ${pr.head.ref})`,
    );
    return EMPTY_RESULT;
  }

  console.log(
    `📋 Webhook: Found ${taskIds.length} task ID(s): ${taskIds.join(", ")}`,
  );

  // Update all found tasks
  const updateResults = await updateMultipleTasks(
    planeConfig,
    taskPoller,
    taskIds,
    pr,
    config.webhook.taskIdPattern,
  );

  // Categorize results using discriminated union
  const updatedTasks: string[] = [];
  const skippedTasks: string[] = [];
  const errors: string[] = [];

  for (const updateResult of updateResults) {
    if (updateResult.success) {
      if (updateResult.status === "already_done") {
        skippedTasks.push(updateResult.taskId);
        console.log(
          `⏭️  Webhook: ${updateResult.taskId} already in Done state`,
        );
      } else {
        updatedTasks.push(updateResult.taskId);
        console.log(`✅ Webhook: Updated ${updateResult.taskId} to Done`);
      }
    } else {
      errors.push(`${updateResult.taskId}: ${updateResult.reason}`);
      console.error(
        `❌ Webhook: Failed to update ${updateResult.taskId}: ${updateResult.reason}`,
      );
    }
  }

  const success = errors.length === 0 || updatedTasks.length > 0;

  console.log(
    `📊 Webhook: Processed PR #${pr.number} - Updated: ${updatedTasks.length}, Skipped: ${skippedTasks.length}, Errors: ${errors.length}`,
  );

  return { success, taskIds, updatedTasks, skippedTasks, errors };
};
