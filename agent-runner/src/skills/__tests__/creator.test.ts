import { describe, it, expect, beforeEach, afterEach } from "vitest";
import {
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { join } from "node:path";
import {
  slugify,
  generateSkillMarkdown,
  createSkillFile,
  type CreateSkillInput,
  type CreateSkillTarget,
} from "../creator";

describe("skills creator", () => {
  const testDir = join(process.cwd(), "test-creator-temp");

  beforeEach(() => {
    rmSync(testDir, { recursive: true, force: true });
    mkdirSync(testDir, { recursive: true });
  });

  afterEach(() => {
    rmSync(testDir, { recursive: true, force: true });
  });

  describe("slugify", () => {
    it("should convert name to lowercase slug", () => {
      expect(slugify("My Great Skill")).toBe("my-great-skill");
    });

    it("should replace special characters with hyphens", () => {
      expect(slugify("Hello, World! (v2)")).toBe("hello-world-v2");
    });

    it("should strip leading and trailing hyphens", () => {
      expect(slugify("---test---")).toBe("test");
    });

    it("should truncate to 60 characters", () => {
      const longName = "a".repeat(100);
      expect(slugify(longName).length).toBe(60);
    });

    it("should return empty string for non-alphanumeric input", () => {
      expect(slugify("!!!")).toBe("");
    });
  });

  describe("generateSkillMarkdown", () => {
    it("should produce correct metadata headers", () => {
      const input: CreateSkillInput = {
        name: "Test Skill",
        description: "A test skill description",
        content: "# Content\nSome content here",
        category: "learned",
        priority: 30,
        appliesTo: "both",
      };

      const md = generateSkillMarkdown(input);
      expect(md).toContain("<!-- skill:name = Test Skill -->");
      expect(md).toContain(
        "<!-- skill:description = A test skill description -->",
      );
      expect(md).toContain("<!-- skill:category = learned -->");
      expect(md).toContain("<!-- skill:priority = 30 -->");
      expect(md).toContain("<!-- skill:appliesTo = both -->");
      expect(md).toContain("# Content\nSome content here");
    });

    it("should have an empty line between metadata and content", () => {
      const input: CreateSkillInput = {
        name: "Test",
        description: "Test description",
        content: "Content",
        category: "learned",
        priority: 50,
        appliesTo: "planning",
      };

      const md = generateSkillMarkdown(input);
      const lines = md.split("\n");
      // The line before content should be empty
      const contentIndex = lines.indexOf("Content");
      expect(lines[contentIndex - 1]).toBe("");
    });
  });

  describe("createSkillFile", () => {
    const input: CreateSkillInput = {
      name: "Test Pattern",
      description: "A learned pattern",
      content: "# Test Pattern\nAlways use X when doing Y.",
      category: "learned",
      priority: 30,
      appliesTo: "both",
    };

    const target: CreateSkillTarget = {
      baseDir: testDir,
      subdirectory: "learned",
    };

    it("should create directory and file", () => {
      const { filePath, slug } = createSkillFile(input, target);

      expect(slug).toBe("test-pattern");
      expect(existsSync(filePath)).toBe(true);

      const content = readFileSync(filePath, "utf-8");
      expect(content).toContain("<!-- skill:name = Test Pattern -->");
      expect(content).toContain("# Test Pattern");
    });

    it("should create the learned subdirectory", () => {
      createSkillFile(input, target);
      expect(existsSync(join(testDir, "learned"))).toBe(true);
    });

    it("should deduplicate with timestamp on conflict", () => {
      const result1 = createSkillFile(input, target);
      const result2 = createSkillFile(input, target);

      expect(result1.filePath).not.toBe(result2.filePath);
      expect(existsSync(result1.filePath)).toBe(true);
      expect(existsSync(result2.filePath)).toBe(true);
    });

    it("should throw for empty/invalid names", () => {
      const badInput = { ...input, name: "!!!" };
      expect(() => createSkillFile(badInput, target)).toThrow(
        "Could not generate a valid filename",
      );
    });
  });
});
