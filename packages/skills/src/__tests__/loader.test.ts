import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadSkills, clearSkillCache, listAllSkills } from "../loader";
import type { SkillsConfig } from "../types";

const skill = (fields: {
  name: string;
  description: string;
  category: string;
  priority?: number;
  applies_to?: string;
  enabled?: string;
}): string => {
  const lines = [
    "---",
    `name: ${fields.name}`,
    `description: ${fields.description}`,
    `category: ${fields.category}`,
  ];
  if (fields.priority !== undefined) lines.push(`priority: ${fields.priority}`);
  if (fields.applies_to) lines.push(`applies_to: ${fields.applies_to}`);
  if (fields.enabled) lines.push(`enabled: ${fields.enabled}`);
  lines.push("---", "", `# ${fields.name}`, "Content here");
  return lines.join("\n");
};

describe("skills loader", () => {
  const testDir = join(process.cwd(), "test-skills-temp");
  const globalDir = join(testDir, "global");
  const projectDir = join(testDir, "project");
  const projectSkillsDir = join(projectDir, ".claude", "skills");

  const defaultConfig: SkillsConfig = {
    enabled: true,
    maxSkillsPerPrompt: 10,
    globalSkillsPath: globalDir,
  };

  beforeEach(() => {
    // Clean up and create test directories
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(globalDir, { recursive: true });
    mkdirSync(projectSkillsDir, { recursive: true });
    clearSkillCache();
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    clearSkillCache();
  });

  describe("loadSkills", () => {
    it("should return empty array when skills are disabled", () => {
      const config: SkillsConfig = { ...defaultConfig, enabled: false };
      const skills = loadSkills("both", projectDir, config);
      expect(skills).toEqual([]);
    });

    it("should return empty array when no skill files exist", () => {
      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toEqual([]);
    });

    it("should load global skills", () => {
      writeFileSync(
        join(globalDir, "test-skill.md"),
        skill({
          name: "Test Skill",
          description: "A test skill",
          category: "best-practices",
          priority: 80,
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("test-skill");
      expect(skills[0]?.name).toBe("Test Skill");
      expect(skills[0]?.priority).toBe(80);
      expect(skills[0]?.isProjectSkill).toBe(false);
    });

    it("should load project skills", () => {
      writeFileSync(
        join(projectSkillsDir, "project-skill.md"),
        skill({
          name: "Project Skill",
          description: "A project-specific skill",
          category: "patterns",
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("project-skill");
      expect(skills[0]?.isProjectSkill).toBe(true);
    });

    it("should merge global and project skills", () => {
      writeFileSync(
        join(globalDir, "global-skill.md"),
        skill({ name: "Global Skill", description: "Global", category: "best-practices" })
      );

      writeFileSync(
        join(projectSkillsDir, "project-skill.md"),
        skill({ name: "Project Skill", description: "Project", category: "patterns" })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(2);
    });

    it("should override global skill with project skill of same ID", () => {
      writeFileSync(
        join(globalDir, "override-test.md"),
        skill({
          name: "Global Version",
          description: "Global",
          category: "best-practices",
          priority: 50,
        })
      );

      writeFileSync(
        join(projectSkillsDir, "override-test.md"),
        skill({
          name: "Project Version",
          description: "Project override",
          category: "patterns",
          priority: 90,
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.name).toBe("Project Version");
      expect(skills[0]?.priority).toBe(90);
      expect(skills[0]?.isProjectSkill).toBe(true);
    });

    it("should filter by phase - planning only", () => {
      writeFileSync(
        join(globalDir, "planning-skill.md"),
        skill({
          name: "Planning Skill",
          description: "Planning only",
          category: "best-practices",
          applies_to: "planning",
        })
      );

      writeFileSync(
        join(globalDir, "implementation-skill.md"),
        skill({
          name: "Implementation Skill",
          description: "Implementation only",
          category: "best-practices",
          applies_to: "implementation",
        })
      );

      const skills = loadSkills("planning", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("planning-skill");
    });

    it("should filter by phase - implementation only", () => {
      writeFileSync(
        join(globalDir, "planning-skill.md"),
        skill({
          name: "Planning Skill",
          description: "Planning only",
          category: "best-practices",
          applies_to: "planning",
        })
      );

      writeFileSync(
        join(globalDir, "implementation-skill.md"),
        skill({
          name: "Implementation Skill",
          description: "Implementation only",
          category: "best-practices",
          applies_to: "implementation",
        })
      );

      const skills = loadSkills("implementation", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("implementation-skill");
    });

    it("should include skills with applies_to=both in all phases", () => {
      writeFileSync(
        join(globalDir, "both-skill.md"),
        skill({
          name: "Both Skill",
          description: "Both phases",
          category: "best-practices",
          applies_to: "both",
        })
      );

      const planningSkills = loadSkills("planning", projectDir, defaultConfig);
      const implementationSkills = loadSkills("implementation", projectDir, defaultConfig);

      expect(planningSkills).toHaveLength(1);
      expect(implementationSkills).toHaveLength(1);
    });

    it("should sort by priority descending", () => {
      writeFileSync(
        join(globalDir, "low-priority.md"),
        skill({
          name: "Low Priority",
          description: "Low",
          category: "best-practices",
          priority: 30,
        })
      );

      writeFileSync(
        join(globalDir, "high-priority.md"),
        skill({
          name: "High Priority",
          description: "High",
          category: "best-practices",
          priority: 90,
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills[0]?.id).toBe("high-priority");
      expect(skills[1]?.id).toBe("low-priority");
    });

    it("should limit to maxSkillsPerPrompt", () => {
      for (let i = 1; i <= 15; i++) {
        writeFileSync(
          join(globalDir, `skill-${i}.md`),
          skill({
            name: `Skill ${i}`,
            description: `Skill ${i}`,
            category: "best-practices",
            priority: i,
          })
        );
      }

      const config: SkillsConfig = { ...defaultConfig, maxSkillsPerPrompt: 5 };
      const skills = loadSkills("both", projectDir, config);
      expect(skills).toHaveLength(5);
      // Should get highest priority ones
      expect(skills[0]?.priority).toBeGreaterThan(skills[4]?.priority ?? 0);
    });

    it("should skip disabled skills", () => {
      writeFileSync(
        join(globalDir, "disabled-skill.md"),
        skill({
          name: "Disabled Skill",
          description: "Should not load",
          category: "best-practices",
          enabled: "false",
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(0);
    });

    it("should skip non-markdown files", () => {
      writeFileSync(join(globalDir, "readme.txt"), "Not a skill");
      writeFileSync(join(globalDir, "config.json"), "{}");

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(0);
    });

    it("should load skills from subdirectories (one level)", () => {
      const learnedDir = join(globalDir, "learned");
      mkdirSync(learnedDir, { recursive: true });

      writeFileSync(
        join(learnedDir, "learned-skill.md"),
        skill({
          name: "Learned Skill",
          description: "A learned skill",
          category: "learned",
          priority: 30,
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("learned-skill");
      expect(skills[0]?.category).toBe("learned");
    });

    it("should merge top-level and subdirectory skills", () => {
      writeFileSync(
        join(globalDir, "top-level.md"),
        skill({
          name: "Top Level",
          description: "Top level skill",
          category: "best-practices",
          priority: 80,
        })
      );

      const learnedDir = join(globalDir, "learned");
      mkdirSync(learnedDir, { recursive: true });

      writeFileSync(
        join(learnedDir, "sub-skill.md"),
        skill({
          name: "Sub Skill",
          description: "Subdirectory skill",
          category: "learned",
          priority: 30,
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(2);
      // Higher priority first
      expect(skills[0]?.id).toBe("top-level");
      expect(skills[1]?.id).toBe("sub-skill");
    });

    it("should load project skills from subdirectories", () => {
      const learnedDir = join(projectSkillsDir, "learned");
      mkdirSync(learnedDir, { recursive: true });

      writeFileSync(
        join(learnedDir, "project-learned.md"),
        skill({
          name: "Project Learned",
          description: "A project learned skill",
          category: "learned",
        })
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("project-learned");
      expect(skills[0]?.isProjectSkill).toBe(true);
    });
  });

  describe("listAllSkills", () => {
    it("should return separate global and project lists", () => {
      writeFileSync(
        join(globalDir, "global-skill.md"),
        skill({ name: "Global", description: "Global", category: "best-practices" })
      );

      writeFileSync(
        join(projectSkillsDir, "project-skill.md"),
        skill({ name: "Project", description: "Project", category: "patterns" })
      );

      const result = listAllSkills(projectDir, defaultConfig);
      expect(result.global).toHaveLength(1);
      expect(result.project).toHaveLength(1);
      expect(result.global[0]?.id).toBe("global-skill");
      expect(result.project[0]?.id).toBe("project-skill");
    });
  });
});
