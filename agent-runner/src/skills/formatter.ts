import type { Skill } from "./types";

/**
 * Format skills into a markdown section for prompt injection
 */
export const formatSkillsForPrompt = (skills: Skill[]): string => {
  if (skills.length === 0) {
    return "";
  }

  const sections: string[] = [
    "## Coding Standards & Best Practices",
    "",
    "The following coding standards and best practices should be followed:",
    "",
  ];

  for (const skill of skills) {
    sections.push(stripSkillMetadata(skill.content));
    sections.push(""); // Blank line between skills
  }

  return sections.join("\n");
};

/**
 * Format a compact skill catalog for prompt injection.
 * Only includes skill IDs and descriptions — full content
 * is loaded on-demand via the load_skill MCP tool.
 */
export const formatSkillsCatalog = (skills: Skill[]): string => {
  if (skills.length === 0) {
    return "";
  }

  const rows = skills
    .map((s) => `| ${s.id} | ${s.name} | ${s.description} |`)
    .join("\n");

  return `## Available Coding Skills
Load relevant skills using the load_skill tool before starting work.

| ID | Name | Description |
|----|------|-------------|
${rows}`;
};

/**
 * Strip skill metadata comments from content
 */
export const stripSkillMetadata = (content: string): string =>
  content
    .split("\n")
    .filter((line) => !line.trim().startsWith("<!-- skill:"))
    .join("\n")
    .trim();

/**
 * Format skills list for CLI display
 */
export const formatSkillsList = (global: Skill[], project: Skill[]): string => {
  const sections: string[] = [];

  if (global.length > 0) {
    sections.push("Global Skills:");
    sections.push("==============");
    for (const skill of global) {
      sections.push(
        `  • ${skill.name} (${skill.id}) [${skill.category}, priority: ${skill.priority}, applies to: ${skill.appliesTo}]`,
      );
      sections.push(`    ${skill.description}`);
      sections.push(`    File: ${skill.filePath}`);
    }
    sections.push("");
  } else {
    sections.push("Global Skills: (none)");
    sections.push("");
  }

  if (project.length > 0) {
    sections.push("Project Skills:");
    sections.push("===============");
    for (const skill of project) {
      sections.push(
        `  • ${skill.name} (${skill.id}) [${skill.category}, priority: ${skill.priority}, applies to: ${skill.appliesTo}]`,
      );
      sections.push(`    ${skill.description}`);
      sections.push(`    File: ${skill.filePath}`);
    }
    sections.push("");
  } else {
    sections.push("Project Skills: (none)");
    sections.push("");
  }

  return sections.join("\n");
};

/**
 * Format a single skill for detailed CLI display
 */
export const formatSkillDetail = (skill: Skill): string => {
  const sections: string[] = [
    `Skill: ${skill.name} (${skill.id})`,
    "=".repeat(50),
    "",
    `Description: ${skill.description}`,
    `Category: ${skill.category}`,
    `Priority: ${skill.priority}`,
    `Applies To: ${skill.appliesTo}`,
    `Type: ${skill.isProjectSkill ? "Project" : "Global"}`,
    `File: ${skill.filePath}`,
    "",
    "Content:",
    "--------",
    skill.content,
  ];

  return sections.join("\n");
};
