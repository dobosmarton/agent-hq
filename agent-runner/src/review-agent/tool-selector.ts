import Anthropic from "@anthropic-ai/sdk";
import type { ReviewContext, ReviewResult } from "./types";
import type { ReviewTool, ToolSelectionResult } from "./review-tools";
import { buildToolDescriptions } from "./review-tools";
import { z } from "zod";

/**
 * Schema for tool selection response
 */
const ToolSelectionSchema = z.object({
  selectedTools: z.array(
    z.object({
      toolName: z.string(),
      reason: z.string(),
    }),
  ),
  rationale: z.string(),
});

type ToolSelection = z.infer<typeof ToolSelectionSchema>;

/**
 * Selects which review tools to use based on PR context
 *
 * @param context - Review context with PR and task information
 * @param availableTools - Available review tools
 * @param apiKey - Anthropic API key
 * @param model - Claude model to use
 * @returns Selected tools with reasons
 */
export const selectReviewTools = async (
  context: ReviewContext,
  availableTools: readonly ReviewTool[],
  apiKey: string,
  model: string = "claude-3-5-sonnet-20241022",
): Promise<ReviewResult<readonly ToolSelectionResult[]>> => {
  try {
    const client = new Anthropic({ apiKey });

    const toolDescriptions = buildToolDescriptions(availableTools);

    const systemPrompt = `You are a code review coordinator. Your job is to select which specialized review tools should be used to review a pull request.

Available review tools:
${toolDescriptions}

Select the most relevant tools based on the PR content and task context. Choose tools that will provide value given the code changes.

Guidelines:
- Select 3-5 tools that are most relevant
- Always include completeness review to verify requirements are met
- Include security review if code handles user input, authentication, or sensitive data
- Include performance review if code has database queries, loops, or API calls
- Include architecture review if code adds new modules or changes structure
- Include testing review if code adds or changes functionality

Return your selection as JSON in this format:
{
  "selectedTools": [
    {
      "toolName": "review_security",
      "reason": "Code handles user authentication"
    }
  ],
  "rationale": "Brief explanation of overall selection strategy"
}`;

    const userPrompt = `Select review tools for this pull request:

# PULL REQUEST
Title: ${context.prTitle}
Description: ${context.prDescription || "No description"}

# TASK
${context.taskDescription}
${context.acceptanceCriteria ? `\nAcceptance Criteria:\n${context.acceptanceCriteria}` : ""}

# CODE CHANGES (summary)
${context.diff.substring(0, 3000)}... (${Buffer.byteLength(context.diff)} bytes total)

Select the most relevant review tools and explain your choices.`;

    console.log(`🔧 Tool Selector: Analyzing PR to select review tools...`);

    const response = await client.messages.create({
      model,
      max_tokens: 2048,
      system: systemPrompt,
      messages: [
        {
          role: "user",
          content: userPrompt,
        },
      ],
    });

    // Extract text from response
    const textContent = response.content.find((block) => block.type === "text");
    if (!textContent || textContent.type !== "text") {
      return {
        success: false,
        error: "No text content in tool selection response",
      };
    }

    // Parse JSON
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
      console.error("❌ Tool Selector: Failed to parse JSON response");
      return {
        success: false,
        error: `Failed to parse tool selection: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
      };
    }

    // Validate response
    const validationResult = ToolSelectionSchema.safeParse(parsed);
    if (!validationResult.success) {
      console.error("❌ Tool Selector: Invalid response format");
      return {
        success: false,
        error: `Invalid tool selection format: ${validationResult.error.message}`,
      };
    }

    const selection: ToolSelection = validationResult.data;

    // Map tool names to actual tools
    const selectedTools: ToolSelectionResult[] = [];
    for (const selected of selection.selectedTools) {
      const tool = availableTools.find((t) => t.name === selected.toolName);
      if (tool) {
        selectedTools.push({
          tool,
          reason: selected.reason,
        });
      } else {
        console.warn(`⚠️  Tool Selector: Unknown tool ${selected.toolName}`);
      }
    }

    console.log(
      `✅ Tool Selector: Selected ${selectedTools.length} tool(s): ${selectedTools.map((t) => t.tool.category).join(", ")}`,
    );
    console.log(`   Rationale: ${selection.rationale}`);

    return { success: true, data: selectedTools };
  } catch (error: unknown) {
    console.error("❌ Tool Selector: Error selecting tools:", error);

    if (error instanceof Error) {
      return { success: false, error: error.message };
    }

    return { success: false, error: "Unknown error during tool selection" };
  }
};
