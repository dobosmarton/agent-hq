#!/usr/bin/env node
import { resolve } from "node:path";
import { loadConfig } from "../config";
import { listAllSkills } from "./loader";
import { formatSkillsList, formatSkillDetail } from "./formatter";
import type { Skill } from "./types";

/**
 * CLI for managing skills
 */

const printUsage = (): void => {
  console.log(`
Skills Management CLI

Usage:
  npm run skills:list [project-path]     List all available skills
  npm run skills:show <skill-id> [project-path]  Show detailed skill content
  npm run skills:validate [project-path] Validate all skill files

Arguments:
  project-path  Path to project repo (defaults to current directory)
  skill-id      ID of skill to display (e.g., "commit-messages")
`);
};

const listSkills = (projectPath: string): void => {
  const config = loadConfig();
  const { global, project } = listAllSkills(projectPath, config.agent.skills);

  console.log(formatSkillsList(global, project));
  console.log(
    `Total: ${global.length} global, ${project.length} project-level`,
  );
};

const showSkill = (skillId: string, projectPath: string): void => {
  const config = loadConfig();
  const { global, project } = listAllSkills(projectPath, config.agent.skills);

  const allSkills = [...global, ...project];
  const skill = allSkills.find((s) => s.id === skillId);

  if (!skill) {
    console.error(`Error: Skill with id "${skillId}" not found`);
    console.log("\nAvailable skills:");
    allSkills.forEach((s) => console.log(`  - ${s.id}`));
    process.exit(1);
  }

  console.log(formatSkillDetail(skill));
};

const validateSkills = (projectPath: string): void => {
  const config = loadConfig();
  const { global, project } = listAllSkills(projectPath, config.agent.skills);

  const allSkills = [...global, ...project];
  let errorCount = 0;

  console.log(`Validating ${allSkills.length} skill(s)...\n`);

  for (const skill of allSkills) {
    const errors: string[] = [];

    if (!skill.name || skill.name.trim().length === 0) {
      errors.push("Missing or empty name");
    }

    if (!skill.description || skill.description.trim().length === 0) {
      errors.push("Missing or empty description");
    }

    if (!skill.content || skill.content.trim().length === 0) {
      errors.push("Missing or empty content");
    }

    if (skill.priority < 0 || skill.priority > 100) {
      errors.push(`Invalid priority: ${skill.priority} (must be 0-100)`);
    }

    if (errors.length > 0) {
      errorCount++;
      console.log(`❌ ${skill.id} (${skill.filePath})`);
      errors.forEach((err) => console.log(`   - ${err}`));
    } else {
      console.log(`✅ ${skill.id}`);
    }
  }

  console.log(
    `\nValidation complete: ${allSkills.length - errorCount} passed, ${errorCount} failed`,
  );

  if (errorCount > 0) {
    process.exit(1);
  }
};

// Parse CLI arguments
const args = process.argv.slice(2);
const command = args[0];

if (!command || command === "--help" || command === "-h") {
  printUsage();
  process.exit(0);
}

// Default project path to current directory
const projectPath = args[1] ?? resolve(process.cwd());

try {
  switch (command) {
    case "list":
      listSkills(projectPath);
      break;

    case "show":
      if (!args[1]) {
        console.error("Error: skill-id is required");
        printUsage();
        process.exit(1);
      }
      showSkill(args[1], args[2] ?? resolve(process.cwd()));
      break;

    case "validate":
      validateSkills(projectPath);
      break;

    default:
      console.error(`Error: Unknown command "${command}"`);
      printUsage();
      process.exit(1);
  }
} catch (err) {
  console.error("Error:", err instanceof Error ? err.message : String(err));
  process.exit(1);
}
