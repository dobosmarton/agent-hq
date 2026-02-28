import type { PlaneConfig } from "../config";
import type { TaskPoller } from "../poller/task-poller";
import { addComment, getIssue } from "../plane/client";
import { GitHubClient } from "../github/client";
import { loadSkills } from "../skills/loader";
import type { ReviewContext, ReviewResult } from "./types";
import { analyzeCode } from "./analyzer";
import { postReviewToGitHub } from "./github-reviewer";

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
};

/**
 * Review agent orchestrator that coordinates the review process
 */
export class ReviewAgentOrchestrator {
  constructor(
    private readonly reviewConfig: ReviewAgentConfig,
    private readonly planeConfig: PlaneConfig,
    private readonly taskPoller: TaskPoller,
    private readonly anthropicApiKey: string,
    private readonly githubToken: string,
  ) {}

  /**
   * Reviews a pull request
   *
   * @param owner - GitHub repository owner
   * @param repo - GitHub repository name
   * @param prNumber - Pull request number
   * @param taskId - Plane task ID
   * @param projectId - Plane project ID
   * @returns Review result
   */
  public reviewPullRequest = async (
    owner: string,
    repo: string,
    prNumber: number,
    taskId: string,
    projectId: string,
  ): Promise<ReviewResult<void>> => {
    try {
      console.log(`\n🔍 Review: Starting review for PR #${prNumber} (${taskId})...`);

      // Create GitHub client
      const githubClient = new GitHubClient({
        token: this.githubToken,
        owner,
        repo,
      });

      // Fetch PR details
      console.log(`📥 Review: Fetching PR details...`);
      const prResult = await githubClient.getPullRequest(prNumber);
      if (!prResult.success) {
        return { success: false, error: `Failed to fetch PR: ${prResult.error}` };
      }
      const pr = prResult.data;

      // Fetch PR diff
      console.log(`📥 Review: Fetching PR diff...`);
      const diffResult = await githubClient.getPullRequestDiff(prNumber);
      if (!diffResult.success) {
        return { success: false, error: `Failed to fetch diff: ${diffResult.error}` };
      }
      const diff = diffResult.data;

      // Check diff size
      const diffSizeKb = Buffer.byteLength(diff, "utf-8") / 1024;
      if (diffSizeKb > this.reviewConfig.maxDiffSizeKb) {
        const message = `⚠️ Review: Diff too large (${diffSizeKb.toFixed(1)}KB > ${this.reviewConfig.maxDiffSizeKb}KB), skipping automated review`;
        console.log(message);

        void githubClient
          .addComment(
            prNumber,
            `🤖 **Automated Review Skipped**\n\n${message}\n\nPlease review this PR manually.`,
          )
          .catch((err: unknown) => {
            console.error(`❌ Review: Failed to post skip comment:`, err);
          });

        return { success: true, data: undefined };
      }

      // Fetch task details
      console.log(`📥 Review: Fetching task details from Plane...`);
      const task = await getIssue(this.planeConfig, projectId, taskId);
      if (!task) {
        return {
          success: false,
          error: `Task ${taskId} not found in project ${projectId}`,
        };
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
        acceptanceCriteria: undefined, // TODO: Extract from task description
        prDescription: pr.body,
        prTitle: pr.title,
        diff,
        codingSkills,
      };

      // Analyze code with Claude
      const analysisResult = await analyzeCode(
        context,
        this.anthropicApiKey,
        this.reviewConfig.claudeModel,
      );

      if (!analysisResult.success) {
        console.error(`❌ Review: Analysis failed: ${analysisResult.error}`);

        // Post error comment to Plane
        void addComment(
          this.planeConfig,
          projectId,
          taskId,
          `<p><strong>⚠️ Automated PR Review Failed</strong></p><p>Error: ${analysisResult.error}</p><p>Please review the PR manually.</p>`,
        ).catch((err: unknown) => {
          console.error(`❌ Review: Failed to post error comment to Plane:`, err);
        });

        return { success: false, error: analysisResult.error };
      }

      const analysis = analysisResult.data;

      // Post review to GitHub
      const githubResult = await postReviewToGitHub(githubClient, prNumber, analysis);
      if (!githubResult.success) {
        console.error(`❌ Review: Failed to post to GitHub: ${githubResult.error}`);
      }

      // Post summary to Plane task
      console.log(`📝 Review: Posting summary to Plane task...`);
      const planeSummary = this.buildPlaneSummary(analysis, prNumber, pr.html_url);

      void addComment(this.planeConfig, projectId, taskId, planeSummary).catch(
        (err: unknown) => {
          console.error(`❌ Review: Failed to post summary to Plane:`, err);
        },
      );

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

  /**
   * Builds the summary to post to Plane task
   */
  private buildPlaneSummary = (
    analysis: CodeAnalysisResult,
    prNumber: number,
    prUrl: string,
  ): string => {
    const header =
      analysis.overallAssessment === "approve"
        ? "<h3>✅ Automated PR Review - No Issues Found</h3>"
        : analysis.overallAssessment === "request_changes"
          ? "<h3>❌ Automated PR Review - Changes Requested</h3>"
          : "<h3>💬 Automated PR Review - Comments</h3>";

    const prLink = `<p><strong>PR:</strong> <a href="${prUrl}">#${prNumber}</a></p>`;

    const summary = `<p>${analysis.summary}</p>`;

    const issuesList =
      analysis.issues.length > 0
        ? `<p><strong>Issues Found:</strong></p><ul>${analysis.issues.map((issue) => `<li><strong>${issue.severity} - ${issue.category}:</strong> ${issue.description}${issue.suggestion ? `<br/>💡 ${issue.suggestion}` : ""}</li>`).join("")}</ul>`
        : "<p><em>No issues found. Code looks good!</em></p>";

    return `${header}${prLink}${summary}${issuesList}<p><em>🤖 Automated review by PR Review Agent</em></p>`;
  };
}

// Import for type reference
import type { CodeAnalysisResult } from "./types";
