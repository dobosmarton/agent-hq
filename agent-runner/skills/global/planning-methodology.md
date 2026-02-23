<!-- skill:name = Planning Methodology -->
<!-- skill:description = Feasibility assessment, plan structure, and quality standards for the planning phase -->
<!-- skill:category = architecture -->
<!-- skill:priority = 100 -->
<!-- skill:appliesTo = planning -->

# Planning Methodology

## Step 1: Feasibility Assessment

Before creating any plan, evaluate the task critically. Your job is NOT to blindly plan every task — it's to determine whether the task should be done at all.

### Questions to Answer

1. **Does this solve a real problem?** Explore the codebase and verify the problem is genuine. If the task targets a bottleneck that doesn't exist (e.g., caching something that takes milliseconds, optimizing code that runs once at startup), say so with evidence.

2. **Is the effort proportional to the benefit?** A task requiring hundreds of lines of new code for marginal improvement is not worth it. Prefer simple solutions over complex infrastructure. If the benefit is speculative ("might help in the future"), that's a red flag.

3. **Does this duplicate existing functionality?** Check if the codebase already handles this concern, even partially. Don't build what already exists. Look for existing caches, existing abstractions, existing utilities that already solve the problem.

4. **Is this the right time?** If the task depends on capabilities or infrastructure that don't exist yet, flag it as premature. Building features on top of foundations that aren't ready leads to dead code.

### If the Task Should Be Skipped

Post a comment using add_task_comment with this format:

```html
<!-- AGENT_PLAN -->
<h2>Recommendation: Skip This Task</h2>
<h3>Analysis</h3>
<p>What you investigated and what you found...</p>
<h3>Why This Should Be Skipped</h3>
<ul>
  <li>Concrete reason with evidence from the codebase...</li>
</ul>
<h3>Alternative (if applicable)</h3>
<p>What would actually solve the underlying need, if anything...</p>
```

Then move the task to "plan_review" for human confirmation and stop.

## Step 2: Plan Structure

If the task IS worth doing, create a plan with these sections:

```html
<!-- AGENT_PLAN -->
<h2>Implementation Plan</h2>
<h3>Approach</h3>
<p>High-level description. Prefer the simplest solution that works.</p>
<h3>Files to Change</h3>
<ul>
  <li><code>path/to/file.ts</code> — what changes and why</li>
</ul>
<h3>Effort Estimate</h3>
<p>Small (< 100 lines) | Medium (100-300 lines) | Large (300+ lines)</p>
<h3>Impact Assessment</h3>
<p>What measurably improves and by how much</p>
<h3>Questions for Review</h3>
<ul>
  <li>Anything that needs human input before implementation</li>
</ul>
```

## Quality Standards

- **Be specific about files**: List exact file paths, not vague descriptions
- **Avoid over-engineering**: Don't propose abstractions, config systems, or extension points unless the task explicitly requires them
- **Reuse existing code**: If the codebase has patterns, utilities, or conventions — follow them instead of inventing new ones
- **Keep scope tight**: Only plan what the task asks for. Don't add "nice to have" improvements
- **Consider the implementation agent**: The plan must be detailed enough for another agent to implement without needing to make architectural decisions
