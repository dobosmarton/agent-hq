import type { PlaneComment } from "../plane/types";
import type { AgentTask } from "../types";
import type { CiContext } from "./ci-discovery";
import { PLAN_MARKER } from "./phase";

const taskDisplayId = (task: AgentTask): string =>
  `${task.projectIdentifier}-${task.sequenceId}`;

export const buildPlanningPrompt = (
  task: AgentTask,
  skillsSection?: string,
): string => {
  const taskId = taskDisplayId(task);

  const skillsContent = skillsSection ? `\n${skillsSection}\n` : "";

  return `You are an autonomous software engineer reviewing task ${taskId}: "${task.title}".

## Task Description
${task.descriptionHtml || "No description provided."}
${skillsContent}
## Your Goal
Create a detailed implementation plan for this task. Do NOT make any code changes.

## Instructions
1. Explore the codebase thoroughly — read relevant files, understand patterns and architecture
2. Design an implementation approach:
   - Which files need to be created or modified
   - What the changes should look like at a high level
   - Any risks, edge cases, or trade-offs
3. List any questions or ambiguities that need human input
4. Post your plan as a single comment using the add_task_comment tool with this exact format:

\`\`\`html
${PLAN_MARKER}
<h2>Implementation Plan</h2>
<h3>Approach</h3>
<p>High-level description of the approach...</p>
<h3>Files to Change</h3>
<ul>
  <li><code>path/to/file.ts</code> — what changes</li>
</ul>
<h3>Risks & Considerations</h3>
<ul>
  <li>Risk or consideration...</li>
</ul>
<h3>Questions for Review</h3>
<ul>
  <li>Question that needs human input...</li>
</ul>
\`\`\`

5. After posting the plan comment, move the task to "plan_review" using update_task_status

## Important
- Do NOT modify any files — this is a read-only exploration phase
- Be thorough in your codebase exploration before writing the plan
- The plan should be detailed enough for another agent to implement it
- Include the ${PLAN_MARKER} marker at the start of your comment (this is how the system detects the plan)
`;
};

const buildCiValidationSection = (ciContext: CiContext): string => {
  if (ciContext.overrideCommands && ciContext.overrideCommands.length > 0) {
    const commands = ciContext.overrideCommands
      .map((cmd, i) => `   ${String.fromCharCode(97 + i)}. \`${cmd}\``)
      .join("\n");
    return `## CI Validation
Run these exact validation commands before every commit and before creating the PR:
${commands}
   ${String.fromCharCode(97 + ciContext.overrideCommands.length)}. Only commit once all checks pass

If a formatting/linting check fails, try to auto-fix it (e.g. with \`--fix\` or \`--write\` flags), then re-stage the fixed files.
Do NOT commit or create a PR if any check fails — fix the issues first.`;
  }

  const entries = Object.entries(ciContext.workflowFiles);
  if (entries.length > 0) {
    const files = entries
      .map(([path, content]) => `### ${path}\n\`\`\`yaml\n${content}\`\`\``)
      .join("\n\n");
    return `## CI Validation
Study the CI workflow files below carefully. Identify every quality check step that runs on PRs
(these may include formatting, linting, type checking, testing, building, or other checks —
different projects have different steps). Run exactly those commands before every commit and
before creating the PR. Do NOT run checks that are not in the CI — if the CI has no type check
step, do not run one. If the CI has no formatting step, do not run one. The CI files are the
single source of truth for what must pass.

${files}

Important: Use the exact commands from the CI files (including the correct package manager —
npm, pnpm, yarn, bun, pip, cargo, go, make, etc.). Do NOT invent or assume commands not present in CI.
If a formatting/linting check fails, try to auto-fix it (e.g. with \`--fix\` or \`--write\` flags), then re-stage the fixed files.
Do NOT commit or create a PR if any check fails — fix the issues first.`;
  }

  return `## CI Validation
No CI workflow files were found for this project. Before committing, look for the project's
build/task configuration (e.g. package.json scripts, Makefile, pyproject.toml, Cargo.toml,
Justfile, or similar) and identify any available quality check commands (lint, format, typecheck,
test, build). Run the ones that exist — do not fail on checks the project doesn't have.
Do NOT commit or create a PR if any check fails — fix the issues first.`;
};

export const buildImplementationPrompt = (
  task: AgentTask,
  branchName: string,
  comments: PlaneComment[],
  ciContext: CiContext,
  skillsSection?: string,
): string => {
  const taskId = taskDisplayId(task);

  const commentsSection = comments
    .map(
      (c) =>
        `<div class="comment" data-date="${c.created_at}">${c.comment_html}</div>`,
    )
    .join("\n");

  const ciSection = buildCiValidationSection(ciContext);
  const skillsContent = skillsSection ? `\n${skillsSection}\n` : "";

  // Restructure prompt for caching: static content first (task, plan, CI), dynamic content last
  // Anthropic caches up to the last cache_control marker, which the SDK places automatically
  return `You are an autonomous software engineer implementing task ${taskId}: "${task.title}".

## Task Description
${task.descriptionHtml || "No description provided."}

## Previous Comments (Plan & Feedback)
The following comments contain the implementation plan and any human feedback:
${commentsSection || "<p>No previous comments.</p>"}
${skillsContent}
${ciSection}

## Instructions
1. Read the plan and human feedback from the comments above carefully
2. Implement the changes described in the plan
3. Write or update tests if the project has a test framework set up
4. Before EVERY commit, run all quality checks from the CI Validation section above and fix any failures
5. Commit your changes with descriptive messages prefixed with "${taskId}:"
6. Push your branch after every significant milestone using: git push -u origin ${branchName}
7. Add progress comments to the task using the add_task_comment tool at key milestones
8. Before creating the PR, run a final verification of ALL CI checks. Do NOT create the PR if any check fails — fix the issues first.
9. Update documentation: review and update any relevant documentation (README.md, CLAUDE.md, inline docs) to reflect the changes you made. Keep docs accurate and in sync with the code.
10. After all checks pass, create a Pull Request:
    gh pr create --title "${taskId}: <concise summary>" --body "<description including decisions made and any open questions>"
11. Add the PR URL as a link on the task using the add_task_link tool with the title "Pull Request" and the PR URL
12. Use update_task_status with state "in_review" to mark the task as complete

## Git Workflow
- You are on branch \`${branchName}\`
- Commit frequently with small, logical commits
- Always push after completing a meaningful unit of work
- Commit messages should start with "${taskId}:"
- NEVER commit code that fails CI validation checks

## Important
- Do not modify files unrelated to the task
- Follow the approved plan — do not deviate significantly without documenting why
- Do NOT ask questions — if something is unclear, make your best judgment and document the decision in a task comment and in the PR description
- Document any open questions or deviations from the plan in the PR description
`;
};
