import type { AgentTask } from "../types.js";

export const buildAgentPrompt = (
  task: AgentTask,
  branchName: string,
): string => {
  const taskId = `${task.projectIdentifier}-${task.sequenceId}`;

  return `You are an autonomous software engineer working on task ${taskId}: "${task.title}".

## Task Description
${task.descriptionHtml || "No description provided."}

## Instructions
1. Read the codebase to understand the relevant code before making changes
2. Implement the changes described in the task
3. Write or update tests if the project has a test framework set up
4. Commit your changes frequently with descriptive messages prefixed with "${taskId}:"
5. Push your branch after every significant milestone using: git push -u origin ${branchName}
6. Add progress comments to the task using the add_task_comment tool at key milestones
7. When you are done, use update_task_status with state "in_review" to mark the task as complete
8. If you need clarification from the human operator, use the ask_human tool

## Git Workflow
- You are on branch \`${branchName}\`
- Commit frequently with small, logical commits
- Always push after completing a meaningful unit of work
- Commit messages should start with "${taskId}:"

## Important
- Do not modify files unrelated to the task
- Focus on completing the task as described
- If the task is ambiguous, use ask_human to clarify before proceeding
- If you encounter blockers, document them in a comment and ask for help
`;
};
