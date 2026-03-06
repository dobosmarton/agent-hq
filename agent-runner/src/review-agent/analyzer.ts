import type Anthropic from "@anthropic-ai/sdk";
import type { CodeAnalysisResult, ReviewContext, ReviewResult } from "./types";
import { CodeAnalysisResultSchema } from "./types";
import { buildReviewPrompt, buildSystemPrompt } from "./prompts";
import { extractTextContent, parseClaudeJsonResponse } from "./parse-response";

/**
 * Analyzes code changes using Claude API
 *
 * @param context - Review context with code changes and task information
 * @param client - Anthropic API client
 * @param model - Claude model to use
 * @returns Analysis result with issues and overall assessment
 */
export const analyzeCode = async (
  context: ReviewContext,
  client: Anthropic,
  model: string
): Promise<ReviewResult<CodeAnalysisResult>> => {
  try {
    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildReviewPrompt(context);

    console.log(`🔍 Review: Analyzing code with ${model}...`);

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

    const textResult = extractTextContent(response.content, "Review");
    if (!textResult.success) {
      return textResult;
    }

    const analysisResult = parseClaudeJsonResponse(
      textResult.data,
      CodeAnalysisResultSchema,
      "Review"
    );
    if (!analysisResult.success) {
      return analysisResult;
    }

    const analysis = analysisResult.data;

    console.log(
      `✅ Review: Analysis complete - ${analysis.overallAssessment}, ${analysis.issues.length} issue(s)`
    );

    return { success: true, data: analysis };
  } catch (error: unknown) {
    console.error("❌ Review: Error calling Claude API:", error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Unknown error during code analysis" };
  }
};
