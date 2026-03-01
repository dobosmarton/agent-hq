import Anthropic from "@anthropic-ai/sdk";
import type {
  ReviewContext,
  ReviewResult,
  CodeAnalysisResult,
  ReviewIssue,
} from "./types";
import type { ToolSelectionResult } from "./review-tools";
import { CodeAnalysisResultSchema } from "./types";

/**
 * Review result from a single tool
 */
export type ToolReviewResult = {
  toolName: string;
  category: string;
  analysis: CodeAnalysisResult;
  executionTimeMs: number;
};

/**
 * Aggregated review from multiple tools
 */
export type AggregatedReview = {
  overallAssessment: "approve" | "request_changes" | "comment";
  summary: string;
  issues: readonly ReviewIssue[];
  toolsUsed: readonly string[];
  totalExecutionTimeMs: number;
};

/**
 * Executes a single review tool
 */
const executeReviewTool = async (
  context: ReviewContext,
  toolSelection: ToolSelectionResult,
  apiKey: string,
  model: string,
): Promise<ReviewResult<ToolReviewResult>> => {
  const startTime = Date.now();

  try {
    const { tool, reason } = toolSelection;
    const client = new Anthropic({ apiKey });

    console.log(`  🔍 ${tool.category}: Starting review... (${reason})`);

    const systemPrompt = `You are an expert ${tool.category} code reviewer.

${tool.skill.content}

Review the code changes and provide feedback following the guidelines in the skill document above.

Return your analysis as JSON in this exact format:
{
  "overallAssessment": "approve" | "request_changes" | "comment",
  "summary": "Brief summary of your ${tool.category} review (2-3 sentences)",
  "issues": [
    {
      "category": "${tool.category}",
      "severity": "critical" | "major" | "minor" | "suggestion",
      "description": "Clear description of the issue",
      "suggestion": "How to fix it",
      "file": "path/to/file.ts",
      "line": 42
    }
  ]
}

Focus specifically on ${tool.category} concerns. If you find no ${tool.category} issues, return an empty issues array.`;

    const userPrompt = `# PULL REQUEST
Title: ${context.prTitle}
Description: ${context.prDescription || "No description"}

# TASK
${context.taskDescription}
${context.acceptanceCriteria ? `\nAcceptance Criteria:\n${context.acceptanceCriteria}` : ""}

# CODE CHANGES
${context.diff}

Perform a ${tool.category} review of these code changes.`;

    const response = await client.messages.create({
      model,
      max_tokens: 4096,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract and parse response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return {
        success: false,
        error: `No text content in ${tool.category} review response`,
      };
    }

    let jsonText = textContent.text.trim();
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error(`  ❌ ${tool.category}: Failed to parse JSON`);
      return {
        success: false,
        error: `Failed to parse ${tool.category} review: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      };
    }

    const validationResult = CodeAnalysisResultSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.error(`  ❌ ${tool.category}: Invalid response format`);
      return {
        success: false,
        error: `Invalid ${tool.category} review format: ${validationResult.error.message}`,
      };
    }

    const analysis = validationResult.data;
    const executionTimeMs = Date.now() - startTime;

    console.log(
      `  ✅ ${tool.category}: Complete - ${analysis.issues.length} issue(s) (${executionTimeMs}ms)`,
    );

    return {
      success: true,
      data: {
        toolName: tool.name,
        category: tool.category,
        analysis,
        executionTimeMs,
      },
    };
  } catch (error: unknown) {
    const executionTimeMs = Date.now() - startTime;
    console.error(`  ❌ ${toolSelection.tool.category}: Error:`, error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return {
      success: false,
      error: `Unknown error during ${toolSelection.tool.category} review`,
    };
  }
};

/**
 * Executes multiple review tools in parallel
 *
 * @param context - Review context
 * @param selectedTools - Tools to execute
 * @param apiKey - Anthropic API key
 * @param model - Claude model to use
 * @returns Aggregated review results
 */
export const executeParallelReviews = async (
  context: ReviewContext,
  selectedTools: readonly ToolSelectionResult[],
  apiKey: string,
  model: string,
): Promise<ReviewResult<AggregatedReview>> => {
  try {
    console.log(
      `\n🔄 Parallel Reviewer: Executing ${selectedTools.length} review(s) in parallel...`,
    );

    const startTime = Date.now();

    // Execute all reviews in parallel
    const reviewPromises = selectedTools.map((toolSelection) =>
      executeReviewTool(context, toolSelection, apiKey, model),
    );

    const results = await Promise.all(reviewPromises);

    // Collect successful reviews
    const successfulReviews: ToolReviewResult[] = [];
    const failures: string[] = [];

    for (const result of results) {
      if (result.success) {
        successfulReviews.push(result.data);
      } else {
        failures.push(result.error);
      }
    }

    if (successfulReviews.length === 0) {
      return {
        success: false,
        error: `All reviews failed: ${failures.join("; ")}`,
      };
    }

    if (failures.length > 0) {
      console.warn(
        `⚠️  Parallel Reviewer: ${failures.length} review(s) failed: ${failures.join("; ")}`,
      );
    }

    // Aggregate results
    const aggregated = aggregateReviews(successfulReviews);
    const totalExecutionTimeMs = Date.now() - startTime;

    console.log(
      `\n✅ Parallel Reviewer: Complete in ${totalExecutionTimeMs}ms - ${aggregated.overallAssessment}, ${aggregated.issues.length} total issue(s)`,
    );

    return {
      success: true,
      data: {
        ...aggregated,
        totalExecutionTimeMs,
      },
    };
  } catch (error: unknown) {
    console.error("❌ Parallel Reviewer: Error:", error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Unknown error during parallel reviews" };
  }
};

/**
 * Aggregates review results from multiple tools
 */
const aggregateReviews = (
  reviews: readonly ToolReviewResult[],
): Omit<AggregatedReview, "totalExecutionTimeMs"> => {
  // Collect all issues
  const allIssues: ReviewIssue[] = [];
  for (const review of reviews) {
    allIssues.push(...review.analysis.issues);
  }

  // Deduplicate similar issues
  const deduplicatedIssues = deduplicateIssues(allIssues);

  // Determine overall assessment
  const hasCritical = deduplicatedIssues.some((i) => i.severity === "critical");
  const hasMajor = deduplicatedIssues.some((i) => i.severity === "major");

  const overallAssessment =
    hasCritical || hasMajor
      ? "request_changes"
      : deduplicatedIssues.length > 0
        ? "comment"
        : "approve";

  // Build summary
  const summaries = reviews.map((r) => `${r.category}: ${r.analysis.summary}`);
  const summary = `Parallel review completed using ${reviews.length} specialized reviewers. ${summaries.join(" | ")}`;

  return {
    overallAssessment,
    summary,
    issues: deduplicatedIssues,
    toolsUsed: reviews.map((r) => r.category),
  };
};

/**
 * Deduplicates similar issues
 */
const deduplicateIssues = (
  issues: readonly ReviewIssue[],
): readonly ReviewIssue[] => {
  const seen = new Set<string>();
  const unique: ReviewIssue[] = [];

  for (const issue of issues) {
    // Create a key based on description and file/line
    const key = `${issue.description}:${issue.file || ""}:${issue.line || ""}`;

    if (!seen.has(key)) {
      seen.add(key);
      unique.push(issue);
    }
  }

  // Sort by severity (critical first)
  const severityOrder = { critical: 0, major: 1, minor: 2, suggestion: 3 };
  unique.sort((a, b) => severityOrder[a.severity] - severityOrder[b.severity]);

  return unique;
};
