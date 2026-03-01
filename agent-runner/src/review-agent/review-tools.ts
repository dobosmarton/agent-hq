import type { Skill } from "../skills/types";

/**
 * Review tool definition
 */
export type ReviewTool = {
  name: string;
  description: string;
  skill: Skill;
  priority: number;
  category: string;
};

/**
 * Review tool selection result
 */
export type ToolSelectionResult = {
  tool: ReviewTool;
  reason: string;
};

/**
 * Loads review-specific skills and converts them to tools
 */
export const loadReviewTools = (
  skills: readonly Skill[],
): readonly ReviewTool[] => {
  const reviewCategories = [
    "security",
    "architecture",
    "performance",
    "testing",
    "completeness",
  ];

  return skills
    .filter((skill) => reviewCategories.includes(skill.category || ""))
    .map((skill) => ({
      name: `review_${skill.id}`,
      description: skill.description,
      skill,
      priority: skill.priority,
      category: skill.category || "general",
    }))
    .sort((a, b) => b.priority - a.priority);
};

/**
 * Builds tool descriptions for Claude to select from
 */
export const buildToolDescriptions = (tools: readonly ReviewTool[]): string => {
  return tools
    .map(
      (tool) =>
        `- **${tool.name}** (priority: ${tool.priority}): ${tool.description}
  Category: ${tool.category}`,
    )
    .join("\n");
};

/**
 * Finds a review tool by name
 */
export const findTool = (
  tools: readonly ReviewTool[],
  name: string,
): ReviewTool | undefined => {
  return tools.find((tool) => tool.name === name);
};
