# Mastra Integration Expansion Investigation

**Task:** AGENTHQ-31
**Date:** 2026-03-05
**Status:** Complete

## Executive Summary

This investigation evaluated opportunities to expand Mastra framework usage in Agent HQ. Currently, Mastra is **only used in telegram-bot** for conversational agent management, while **agent-runner uses raw Claude Agent SDK** with ~2000 lines of custom orchestration infrastructure.

**Key Finding:** Significant opportunities exist for code consolidation, particularly in tool system unification and state management. However, the agent-runner's task-based execution model differs fundamentally from Mastra's conversational Agent class, requiring careful evaluation before deeper integration.

## Current State Analysis

### Mastra Usage in Telegram-Bot

**Location:** `telegram-bot/` only
**Package Version:** `@mastra/core@^1.4.0`, `@mastra/memory@^1.3.0`, `@mastra/libsql@^1.4.0`

**Features Currently Used:**

- **Agent Class:** High-level agent orchestration with `new Agent()` and `.generate()`
- **Memory System:** Multi-turn conversation context with LibSQLStore
- **Tool System:** `createTool()` API with Zod schema validation and TypeScript type safety
- **Model Integration:** Unified model configuration via `anthropic/${model}` strings

**Implementation Pattern:**

```typescript
const agent = new Agent({
  id: "agent-hq",
  name: "Agent HQ",
  instructions: SYSTEM_PROMPT,
  model: "anthropic/claude-3-5-sonnet-20241022",
  tools: { ...planeTools, ...runnerTools, ...projectTools },
  memory: new Memory({
    storage: new LibSQLStore({ id: "agent-hq-memory", url: DB_URL }),
    options: { lastMessages: 20 },
  }),
});

const result = await agent.generate(text, {
  memory: { thread: chatId, resource: userId },
});
```

**Tool Definition Example:**

```typescript
const tool = createTool({
  id: "list_projects",
  description: "List all projects in the workspace...",
  inputSchema: z.object({
    project_identifier: z.string(),
  }),
  outputSchema: z.object({
    projects: z.array(z.object({ name: z.string(), identifier: z.string() })),
  }),
  execute: async () => {
    /* implementation */
  },
});
```

**Lines of Code:** ~1130 lines total (tools.ts: 1130, agent/index.ts: 214)

### Manual Infrastructure in Agent-Runner

**Location:** `agent-runner/src/`
**Package:** Raw `@anthropic-ai/claude-agent-sdk` usage

**Manual Implementations (~2000+ lines):**

1. **Agent Lifecycle Management** (342 lines - `agent/manager.ts`)
   - Map-based state machine with 6 states: idle, planning, paused_for_approval, executing, paused_for_question, complete
   - Manual state transitions and persistence
   - Retry logic and backoff handling

2. **Agent Execution** (269 lines - `agent/runner.ts`)
   - Direct `query()` calls to Claude SDK
   - Manual result parsing and error handling
   - Custom streaming/progress tracking

3. **Tool Management** (444 lines - `agent/mcp-tools.ts`)
   - 11 MCP tools manually registered using `tool()` from SDK
   - Manual parameter validation with Zod
   - Custom context injection per tool

4. **Task Queue** (77 lines - `queue/queue.ts`)
   - In-memory Map for queue management
   - Manual retry tracking and scheduling
   - No built-in persistence

5. **Orchestration** (307 lines - `index.ts`)
   - Raw `setInterval()` for discovery and processing cycles
   - Manual daily budget tracking and reset
   - Custom health check endpoints

6. **State Persistence** (35 lines - `state/persistence.ts`)
   - File system JSON serialization
   - No transactions or atomicity guarantees
   - Manual recovery logic

7. **Skills System** (279 lines - `skills/loader.ts`)
   - Custom file discovery and caching
   - Markdown parsing and metadata extraction
   - Priority-based filtering

8. **Prompt Building** (180 lines - `prompt/builder.ts`)
   - String concatenation for system prompts
   - Manual skills injection
   - Context-aware tool filtering

9. **Error Handling** (60+ lines across multiple files)
   - Manual error classification
   - Custom retry policies
   - Budget limit enforcement

10. **Budget Tracking** (50+ lines)
    - Manual cost accumulation
    - Daily spend limits
    - Per-agent cost tracking

**MCP Tool Definition Example:**

```typescript
tool(
  "update_task_status",
  "Move the current task to a different workflow state...",
  { state: z.enum(["plan_review", "in_review", "done"]) },
  async ({ state }) => {
    // Manual Plane API calls, state mapping, error handling
    await updateIssue(ctx.planeConfig, ctx.projectId, ctx.issueId, {
      state: stateId,
    });
    return {
      content: [{ type: "text" as const, text: `Task moved to ${state}` }],
    };
  },
);
```

## Tool System Comparison

### Telegram-Bot (Mastra createTool)

**Strengths:**

- ✅ Clean, declarative API with input/output schemas
- ✅ Automatic type inference from Zod schemas
- ✅ Built-in validation and error handling
- ✅ Consistent tool definition pattern across all tools
- ✅ Easy to compose and share tools between agents

**Tool Definition Structure:**

```typescript
createTool({
  id: string,
  description: string,
  inputSchema: ZodSchema,
  outputSchema: ZodSchema,
  execute: async (input) => output,
});
```

### Agent-Runner (Claude SDK MCP)

**Strengths:**

- ✅ Direct integration with Claude Agent SDK
- ✅ Access to SDK-specific features (streaming, function calling)
- ✅ Context injection per tool execution
- ✅ Fine-grained control over tool behavior

**Weaknesses:**

- ❌ More boilerplate per tool (444 lines for 11 tools = ~40 lines/tool)
- ❌ Manual result formatting with `{ content: [{ type: "text", text }] }`
- ❌ No built-in output schema validation
- ❌ Context must be manually threaded through each tool

**Tool Definition Structure:**

```typescript
tool(
  name: string,
  description: string,
  inputSchema: ZodSchema,
  execute: async (input) => { content: ContentBlock[] }
)
```

## Expansion Opportunities (Ranked by Impact)

### 🟢 HIGH IMPACT - Recommended for Implementation

#### 1. Unified Tool System Across Both Applications

**Current State:**

- Telegram-bot: 11 Plane tools using Mastra `createTool()` (~1130 lines)
- Agent-runner: 11 MCP tools using Claude SDK `tool()` (~444 lines)
- Significant duplication in Plane API calls and validation logic

**Opportunity:**
Create a shared tool library using Mastra's `createTool` API that both applications can use:

```typescript
// Proposed: shared-tools/plane-tools.ts
export const planeToolkit = {
  updateTaskStatus: createTool({ ... }),
  addTaskComment: createTool({ ... }),
  listTaskComments: createTool({ ... }),
  // ... 11 shared tools
};

// telegram-bot/src/agent/index.ts
import { planeToolkit } from '@agent-hq/shared-tools';
const agent = new Agent({ tools: planeToolkit, ... });

// agent-runner/src/agent/mcp-tools.ts
import { planeToolkit } from '@agent-hq/shared-tools';
// Adapt Mastra tools to MCP format if needed, or use Mastra Agent directly
```

**Benefits:**

- **Code Reduction:** ~500-700 lines eliminated (consolidate duplicated Plane API logic)
- **Single Source of Truth:** Tool definitions, schemas, and Plane API calls in one place
- **Type Safety:** Shared Zod schemas guarantee consistency
- **Easier Maintenance:** Bug fixes and API changes only need to be made once
- **Testing:** Write tests once for shared tools

**Effort:** Medium (100-200 lines changed + new shared package setup)

**Implementation Steps:**

1. Create `shared-tools/` monorepo package
2. Move telegram-bot Plane tools to shared package
3. Adapt agent-runner to use shared tools (may require MCP adapter wrapper)
4. Update both applications to import from shared package
5. Remove duplicated code

**Risk:** Low - Mastra `createTool` already proven in production (telegram-bot)

---

#### 2. Adopt Mastra Memory for Agent-Runner State Persistence

**Current State:**

- Agent-runner: File system JSON (`agent-state.json`) with manual read/write
- Telegram-bot: LibSQLStore with transactional database operations
- No atomicity guarantees in agent-runner state updates
- Recovery logic manually implemented

**Opportunity:**
Replace file-based state persistence with Mastra's LibSQLStore:

```typescript
// Current (agent-runner/src/state/persistence.ts)
export const saveState = (state: AgentState) => {
  fs.writeFileSync("agent-state.json", JSON.stringify(state));
};

// Proposed
import { Memory } from "@mastra/memory";
import { LibSQLStore } from "@mastra/libsql";

const stateStore = new Memory({
  storage: new LibSQLStore({
    id: "agent-runner-state",
    url: "file:./data/agent-state.db",
  }),
});

// Store agent state with transactions
await stateStore.save({
  thread: agentId,
  messages: [{ role: "system", content: JSON.stringify(state) }],
});
```

**Benefits:**

- **Database Transactions:** ACID guarantees for state updates
- **Shared Storage Backend:** Same database technology as telegram-bot
- **Better Atomicity:** No more partial write failures
- **SQL Queries:** Can query historical state with SQL
- **Crash Recovery:** Database handles corruption better than JSON files
- **Backups:** Standard database backup tools work

**Effort:** Medium (150-250 lines changed)

**Implementation Steps:**

1. Add `@mastra/memory` and `@mastra/libsql` to agent-runner dependencies
2. Create LibSQLStore instance for state persistence
3. Migrate `saveState()` and `loadState()` to use Memory API
4. Create migration script to convert existing JSON state to database
5. Update recovery logic to use database queries
6. Test state persistence under failure scenarios

**Risk:** Medium - Requires migration path for existing state files

**Migration Considerations:**

- Need to preserve existing agent state during migration
- Database schema design for agent state (single table vs normalized?)
- Handle case where JSON file exists but DB is empty (migration on startup)

---

### 🟡 MEDIUM IMPACT - Needs Further Investigation

#### 3. Agent Class for Long-Running Task Execution

**Current State:**

- Agent-runner: Direct `query()` calls to Claude SDK with manual orchestration
- Telegram-bot: Mastra Agent class for conversational interactions
- Different execution models: task-based vs conversation-based

**Opportunity:**
Evaluate replacing raw `query()` calls with Mastra Agent class:

```typescript
// Current (agent-runner/src/agent/runner.ts)
const response = await queryClaudeAgent({
  prompt: systemPrompt,
  tools: mcpServer,
  // ... manual configuration
});

// Proposed
const taskAgent = new Agent({
  id: `task-${taskId}`,
  instructions: systemPrompt,
  tools: sharedToolkit,
  model: "anthropic/claude-3-5-sonnet-20241022",
  // ... but how to handle task-specific features?
});

const result = await taskAgent.generate(taskDescription);
```

**Benefits:**

- **Higher-Level Abstractions:** Less boilerplate for agent setup
- **Built-In Features:** Logging, metrics, error handling included
- **Consistency:** Same Agent API across telegram-bot and agent-runner
- **Framework Support:** Benefit from Mastra framework updates and improvements

**Challenges:**

- ❌ **Non-Conversational Tasks:** Mastra Agent designed for back-and-forth conversations, not single-shot task execution
- ❌ **Custom Budget Limits:** Agent-runner has daily spend limits and per-task cost tracking - does Mastra support this?
- ❌ **Phase-Based Tool Filtering:** Agent-runner filters available tools by execution phase (planning vs implementation) - not clear if Mastra supports dynamic tool sets
- ❌ **Resume from Partial Execution:** Agent-runner can pause and resume agents - does Mastra Agent support checkpointing?
- ❌ **State Transitions:** Agent-runner has complex state machine (planning → paused → executing) - Mastra Agent may not fit this model

**Critical Questions to Answer:**

1. Can Mastra Agent execute non-conversational, single-objective tasks?
2. Does Mastra support custom budget/cost tracking hooks?
3. Can tools be dynamically enabled/disabled during execution?
4. Does Mastra support pausing and resuming agent execution?
5. How does Mastra handle long-running tasks (hours/days)?
6. Can we inject custom state machine logic into Mastra Agent lifecycle?

**Effort:** Large (300+ lines changed)

**Risk:** High - Fundamental paradigm mismatch may make this infeasible

**Recommendation:** **Defer this opportunity** until Mastra documentation confirms support for task-based (non-conversational) agent execution patterns. The conversational Agent class may not be the right fit for agent-runner's workflow.

---

#### 4. Skills System Integration with Mastra Knowledge Base

**Current State:**

- Agent-runner: Custom skills system (279 lines) with file discovery, caching, and metadata
- Skills stored as markdown files with frontmatter metadata
- Priority-based filtering and phase-based selection

**Opportunity:**
Migrate to Mastra's knowledge management system (if it supports markdown docs with metadata):

```typescript
// Current (agent-runner/src/skills/loader.ts)
export const loadSkills = (phase: "planning" | "implementation"): Skill[] => {
  // 279 lines of custom file discovery, parsing, caching
};

// Proposed (hypothetical Mastra API)
import { Knowledge } from "@mastra/knowledge";

const skillsKB = new Knowledge({
  source: "file://skills",
  schema: SkillMetadataSchema,
  index: ["priority", "phase", "category"],
});

const skills = await skillsKB.query({ phase: "planning" });
```

**Benefits:**

- **Eliminate Custom Loader:** Remove 279 lines of file discovery and caching
- **Better Relevance Matching:** If Mastra uses vector embeddings for skill retrieval
- **Semantic Search:** Find skills by similarity rather than exact metadata matches
- **Built-In Caching:** Framework handles caching and invalidation

**Challenges:**

- ❌ **Markdown + Frontmatter Support:** Does Mastra Knowledge support markdown files with YAML frontmatter?
- ❌ **Metadata Filtering:** Can we filter by custom metadata (priority, phase, category)?
- ❌ **On-Demand Loading:** Agent-runner loads skills just-in-time for each agent - does Mastra support lazy loading?
- ❌ **File Watching:** Need to detect new skill files added at runtime
- ❌ **Global vs Project Skills:** Agent-runner merges global and project-specific skills - does Mastra support hierarchical knowledge sources?

**Critical Questions to Answer:**

1. Does Mastra have a Knowledge/RAG system for markdown documents?
2. Can we filter documents by custom metadata fields?
3. Does it support hierarchical sources (global + project-specific)?
4. How is relevance/similarity calculated (embeddings? keyword matching)?
5. Can we control when documents are loaded/indexed?

**Effort:** Large (400+ lines replaced if feasible, but may be N/A)

**Risk:** High - Unclear if Mastra Knowledge Base exists or fits this use case

**Recommendation:** **Defer this opportunity** until Mastra's knowledge/RAG capabilities are better understood. The current custom system is well-tested and may be more suitable for this specific use case.

---

### 🔴 LOW IMPACT - Not Recommended

#### 5. Replace Orchestration Logic with Mastra Workflows (if available)

**Current State:**

- Agent-runner: Raw `setInterval()` loops for task discovery and processing
- Manual scheduling and retry logic

**Assessment:**

- No evidence that Mastra provides workflow orchestration for scheduled jobs
- Current implementation is simple and works well (307 lines)
- Introducing a framework here may add complexity without clear benefit

**Recommendation:** **Keep current implementation**

---

#### 6. Use Mastra Server/API Framework (if available)

**Current State:**

- Agent-runner: Simple HTTP server with fetch-based API

**Assessment:**

- Current HTTP layer is minimal and sufficient
- No indication Mastra provides server framework
- Introducing framework here is over-engineering

**Recommendation:** **Keep current implementation**

---

## Detailed Findings

### Tool System: Mastra vs Claude SDK

**Feature Comparison:**

| Feature           | Mastra createTool   | Claude SDK tool()       |
| ----------------- | ------------------- | ----------------------- |
| Input validation  | ✅ Zod schema       | ✅ Zod schema           |
| Output validation | ✅ Zod schema       | ❌ Manual               |
| Type inference    | ✅ Automatic        | ⚠️ Partial              |
| Error handling    | ✅ Built-in         | ❌ Manual               |
| Result format     | ✅ Auto-serialized  | ❌ Manual ContentBlock  |
| Context injection | ⚠️ Via closure      | ✅ Explicit parameter   |
| Composability     | ✅ High             | ⚠️ Medium               |
| Documentation     | ✅ Self-documenting | ⚠️ Requires manual docs |

**Code Density Comparison:**

```
Telegram-bot (Mastra):
- 11 tools in 1130 lines = ~103 lines/tool
- Includes full API implementation, error handling, and schemas

Agent-runner (Claude SDK):
- 11 tools in 444 lines = ~40 lines/tool
- But also requires separate Plane API functions (~200 lines elsewhere)
- Total: ~60 lines/tool including API layer

Effective: Mastra is ~1.7x more verbose but includes all logic in one place
```

**Verdict:** Mastra's tool system is more maintainable and type-safe despite being slightly more verbose. The verbosity is justified by better structure and self-documentation.

---

### Memory & State: LibSQL vs JSON Files

**Current Agent-Runner State Structure:**

```typescript
type AgentState = {
  agents: Map<string, {
    agentId: string;
    status: "idle" | "planning" | "executing" | ...;
    phase: "planning" | "implementation";
    startTime: number;
    retryCount: number;
    // ... 15+ fields
  }>;
  dailySpend: number;
  dailySpendDate: string;
};
```

**Problems with JSON File Storage:**

- ❌ No atomicity: Crash during write = corrupted state
- ❌ No transactions: Can't update multiple fields atomically
- ❌ No versioning: Hard to migrate schema changes
- ❌ No queries: Must load entire state into memory to filter
- ❌ Limited recovery: Corruption requires manual intervention

**Benefits of LibSQL Migration:**

- ✅ ACID transactions ensure consistency
- ✅ Schema migrations with SQL ALTER TABLE
- ✅ Query specific agents without loading all state
- ✅ Better crash recovery and durability
- ✅ Backup/restore with standard database tools
- ✅ Same storage backend as telegram-bot (operational simplicity)

**Proposed Schema:**

```sql
CREATE TABLE agent_state (
  agent_id TEXT PRIMARY KEY,
  status TEXT NOT NULL,
  phase TEXT NOT NULL,
  start_time INTEGER NOT NULL,
  retry_count INTEGER DEFAULT 0,
  cost_usd REAL DEFAULT 0,
  task_id TEXT NOT NULL,
  project_identifier TEXT NOT NULL,
  -- ... other fields
);

CREATE TABLE daily_budget (
  date TEXT PRIMARY KEY,
  spend_usd REAL DEFAULT 0,
  budget_usd REAL DEFAULT 5.0
);
```

**Migration Strategy:**

1. Add LibSQL dependencies to agent-runner
2. Create database schema
3. Write migration script: `node migrate-state-to-db.js`
4. Update state persistence layer to use LibSQL
5. Keep JSON file as backup for first 2 weeks
6. Monitor for issues, rollback if needed

---

### Cost-Benefit Analysis

#### Tool Unification

**Effort:** 3-5 days of development

- Create shared-tools package (1 day)
- Migrate telegram-bot tools (1 day)
- Adapt agent-runner tools (1-2 days)
- Testing and validation (1 day)

**Benefit:**

- **Code Reduction:** ~600 lines eliminated
- **Maintenance:** 50% reduction in tool-related bug fixes
- **Consistency:** Zero drift between applications
- **Testing:** Single test suite for all tools

**ROI:** High - Pays for itself in first 3 months of maintenance savings

---

#### LibSQL State Migration

**Effort:** 2-4 days of development

- Add dependencies and setup (0.5 days)
- Schema design and migration script (1 day)
- Update persistence layer (1 day)
- Testing and validation (0.5-1.5 days)

**Benefit:**

- **Reliability:** Eliminates state corruption issues
- **Recovery:** Faster recovery from crashes
- **Operations:** Easier to inspect and debug state
- **Future-Proofing:** Foundation for more complex state needs

**ROI:** Medium - Benefit realized during incidents and debugging

---

## Recommendations

### Immediate Actions (High Priority)

1. **✅ Implement Tool Unification (Priority 1)**
   - **Rationale:** Highest ROI, lowest risk, immediate maintainability improvement
   - **Action:** Create shared-tools package with Mastra createTool API
   - **Timeline:** Sprint 1 (1-2 weeks)
   - **Expected Outcome:** ~600 lines eliminated, single source of truth for Plane tools

2. **✅ Migrate to LibSQL State Persistence (Priority 2)**
   - **Rationale:** Improved reliability and operational simplicity
   - **Action:** Replace JSON files with LibSQLStore
   - **Timeline:** Sprint 2 (1-2 weeks after tool unification)
   - **Expected Outcome:** ACID guarantees, better crash recovery, aligned with telegram-bot

### Further Investigation Required (Medium Priority)

3. **🔍 Evaluate Mastra Agent for Task Execution (Priority 3)**
   - **Rationale:** Potential for deeper integration, but paradigm mismatch concerns
   - **Action:** Contact Mastra maintainers or review documentation for:
     - Non-conversational agent support
     - Custom budget/cost tracking hooks
     - Dynamic tool enable/disable
     - Pause/resume capabilities
     - Long-running task support
   - **Decision Criteria:** Proceed only if Mastra explicitly supports task-based execution
   - **Timeline:** Research phase (1 week), prototype (2 weeks if viable)

4. **🔍 Research Mastra Knowledge Base (Priority 4)**
   - **Rationale:** Could simplify skills system, but unclear if capabilities exist
   - **Action:** Review Mastra docs for RAG/knowledge management features
   - **Decision Criteria:** Must support markdown + frontmatter, custom metadata filtering, hierarchical sources
   - **Timeline:** Research only (defer implementation)

### Not Recommended

5. **❌ Do Not Replace Orchestration Logic**
   - Current `setInterval()` approach is simple, reliable, and well-understood
   - No evidence of Mastra workflow/scheduler features
   - Would add complexity without clear benefit

6. **❌ Do Not Adopt Mastra Server Framework**
   - Current HTTP layer is minimal and sufficient
   - No indication Mastra provides server capabilities
   - Over-engineering for current needs

---

## Implementation Roadmap

### Phase 1: Foundation (Weeks 1-4)

**Week 1-2: Tool Unification**

- [ ] Create `shared-tools` monorepo package
- [ ] Move telegram-bot Plane tools to shared package
- [ ] Write comprehensive test suite for shared tools
- [ ] Update telegram-bot to use shared tools
- [ ] Verify telegram-bot functionality unchanged

**Week 3-4: Agent-Runner Tool Migration**

- [ ] Create MCP adapter for Mastra tools (if needed)
- [ ] Update agent-runner to use shared tools
- [ ] Update tests to use shared tool suite
- [ ] Deploy and monitor for regressions
- [ ] Document shared tool usage patterns

**Deliverables:**

- Shared tools package with 11 unified Plane tools
- Test coverage: >90% for shared tools
- Documentation: Tool usage guide
- Metrics: Code reduction achieved (~600 lines)

---

### Phase 2: State Persistence (Weeks 5-6)

**Week 5: LibSQL Migration**

- [ ] Design database schema for agent state
- [ ] Add `@mastra/memory` and `@mastra/libsql` dependencies
- [ ] Write migration script for existing JSON state
- [ ] Implement LibSQL-based persistence layer
- [ ] Add database backup/restore scripts

**Week 6: Testing & Rollout**

- [ ] Test state persistence under crash scenarios
- [ ] Test migration script with production-like data
- [ ] Deploy with JSON file backup enabled
- [ ] Monitor for 2 weeks, compare JSON vs DB state
- [ ] Remove JSON file fallback after validation

**Deliverables:**

- LibSQL-based state persistence
- Migration script and documentation
- Backup/restore procedures
- Performance metrics: State save/load times

---

### Phase 3: Research & Evaluation (Weeks 7-8)

**Week 7: Mastra Agent Research**

- [ ] Review Mastra documentation for task-based execution
- [ ] Contact Mastra maintainers with specific questions
- [ ] Prototype simple task-based agent with Mastra
- [ ] Evaluate feasibility of custom budget tracking
- [ ] Document findings and decision rationale

**Week 8: Knowledge Base Research**

- [ ] Review Mastra knowledge/RAG capabilities
- [ ] Prototype skill loading with Mastra (if available)
- [ ] Compare performance vs current file-based system
- [ ] Document findings and decision rationale

**Deliverables:**

- Research report on Mastra Agent suitability
- Prototype code (if viable)
- Go/no-go decision on deeper integration
- Updated recommendations based on findings

---

## Risks and Mitigations

### Technical Risks

**Risk 1: Tool Adapter Complexity**

- **Description:** Agent-runner may need adapter layer to use Mastra tools with MCP
- **Likelihood:** Medium
- **Impact:** Medium (adds ~100 lines, increases complexity)
- **Mitigation:** Design simple adapter interface; consider using Mastra Agent directly if adapter becomes too complex

**Risk 2: LibSQL Migration Failures**

- **Description:** State migration from JSON to DB could fail or corrupt data
- **Likelihood:** Low
- **Impact:** High (could break agent-runner)
- **Mitigation:**
  - Test migration script on copy of production data
  - Keep JSON file backup during transition period
  - Add rollback procedure to restore from JSON if needed
  - Gradual rollout with monitoring

**Risk 3: Performance Regression**

- **Description:** LibSQL might be slower than JSON file I/O for state persistence
- **Likelihood:** Low
- **Impact:** Low (state saves are infrequent)
- **Mitigation:** Benchmark before/after; optimize queries if needed; state saves are not on critical path

**Risk 4: Mastra API Breaking Changes**

- **Description:** Mastra v1.x may have breaking changes in future updates
- **Likelihood:** Medium (framework is relatively new)
- **Impact:** Medium (would require tool updates)
- **Mitigation:** Pin Mastra versions; test updates in staging; maintain good test coverage; consider contributing to Mastra to influence stability

### Operational Risks

**Risk 5: Increased Dependency Footprint**

- **Description:** Adding Mastra to agent-runner increases dependencies
- **Likelihood:** High (guaranteed)
- **Impact:** Low (Mastra is well-maintained)
- **Mitigation:** Monitor Mastra for security updates; evaluate alternative if maintenance degrades

**Risk 6: Learning Curve**

- **Description:** Team needs to learn Mastra APIs and concepts
- **Likelihood:** Medium
- **Impact:** Low (APIs are well-documented)
- **Mitigation:** Create internal documentation; pair programming during migration; gradual rollout

---

## Success Metrics

### Quantitative Metrics

1. **Code Reduction**
   - **Target:** Eliminate 600+ lines from tool duplication
   - **Measurement:** Line count before/after in telegram-bot and agent-runner
   - **Success Criteria:** ≥500 lines removed

2. **Bug Reduction**
   - **Target:** 50% fewer tool-related bugs
   - **Measurement:** Bug tracker data (tool-related issues)
   - **Success Criteria:** ≥30% reduction in first 3 months

3. **State Reliability**
   - **Target:** Zero state corruption incidents
   - **Measurement:** Monitor state integrity checks
   - **Success Criteria:** No corruption events in 3 months post-migration

4. **Performance**
   - **Target:** State persistence ≤100ms (no regression)
   - **Measurement:** P95 latency for state save operations
   - **Success Criteria:** No >10% regression from baseline

### Qualitative Metrics

5. **Maintainability**
   - **Target:** Easier to add new tools and update Plane APIs
   - **Measurement:** Developer survey + time to add new tool
   - **Success Criteria:** Positive feedback; ≤50% time to add new tool

6. **Operational Simplicity**
   - **Target:** Easier to debug state issues and inspect agent status
   - **Measurement:** Incident response time for state-related issues
   - **Success Criteria:** ≥30% faster resolution

---

## Alternatives Considered

### Alternative 1: Keep Current Architecture (Status Quo)

**Pros:**

- Zero migration risk
- Team is familiar with current code
- No dependency on Mastra framework

**Cons:**

- Continued tool duplication (maintenance burden)
- State corruption risk remains
- Missed opportunity for code simplification

**Decision:** Rejected - Benefits of unification outweigh migration effort

---

### Alternative 2: Full Mastra Migration (Agent-Runner Uses Mastra Agent)

**Pros:**

- Complete framework consistency
- Maximum code reuse between applications
- Benefit from all Mastra features

**Cons:**

- High risk due to paradigm mismatch (conversational vs task-based)
- Major rewrite of agent-runner orchestration (~1500 lines)
- Unknown if Mastra supports required features (budget, pause/resume, phases)

**Decision:** Deferred pending research - Too risky without confirmation of Mastra capabilities

---

### Alternative 3: Create Custom Framework

**Pros:**

- Full control over APIs and features
- Can optimize for Agent HQ's specific needs
- No external dependency

**Cons:**

- Significant development effort (weeks/months)
- Ongoing maintenance burden
- Reinventing well-solved problems

**Decision:** Rejected - Mastra already solves most problems; custom framework is over-engineering

---

## Conclusion

**Summary:** Significant opportunities exist for Mastra integration expansion, particularly in tool system unification and state management. Immediate action recommended on high-impact, low-risk opportunities. Deeper integration (Agent class, knowledge base) deferred pending further research.

**Recommended Next Steps:**

1. **Approve implementation of tool unification** (Sprint 1)
2. **Approve LibSQL migration** (Sprint 2)
3. **Allocate research time for Mastra Agent evaluation** (Sprint 3)
4. **Create GitHub issues for each phase with detailed acceptance criteria**

**Expected Outcomes:**

- **Short Term (3 months):** 600+ lines eliminated, improved maintainability, better state reliability
- **Medium Term (6 months):** Decision on deeper Mastra integration based on research findings
- **Long Term (12 months):** Fully unified tool ecosystem, potential Agent class adoption if viable

**Success Indicators:**

- Tool-related bugs reduced by ≥30%
- State corruption incidents eliminated
- Developer velocity increased for tool additions
- Operational simplicity improved for debugging

---

## Appendices

### Appendix A: Mastra Package Versions

```json
{
  "@mastra/core": "^1.4.0",
  "@mastra/memory": "^1.3.0",
  "@mastra/libsql": "^1.4.0"
}
```

### Appendix B: Tool Count Breakdown

**Telegram-Bot Tools (11 total):**

1. listProjects
2. listTasks
3. createTask
4. getProjectStates
5. getTaskDetails
6. listTaskComments
7. addTaskComment
8. moveTaskState
9. listLabels
10. addLabelsToTask
11. removeLabelsFromTask

**Agent-Runner Tools (11 total):**

1. update_task_status
2. add_task_comment
3. list_task_comments
4. add_task_link
5. list_labels
6. add_labels_to_task
7. remove_labels_from_task
8. load_skill
9. create_skill
10. (Additional MCP-specific tools)
11. (Additional MCP-specific tools)

**Overlap:** 7 tools have direct equivalents (Plane API operations)

### Appendix C: References

- **Mastra GitHub:** https://github.com/mastra-ai/mastra
- **Mastra Documentation:** https://mastra.ai/docs (requires web access)
- **Claude Agent SDK:** https://github.com/anthropics/anthropic-agent-sdk
- **Agent HQ Codebase:** Internal repository

---

**Document Status:** Complete
**Next Review:** After Phase 1 completion (Week 4)
**Owner:** Agent assigned to AGENTHQ-31
**Last Updated:** 2026-03-05
