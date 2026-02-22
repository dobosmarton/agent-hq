import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, writeFileSync, rmSync } from "node:fs";
import { join } from "node:path";
import { loadSkills, clearSkillCache, listAllSkills } from "../loader";
import type { SkillsConfig } from "../types";

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
        `<!-- skill:name = Test Skill -->
<!-- skill:description = A test skill -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 80 -->

# Test Skill
Content here`,
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
        `<!-- skill:name = Project Skill -->
<!-- skill:description = A project-specific skill -->
<!-- skill:category = patterns -->

# Project Skill
Content here`,
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("project-skill");
      expect(skills[0]?.isProjectSkill).toBe(true);
    });

    it("should merge global and project skills", () => {
      writeFileSync(
        join(globalDir, "global-skill.md"),
        `<!-- skill:name = Global Skill -->
<!-- skill:description = Global -->
<!-- skill:category = best-practices -->

# Global`,
      );

      writeFileSync(
        join(projectSkillsDir, "project-skill.md"),
        `<!-- skill:name = Project Skill -->
<!-- skill:description = Project -->
<!-- skill:category = patterns -->

# Project`,
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills).toHaveLength(2);
    });

    it("should override global skill with project skill of same ID", () => {
      writeFileSync(
        join(globalDir, "override-test.md"),
        `<!-- skill:name = Global Version -->
<!-- skill:description = Global -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 50 -->

# Global Content`,
      );

      writeFileSync(
        join(projectSkillsDir, "override-test.md"),
        `<!-- skill:name = Project Version -->
<!-- skill:description = Project override -->
<!-- skill:category = patterns -->
<!-- skill:priority = 90 -->

# Project Content`,
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
        `<!-- skill:name = Planning Skill -->
<!-- skill:description = Planning only -->
<!-- skill:category = best-practices -->
<!-- skill:appliesTo = planning -->

# Planning`,
      );

      writeFileSync(
        join(globalDir, "implementation-skill.md"),
        `<!-- skill:name = Implementation Skill -->
<!-- skill:description = Implementation only -->
<!-- skill:category = best-practices -->
<!-- skill:appliesTo = implementation -->

# Implementation`,
      );

      const skills = loadSkills("planning", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("planning-skill");
    });

    it("should filter by phase - implementation only", () => {
      writeFileSync(
        join(globalDir, "planning-skill.md"),
        `<!-- skill:name = Planning Skill -->
<!-- skill:description = Planning only -->
<!-- skill:category = best-practices -->
<!-- skill:appliesTo = planning -->

# Planning`,
      );

      writeFileSync(
        join(globalDir, "implementation-skill.md"),
        `<!-- skill:name = Implementation Skill -->
<!-- skill:description = Implementation only -->
<!-- skill:category = best-practices -->
<!-- skill:appliesTo = implementation -->

# Implementation`,
      );

      const skills = loadSkills("implementation", projectDir, defaultConfig);
      expect(skills).toHaveLength(1);
      expect(skills[0]?.id).toBe("implementation-skill");
    });

    it("should include skills with appliesTo=both in all phases", () => {
      writeFileSync(
        join(globalDir, "both-skill.md"),
        `<!-- skill:name = Both Skill -->
<!-- skill:description = Both phases -->
<!-- skill:category = best-practices -->
<!-- skill:appliesTo = both -->

# Both`,
      );

      const planningSkills = loadSkills("planning", projectDir, defaultConfig);
      const implementationSkills = loadSkills(
        "implementation",
        projectDir,
        defaultConfig,
      );

      expect(planningSkills).toHaveLength(1);
      expect(implementationSkills).toHaveLength(1);
    });

    it("should sort by priority descending", () => {
      writeFileSync(
        join(globalDir, "low-priority.md"),
        `<!-- skill:name = Low Priority -->
<!-- skill:description = Low -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 30 -->

# Low`,
      );

      writeFileSync(
        join(globalDir, "high-priority.md"),
        `<!-- skill:name = High Priority -->
<!-- skill:description = High -->
<!-- skill:category = best-practices -->
<!-- skill:priority = 90 -->

# High`,
      );

      const skills = loadSkills("both", projectDir, defaultConfig);
      expect(skills[0]?.id).toBe("high-priority");
      expect(skills[1]?.id).toBe("low-priority");
    });

    it("should limit to maxSkillsPerPrompt", () => {
      for (let i = 1; i <= 15; i++) {
        writeFileSync(
          join(globalDir, `skill-${i}.md`),
          `<!-- skill:name = Skill ${i} -->
<!-- skill:description = Skill ${i} -->
<!-- skill:category = best-practices -->
<!-- skill:priority = ${i} -->

# Skill ${i}`,
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
        `<!-- skill:name = Disabled Skill -->
<!-- skill:description = Should not load -->
<!-- skill:category = best-practices -->
<!-- skill:enabled = false -->

# Disabled`,
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
  });

  describe("listAllSkills", () => {
    it("should return separate global and project lists", () => {
      writeFileSync(
        join(globalDir, "global-skill.md"),
        `<!-- skill:name = Global -->
<!-- skill:description = Global -->
<!-- skill:category = best-practices -->

# Global`,
      );

      writeFileSync(
        join(projectSkillsDir, "project-skill.md"),
        `<!-- skill:name = Project -->
<!-- skill:description = Project -->
<!-- skill:category = patterns -->

# Project`,
      );

      const result = listAllSkills(projectDir, defaultConfig);
      expect(result.global).toHaveLength(1);
      expect(result.project).toHaveLength(1);
      expect(result.global[0]?.id).toBe("global-skill");
      expect(result.project[0]?.id).toBe("project-skill");
    });
  });
});
