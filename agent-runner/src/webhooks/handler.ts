import type { Config, PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import type { ReviewAgentOrchestrator } from "../review-agent/orchestrator";
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

/**
 * Handles PR opened/synchronize events for automated review
 *
 * @param event - GitHub webhook event payload
 * @param reviewAgent - Review agent orchestrator
 * @param taskPoller - Task poller with project caches
 * @param config - Application configuration
 * @returns Empty result (review happens asynchronously)
 */
export const handlePullRequestReviewTrigger = async (
  event: GitHubPullRequestEvent,
  reviewAgent: ReviewAgentOrchestrator | undefined,
  taskPoller: TaskPoller,
  config: Config,
): Promise<WebhookProcessResult> => {
  // Check if review agent is enabled
  if (!reviewAgent) {
    console.log(`ℹ️  Webhook: Review agent not enabled, skipping review`);
    return EMPTY_RESULT;
  }

  // Only process opened or synchronize events
  if (event.action !== "opened" && event.action !== "synchronize") {
    console.log(
      `ℹ️  Webhook: Ignoring PR #${event.number} for review (action: ${event.action})`,
    );
    return EMPTY_RESULT;
  }

  const pr = event.pull_request;
  console.log(
    `🔍 Webhook: PR #${pr.number} ${event.action} - triggering review: ${pr.title}`,
  );

  // Extract task IDs from PR
  const taskIds = extractTaskIds(pr, undefined, config.webhook.taskIdPattern);

  if (taskIds.length === 0) {
    console.log(
      `ℹ️  Webhook: No task IDs found in PR #${pr.number}, skipping review`,
    );
    return EMPTY_RESULT;
  }

  // Only review first task if multiple found
  const taskId = taskIds[0]!;
  const projectIdentifier = taskId.split("-")[0];

  if (!projectIdentifier) {
    console.log(`⚠️  Webhook: Invalid task ID format: ${taskId}`);
    return EMPTY_RESULT;
  }

  // Find project config
  const projectConfig = config.projects[projectIdentifier];
  if (!projectConfig) {
    console.log(
      `⚠️  Webhook: No project config found for identifier: ${projectIdentifier}`,
    );
    return EMPTY_RESULT;
  }

  // Get project details from cache
  const projectCache = taskPoller.getProjectCache(projectIdentifier);
  if (!projectCache) {
    console.log(`⚠️  Webhook: Project ${projectIdentifier} not in cache`);
    return EMPTY_RESULT;
  }

  // Extract owner and repo from repository info
  const owner = event.repository.owner.login;
  const repo = event.repository.name;

  console.log(
    `📋 Webhook: Triggering review for ${taskId} in ${owner}/${repo} PR #${pr.number}`,
  );

  // Trigger review asynchronously
  void reviewAgent
    .reviewPullRequest(owner, repo, pr.number, taskId, projectCache.project.id)
    .catch((err: unknown) => {
      console.error(`❌ Webhook: Review failed for PR #${pr.number}:`, err);
    });

  return EMPTY_RESULT;
};
