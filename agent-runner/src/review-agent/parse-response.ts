import type { z } from "zod";
import type { ReviewResult } from "./types";

/**
 * Strips markdown code fences from a string
 */
const stripCodeFences = (text: string): string => {
  let result = text.trim();

  if (result.startsWith("```json")) {
    result = result.replace(/^```json\s*/i, "").replace(/\s*```$/i, "");
  } else if (result.startsWith("```")) {
    result = result.replace(/^```\s*/i, "").replace(/\s*```$/i, "");
  }

  return result;
};

/**
 * Parses and validates a Claude API JSON response against a Zod schema.
 * Handles markdown code fence stripping, JSON parsing, and schema validation.
 *
 * @param text - Raw text from Claude response
 * @param schema - Zod schema to validate against
 * @param label - Label for error messages (e.g. "code analysis", "tool selection")
 * @returns Validated data or error
 */
export const parseClaudeJsonResponse = <T>(
  text: string,
  schema: z.ZodSchema<T>,
  label: string,
): ReviewResult<T> => {
  const jsonText = stripCodeFences(text);

  let parsed: unknown;
  try {
    parsed = JSON.parse(jsonText);
  } catch (parseError) {
    console.error(`❌ ${label}: Failed to parse Claude response as JSON`);
    console.error("Response text:", jsonText.substring(0, 500));
    return {
      success: false,
      error: `Failed to parse JSON response: ${parseError instanceof Error ? parseError.message : "Unknown error"}`,
    };
  }

  const validationResult = schema.safeParse(parsed);
  if (!validationResult.success) {
    console.error(`❌ ${label}: Invalid response format from Claude`);
    console.error("Validation errors:", validationResult.error.message);
    return {
      success: false,
      error: `Invalid response format: ${validationResult.error.message}`,
    };
  }

  return { success: true, data: validationResult.data };
};

/**
 * Extracts text content from a Claude API response
 *
 * @param content - Response content blocks from Claude
 * @param label - Label for error messages
 * @returns Text string or error
 */
export const extractTextContent = (
  content: readonly { type: string; text?: string }[],
  label: string,
): ReviewResult<string> => {
  const textContent = content.find((block) => block.type === "text");
  if (!textContent || textContent.type !== "text" || !textContent.text) {
    return {
      success: false,
      error: `No text content in ${label} response`,
    };
  }

  return { success: true, data: textContent.text };
};
