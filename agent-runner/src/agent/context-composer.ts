import type { AgentPhase } from "./phase";
import type { ContextCache } from "../cache/context-cache";

/**
 * Context priority levels for intelligent composition
 */
type ContextPriority = "critical" | "high" | "medium" | "low";

/**
 * Context item with priority and estimated token size
 */
type ContextItem = {
  name: string;
  content: string;
  priority: ContextPriority;
  tokens: number;
};

/**
 * Rough token estimation (4 chars ≈ 1 token)
 */
const estimateTokens = (text: string): number => {
  return Math.ceil(text.length / 4);
};

/**
 * Priority weights for sorting
 */
const PRIORITY_WEIGHTS: Record<ContextPriority, number> = {
  critical: 1000,
  high: 100,
  medium: 10,
  low: 1,
};

/**
 * Determine context priority based on phase and turn number
 */
const getContextPriority = (
  contextName: string,
  phase: AgentPhase,
  turnNumber: number,
): ContextPriority => {
  const isPlanningPhase = phase === "planning";
  const isEarlyImplementation = !isPlanningPhase && turnNumber <= 20;

  // Task description is always critical
  if (contextName === "task_description") {
    return "critical";
  }

  // Planning phase priorities
  if (isPlanningPhase) {
    if (
      contextName === "project_structure" ||
      contextName === "similar_tasks"
    ) {
      return "high";
    }
    if (contextName === "code_conventions" || contextName === "ci_workflows") {
      return "medium";
    }
    if (contextName === "detailed_files") {
      return "low"; // Agents discover incrementally
    }
  }

  // Implementation phase priorities
  if (!isPlanningPhase) {
    if (contextName === "approved_plan") {
      return "critical";
    }
    if (isEarlyImplementation) {
      if (contextName === "ci_workflows" || contextName === "modified_files") {
        return "high";
      }
      if (contextName === "related_files") {
        return "medium";
      }
      if (contextName === "project_conventions") {
        return "low"; // Less important once coding starts
      }
    } else {
      // Late implementation (turns 21+)
      if (contextName === "modified_files" || contextName === "ci_workflows") {
        return "critical";
      }
      if (contextName === "test_patterns") {
        return "high";
      }
      if (contextName === "project_structure") {
        return "low";
      }
    }
  }

  return "medium"; // Default
};

/**
 * Compose context intelligently based on phase and budget
 */
export const composeContext = (
  items: Array<{ name: string; content: string }>,
  phase: AgentPhase,
  turnNumber: number = 1,
  maxTokens: number = 20000,
): string => {
  // Add priorities and token estimates
  const contextItems: ContextItem[] = items.map((item) => ({
    name: item.name,
    content: item.content,
    priority: getContextPriority(item.name, phase, turnNumber),
    tokens: estimateTokens(item.content),
  }));

  // Sort by priority (critical first)
  contextItems.sort((a, b) => {
    const weightDiff =
      PRIORITY_WEIGHTS[a.priority] - PRIORITY_WEIGHTS[b.priority];
    if (weightDiff !== 0) return -weightDiff; // Higher priority first
    return a.tokens - b.tokens; // Smaller items first within same priority
  });

  // Select items within token budget
  const selected: ContextItem[] = [];
  let totalTokens = 0;

  for (const item of contextItems) {
    if (totalTokens + item.tokens <= maxTokens) {
      selected.push(item);
      totalTokens += item.tokens;
    } else if (item.priority === "critical") {
      // Always include critical items, even if over budget
      selected.push(item);
      totalTokens += item.tokens;
    }
  }

  // Log composition stats
  const skipped = contextItems.length - selected.length;
  if (skipped > 0) {
    console.log(
      `[ContextComposer] Selected ${selected.length}/${contextItems.length} items (~${totalTokens} tokens), skipped ${skipped} low-priority items`,
    );
  }

  // Build composed context
  return selected.map((item) => item.content).join("\n\n");
};

/**
 * Filter and rank context items by relevance
 */
export const prioritizeContext = (
  items: Array<{ name: string; content: string }>,
  phase: AgentPhase,
): Array<{ name: string; content: string; priority: ContextPriority }> => {
  return items
    .map((item) => ({
      name: item.name,
      content: item.content,
      priority: getContextPriority(item.name, phase, 1),
    }))
    .sort(
      (a, b) => PRIORITY_WEIGHTS[b.priority] - PRIORITY_WEIGHTS[a.priority],
    );
};

/**
 * Get recommended context types for a given phase
 */
export const getRecommendedContextTypes = (phase: AgentPhase): string[] => {
  if (phase === "planning") {
    return [
      "task_description",
      "project_structure",
      "code_conventions",
      "similar_tasks",
      "ci_workflows",
    ];
  } else {
    return [
      "task_description",
      "approved_plan",
      "ci_workflows",
      "modified_files",
      "related_files",
      "test_patterns",
    ];
  }
};

/**
 * Create a context composer with cache integration
 */
export const createContextComposer = (cache: ContextCache) => {
  return {
    compose: composeContext,
    prioritize: prioritizeContext,
    getRecommendedTypes: getRecommendedContextTypes,
    estimateTokens,
    cache, // Expose cache for direct access if needed
  };
};

export type ContextComposer = ReturnType<typeof createContextComposer>;
