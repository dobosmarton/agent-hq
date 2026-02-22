import { describe, it, expect } from "vitest";
import {
  formatSkillsForPrompt,
  formatSkillsCatalog,
  stripSkillMetadata,
  formatSkillsList,
  formatSkillDetail,
} from "../formatter";
import type { Skill } from "../types";

describe("skills formatter", () => {
  const mockSkill: Skill = {
    id: "test-skill",
    name: "Test Skill",
    description: "A test skill",
    category: "best-practices",
    priority: 80,
    content: `<!-- skill:name = Test Skill -->
<!-- skill:description = A test skill -->

# Test Skill

This is the content.`,
    appliesTo: "both",
    enabled: true,
    filePath: "/path/to/test-skill.md",
    isProjectSkill: false,
  };

  describe("formatSkillsForPrompt", () => {
    it("should return empty string for empty array", () => {
      const result = formatSkillsForPrompt([]);
      expect(result).toBe("");
    });

    it("should format single skill", () => {
      const result = formatSkillsForPrompt([mockSkill]);
      expect(result).toContain("## Coding Standards & Best Practices");
      expect(result).toContain("# Test Skill");
      expect(result).toContain("This is the content.");
    });

    it("should remove metadata comments from content", () => {
      const result = formatSkillsForPrompt([mockSkill]);
      expect(result).not.toContain("<!-- skill:name");
      expect(result).not.toContain("<!-- skill:description");
    });

    it("should format multiple skills", () => {
      const skill2: Skill = {
        ...mockSkill,
        id: "second-skill",
        name: "Second Skill",
        content: "# Second Skill\n\nSecond content.",
      };

      const result = formatSkillsForPrompt([mockSkill, skill2]);
      expect(result).toContain("# Test Skill");
      expect(result).toContain("# Second Skill");
    });

    it("should separate skills with blank lines", () => {
      const skill2: Skill = {
        ...mockSkill,
        id: "second-skill",
        content: "# Second",
      };

      const result = formatSkillsForPrompt([mockSkill, skill2]);
      const lines = result.split("\n");
      // Should have blank lines between skills
      expect(lines.filter((l) => l === "").length).toBeGreaterThan(0);
    });
  });

  describe("formatSkillsCatalog", () => {
    it("should return empty string for empty array", () => {
      const result = formatSkillsCatalog([]);
      expect(result).toBe("");
    });

    it("should produce a markdown table with skill IDs and descriptions", () => {
      const result = formatSkillsCatalog([mockSkill]);
      expect(result).toContain("## Available Coding Skills");
      expect(result).toContain("load_skill");
      expect(result).toContain("| ID | Name | Description |");
      expect(result).toContain("| test-skill | Test Skill | A test skill |");
    });

    it("should include all skills in the table", () => {
      const skill2: Skill = {
        ...mockSkill,
        id: "python-best-practices",
        name: "Python Best Practices",
        description: "Python 3.12+ patterns",
      };

      const result = formatSkillsCatalog([mockSkill, skill2]);
      expect(result).toContain("| test-skill |");
      expect(result).toContain("| python-best-practices |");
    });

    it("should not include full skill content", () => {
      const result = formatSkillsCatalog([mockSkill]);
      expect(result).not.toContain("This is the content.");
    });
  });

  describe("stripSkillMetadata", () => {
    it("should remove metadata comments", () => {
      const result = stripSkillMetadata(mockSkill.content);
      expect(result).not.toContain("<!-- skill:name");
      expect(result).not.toContain("<!-- skill:description");
      expect(result).toContain("# Test Skill");
      expect(result).toContain("This is the content.");
    });

    it("should handle content without metadata", () => {
      const result = stripSkillMetadata("# Just content\n\nNo metadata.");
      expect(result).toBe("# Just content\n\nNo metadata.");
    });
  });

  describe("formatSkillsList", () => {
    it("should format empty lists", () => {
      const result = formatSkillsList([], []);
      expect(result).toContain("Global Skills: (none)");
      expect(result).toContain("Project Skills: (none)");
    });

    it("should format global skills", () => {
      const result = formatSkillsList([mockSkill], []);
      expect(result).toContain("Global Skills:");
      expect(result).toContain("Test Skill (test-skill)");
      expect(result).toContain("A test skill");
      expect(result).toContain("/path/to/test-skill.md");
    });

    it("should format project skills", () => {
      const projectSkill: Skill = {
        ...mockSkill,
        isProjectSkill: true,
        filePath: "/project/.claude/skills/test.md",
      };

      const result = formatSkillsList([], [projectSkill]);
      expect(result).toContain("Project Skills:");
      expect(result).toContain("Test Skill (test-skill)");
    });

    it("should show skill metadata", () => {
      const result = formatSkillsList([mockSkill], []);
      expect(result).toContain("best-practices");
      expect(result).toContain("priority: 80");
      expect(result).toContain("applies to: both");
    });
  });

  describe("formatSkillDetail", () => {
    it("should format skill details", () => {
      const result = formatSkillDetail(mockSkill);
      expect(result).toContain("Skill: Test Skill (test-skill)");
      expect(result).toContain("Description: A test skill");
      expect(result).toContain("Category: best-practices");
      expect(result).toContain("Priority: 80");
      expect(result).toContain("Applies To: both");
      expect(result).toContain("Type: Global");
      expect(result).toContain("File: /path/to/test-skill.md");
      expect(result).toContain("Content:");
      expect(result).toContain("# Test Skill");
    });

    it("should show project type for project skills", () => {
      const projectSkill: Skill = { ...mockSkill, isProjectSkill: true };
      const result = formatSkillDetail(projectSkill);
      expect(result).toContain("Type: Project");
    });
  });
});
