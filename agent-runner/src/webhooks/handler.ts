import type { Config, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { extractTaskIds } from "./task-matcher";
import type { GitHubPullRequestEvent, WebhookProcessResult } from "./types";
import { updateMultipleTasks } from "./updater";

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
  const result: WebhookProcessResult = {
    success: true,
    taskIds: [],
    updatedTasks: [],
    skippedTasks: [],
    errors: [],
  };

  // Only process closed PRs that were merged
  if (event.action !== "closed" || !event.pull_request.merged) {
    console.log(
      `ℹ️  Webhook: Ignoring PR #${event.number} (action: ${event.action}, merged: ${event.pull_request.merged})`,
    );
    result.success = true;
    return result;
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

  result.taskIds = taskIds;

  if (taskIds.length === 0) {
    console.log(
      `ℹ️  Webhook: No task IDs found in PR #${pr.number} (description: "${pr.body?.substring(0, 50) || "empty"}", branch: ${pr.head.ref})`,
    );
    result.success = true;
    return result;
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

  // Process results
  for (const updateResult of updateResults) {
    if (updateResult.success) {
      if (updateResult.reason === "Task already in Done state") {
        result.skippedTasks.push(updateResult.taskId);
        console.log(
          `⏭️  Webhook: ${updateResult.taskId} already in Done state`,
        );
      } else {
        result.updatedTasks.push(updateResult.taskId);
        console.log(`✅ Webhook: Updated ${updateResult.taskId} to Done`);
      }
    } else {
      result.errors.push(`${updateResult.taskId}: ${updateResult.reason}`);
      console.error(
        `❌ Webhook: Failed to update ${updateResult.taskId}: ${updateResult.reason}`,
      );
    }
  }

  // Overall success if at least one task was updated or all were skipped/failed gracefully
  result.success = result.errors.length === 0 || result.updatedTasks.length > 0;

  console.log(
    `📊 Webhook: Processed PR #${pr.number} - Updated: ${result.updatedTasks.length}, Skipped: ${result.skippedTasks.length}, Errors: ${result.errors.length}`,
  );

  return result;
};
