import Anthropic from "@anthropic-ai/sdk";
import type { GitHubPRAdapter, PlaneTaskAdapter } from "@agent-hq/shared-types";
import { loadSkills } from "@agent-hq/skills";
import type { ReviewContext, ReviewResult, CodeAnalysisResult } from "./types";
import { analyzeReview } from "./agent";
import { postReviewToGitHub } from "./github-reviewer";
import type { AggregatedReview } from "./parallel-reviewer";

/**
 * Configuration for review agent
 */
export type ReviewAgentConfig = {
  enabled: boolean;
  triggerOnOpened: boolean;
  triggerOnSynchronize: boolean;
  severityThreshold: "critical" | "major" | "minor" | "suggestion";
  skipIfLabelPresent?: string;
  maxDiffSizeKb: number;
  claudeModel: string;
  useParallelReview: boolean;
};

/**
 * Dependencies injected into the review orchestrator
 */
export type ReviewOrchestratorDeps = {
  createGitHub: (owner: string, repo: string) => GitHubPRAdapter;
  plane: PlaneTaskAdapter;
  config: ReviewAgentConfig;
  anthropicApiKey: string;
};

/**
 * Handles analysis errors by posting to Plane
 */
const handleAnalysisError = (
  plane: PlaneTaskAdapter,
  error: string,
  projectId: string,
  issueId: string
): ReviewResult<void> => {
  console.error(`❌ Review: Analysis failed: ${error}`);

  void plane
    .addComment(
      projectId,
      issueId,
      `<p><strong>⚠️ Automated PR Review Failed</strong></p><p>Error: ${error}</p><p>Please review the PR manually.</p>`
    )
    .catch((err: unknown) => {
      console.error(`❌ Review: Failed to post error comment to Plane:`, err);
    });

  return { success: false, error };
};

/**
 * Builds the summary to post to Plane task
 */
const buildPlaneSummary = (
  analysis: CodeAnalysisResult | AggregatedReview,
  prNumber: number,
  prUrl: string
): string => {
  const header =
    analysis.overallAssessment === "approve"
      ? "<h3>✅ Automated PR Review - No Issues Found</h3>"
      : analysis.overallAssessment === "request_changes"
        ? "<h3>❌ Automated PR Review - Changes Requested</h3>"
        : "<h3>💬 Automated PR Review - Comments</h3>";

  const prLink = `<p><strong>PR:</strong> <a href="${prUrl}">#${prNumber}</a></p>`;

  const summary = `<p>${analysis.summary}</p>`;

  const toolsUsed =
    "toolsUsed" in analysis
      ? `<p><em>Review tools used: ${analysis.toolsUsed.join(", ")}</em></p>`
      : "";

  const issuesList =
    analysis.issues.length > 0
      ? `<p><strong>Issues Found:</strong></p><ul>${analysis.issues.map((issue) => `<li><strong>${issue.severity} - ${issue.category}:</strong> ${issue.description}${issue.suggestion ? `<br/>💡 ${issue.suggestion}` : ""}</li>`).join("")}</ul>`
      : "<p><em>No issues found. Code looks good!</em></p>";

  return `${header}${prLink}${summary}${toolsUsed}${issuesList}<p><em>🤖 Automated review by PR Review Agent</em></p>`;
};

/**
 * Creates a review orchestrator that coordinates the review process.
 * Delegates analysis to the review agent and side effects to injected adapters.
 */
export const createReviewOrchestrator = (deps: ReviewOrchestratorDeps) => {
  const anthropicClient = new Anthropic({ apiKey: deps.anthropicApiKey });

  const reviewPullRequest = async (
    owner: string,
    repo: string,
    prNumber: number,
    taskId: string,
    projectId: string,
    options?: { todoStateId?: string }
  ): Promise<ReviewResult<void>> => {
    try {
      console.log(`\n🔍 Review: Starting review for PR #${prNumber} (${taskId})...`);

      // Resolve task identifier (e.g. "AGENTHQ-32") to Plane issue UUID
      const parsed = deps.plane.parseIssueIdentifier(taskId);
      if (!parsed) {
        return { success: false, error: `Invalid task identifier: ${taskId}` };
      }

      console.log(`📥 Review: Resolving ${taskId} to Plane issue...`);
      const task = await deps.plane.findIssueBySequenceId(projectId, parsed.sequenceId);
      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found in project ${projectId}`,
        };
      }
      const issueId = task.id;

      // Create GitHub client for this request
      const github = deps.createGitHub(owner, repo);

      // Skip review if bot has already reviewed this PR (prevents infinite cycles)
      const botReviewMarker = "Automated review by PR Review Agent";
      const existingReviewsResult = await github.listReviews(prNumber);
      const existingBotReviews = existingReviewsResult.success
        ? existingReviewsResult.data.filter((r) => r.body.includes(botReviewMarker)).length
        : 0;

      if (existingBotReviews > 0) {
        console.log(
          `ℹ️  Review: Skipping PR #${prNumber} — already reviewed (${existingBotReviews} prior review(s))`
        );
        return { success: true, data: undefined };
      }

      // Fetch PR details
      console.log(`📥 Review: Fetching PR details...`);
      const prResult = await github.getPullRequest(prNumber);
      if (!prResult.success) {
        return {
          success: false,
          error: `Failed to fetch PR: ${prResult.error}`,
        };
      }
      const pr = prResult.data;

      // Fetch PR diff
      console.log(`📥 Review: Fetching PR diff...`);
      const diffResult = await github.getPullRequestDiff(prNumber);
      if (!diffResult.success) {
        return {
          success: false,
          error: `Failed to fetch diff: ${diffResult.error}`,
        };
      }
      const diff = diffResult.data;

      // Check diff size
      const diffSizeKb = Buffer.byteLength(diff, "utf-8") / 1024;
      if (diffSizeKb > deps.config.maxDiffSizeKb) {
        const message = `⚠️ Review: Diff too large (${diffSizeKb.toFixed(1)}KB > ${deps.config.maxDiffSizeKb}KB), skipping automated review`;
        console.log(message);

        void github
          .addComment(
            prNumber,
            `🤖 **Automated Review Skipped**\n\n${message}\n\nPlease review this PR manually.`
          )
          .catch((err: unknown) => {
            console.error(`❌ Review: Failed to post skip comment:`, err);
          });

        return { success: true, data: undefined };
      }

      // Load coding skills
      console.log(`📚 Review: Loading coding skills...`);
      const skills = loadSkills("implementation", "", {
        enabled: true,
        maxSkillsPerPrompt: 10,
        globalSkillsPath: "skills/global",
      });

      const codingSkills = skills
        .filter((s) => s.enabled)
        .map((s) => s.content)
        .join("\n\n---\n\n");

      // Build review context
      const context: ReviewContext = {
        taskDescription: task.description_html || task.name,
        acceptanceCriteria: undefined,
        prDescription: pr.body,
        prTitle: pr.title,
        diff,
        codingSkills,
      };

      // Run analysis via the review agent
      const analysisResult = await analyzeReview(
        context,
        anthropicClient,
        deps.config.claudeModel,
        skills,
        deps.config.useParallelReview
      );

      if (!analysisResult.success) {
        return handleAnalysisError(deps.plane, analysisResult.error, projectId, issueId);
      }

      const analysis = analysisResult.data;

      // Post review to GitHub
      const githubResult = await postReviewToGitHub(github, prNumber, analysis);
      if (!githubResult.success) {
        console.error(`❌ Review: Failed to post to GitHub: ${githubResult.error}`);
        // Don't attempt state transitions if the review wasn't posted
      } else {
        // Move task to Todo on first review with requested changes
        // The early-exit guard above ensures this only runs on the first review
        if (options?.todoStateId && analysis.overallAssessment === "request_changes") {
          try {
            await deps.plane.updateIssue(projectId, issueId, { state: options.todoStateId });
            console.log(`📋 Review: Moved ${taskId} back to Todo for rework`);
          } catch (err) {
            console.error(`❌ Review: Failed to move ${taskId} to Todo:`, err);
          }
        }
      }

      // Post summary to Plane task
      console.log(`📝 Review: Posting summary to Plane task...`);
      const planeSummary = buildPlaneSummary(analysis, prNumber, pr.html_url);

      void deps.plane.addComment(projectId, issueId, planeSummary).catch((err: unknown) => {
        console.error(`❌ Review: Failed to post summary to Plane:`, err);
      });

      console.log(`✅ Review: Review complete for PR #${prNumber}`);
      return { success: true, data: undefined };
    } catch (error: unknown) {
      console.error(`❌ Review: Unexpected error:`, error);

      if (error instanceof Error) {
        return { success: false, error: error.message };
      }

      return { success: false, error: "Unknown error during review" };
    }
  };

  return { reviewPullRequest };
};

export type ReviewOrchestrator = ReturnType<typeof createReviewOrchestrator>;
