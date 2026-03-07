import type Anthropic from "@anthropic-ai/sdk";
import type { Skill } from "@agent-hq/skills";
import type { ReviewContext, ReviewResult, CodeAnalysisResult } from "./types";
import type { AggregatedReview } from "./parallel-reviewer";
import { analyzeCode } from "./analyzer";
import { loadReviewTools } from "./review-tools";
import { selectReviewTools } from "./tool-selector";
import { executeParallelReviews } from "./parallel-reviewer";

/**
 * Pure review analysis — no side effects (no GitHub posting, no Plane updates).
 * Dispatches to single-pass or parallel review strategy based on configuration.
 */
export const analyzeReview = async (
  context: ReviewContext,
  anthropicClient: Anthropic,
  model: string,
  skills: readonly Skill[],
  useParallelReview: boolean
): Promise<ReviewResult<CodeAnalysisResult | AggregatedReview>> => {
  const reviewTools = useParallelReview ? loadReviewTools(skills) : [];

  if (!useParallelReview || reviewTools.length === 0) {
    if (useParallelReview && reviewTools.length === 0) {
      console.warn("⚠️  Review: No review tools available, falling back to single review");
    }
    return analyzeCode(context, anthropicClient, model);
  }

  const toolSelectionResult = await selectReviewTools(context, reviewTools, anthropicClient, model);
  if (!toolSelectionResult.success) {
    return toolSelectionResult;
  }

  return executeParallelReviews(context, toolSelectionResult.data, anthropicClient, model);
};
