import Anthropic from "@anthropic-ai/sdk";
import type { CodeAnalysisResult, ReviewContext, ReviewResult } from "./types";
import { CodeAnalysisResultSchema } from "./types";
import { buildReviewPrompt, buildSystemPrompt } from "./prompts";

/**
 * Analyzes code changes using Claude API
 *
 * @param context - Review context with code changes and task information
 * @param apiKey - Anthropic API key
 * @param model - Claude model to use (default: claude-3-5-sonnet-20241022)
 * @returns Analysis result with issues and overall assessment
 */
export const analyzeCode = async (
  context: ReviewContext,
  apiKey: string,
  model: string = "claude-3-5-sonnet-20241022",
): Promise<ReviewResult<CodeAnalysisResult>> => {
  try {
    const client = new Anthropic({ apiKey });

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

    // Extract text from response
    const textContent = response.content.find(
      (block: { type: string }) => block.type === "text",
    );
    if (!textContent || textContent.type !== "text") {
      return {
        success: false,
        error: "No text content in Claude response",
      };
    }

    // Parse JSON from response
    let jsonText = textContent.text.trim();

    // Remove markdown code fences if present
    if (jsonText.startsWith("```json")) {
      jsonText = jsonText.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
    } else if (jsonText.startsWith("```")) {
      jsonText = jsonText.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
    }

    let parsed: unknown;
    try {
      parsed = JSON.parse(jsonText);
    } catch (parseError) {
      console.error("❌ Review: Failed to parse Claude response as JSON");
      console.error("Response text:", jsonText.substring(0, 500));
      return {
        success: false,
        error: `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      };
    }

    // Validate response against schema
    const validationResult = CodeAnalysisResultSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.error("❌ Review: Invalid response format from Claude");
      console.error("Validation errors:", validationResult.error.message);
      return {
        success: false,
        error: `Invalid response format: ${validationResult.error.message}`,
      };
    }

    const analysis = validationResult.data;

    console.log(
      `✅ Review: Analysis complete - ${analysis.overallAssessment}, ${analysis.issues.length} issue(s)`,
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
