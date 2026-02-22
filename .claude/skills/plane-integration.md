<!-- skill:name = Plane API Integration Patterns -->
<!-- skill:description = Best practices for integrating with Plane's API in this project -->
<!-- skill:category = api-usage -->
<!-- skill:priority = 70 -->
<!-- skill:appliesTo = both -->

# Plane API Integration Patterns

## API Client Usage

This project uses a centralized Plane API client in `src/plane/client.ts`.

- **Always use the client functions** instead of making raw HTTP requests
  ```typescript
  import { listComments, updateTaskState } from "../plane/client";

  const comments = await listComments(planeConfig, projectId, issueId);
  ```

- **Pass PlaneConfig** to all client functions
  ```typescript
  type PlaneConfig = {
    apiKey: string;
    baseUrl: string;
    workspaceSlug: string;
  };
  ```

## Task State Management

- **Use MCP tools** for updating task state in agent code
  ```typescript
  // In agent context, use MCP tools
  await mcp__agent_plane_tools__update_task_status({ state: "in_review" });
  ```

- **Follow state transitions**: `plan_review` → implementation → `in_review` → `done`

## Task Comments

- **Format comments as HTML** when using the Plane API
  ```typescript
  const commentHtml = `<p><strong>Progress update</strong></p>
  <ul>
    <li>Completed feature X</li>
    <li>Testing in progress</li>
  </ul>`;

  await addTaskComment(planeConfig, projectId, issueId, commentHtml);
  ```

- **Use semantic HTML tags**: `<p>`, `<ul>`, `<li>`, `<code>`, `<strong>`, `<h2>`, `<h3>`

- **Include special markers** when needed
  ```typescript
  const planComment = `${PLAN_MARKER}<h2>Implementation Plan</h2>...`;
  ```

## Error Handling

- **Handle API errors gracefully**
  ```typescript
  try {
    await updateTaskState(planeConfig, projectId, issueId, "in_review");
  } catch (err) {
    console.error(`Failed to update task state: ${err}`);
    // Continue or retry as appropriate
  }
  ```

- **Log API failures** with context (project, task ID)

## Task Polling

- **Use the task poller** for detecting new tasks
  ```typescript
  const tasks = await taskPoller.pollOnce();
  ```

- **Release tasks** when done processing
  ```typescript
  taskPoller.releaseTask(issueId);
  ```

## Project Configuration

- **Map project identifiers** to configuration in `config.json`
  ```json
  {
    "projects": {
      "AGENTHQ": {
        "repoPath": "/repos/agent-hq",
        "repoUrl": "https://github.com/org/agent-hq",
        "defaultBranch": "main"
      }
    }
  }
  ```

- **Validate project config** before processing tasks
  ```typescript
  const projectConfig = config.projects[task.projectIdentifier];
  if (!projectConfig) {
    return { outcome: "rejected", reason: "no_project_config" };
  }
  ```
