# Claude Code Plugins Analysis for AGENTHQ

**Date:** 2027-02-27
**Task:** AGENTHQ-23
**Status:** Investigation Complete
**Recommendation:** ⚠️ Not Applicable - Claude Code Plugins vs. SDK Agent Framework

---

## Executive Summary

**Key Finding:** Claude Code plugins are a real, well-documented extension system for **Claude Code (the CLI/IDE tool)**, not for SDK-based agents like AGENTHQ uses.

### What We Discovered

1. **Claude Code Plugins Are Real** - Official plugin system with marketplace, documentation, and ecosystem
2. **Wrong Context** - Claude Code is Anthropic's CLI/IDE tool for developers, separate from the Claude API/SDK
3. **AGENTHQ Architecture** - Our agents use the Claude API via TypeScript SDK, not the Claude Code CLI
4. **Not Applicable** - Claude Code plugins cannot be integrated into SDK-based agent architectures

### The Confusion

The task description asked to investigate "Claude code plugins" for agent enhancement, but there are two different things:

- **Claude Code** = CLI/IDE tool with plugin system (what we found)
- **Claude API/SDK** = What AGENTHQ uses to build agents (no plugin system)

### Recommendation

**Do NOT pursue Claude Code plugins integration** because:
1. Claude Code is a different product (CLI tool) than what AGENTHQ uses (API/SDK)
2. Claude Code plugins only work within the Claude Code CLI environment
3. AGENTHQ agents run as standalone services using the Claude API directly
4. Integration would require completely rewriting agents to run inside Claude Code

### What We Should Do Instead

Continue with **MCP (Model Context Protocol)** expansion as originally recommended:
- ✅ Multi-server MCP composition (already planned)
- ✅ GitHub MCP server integration (high value)
- ✅ Additional MCP servers as needed (Sentry, web search, databases)

---

## Part 1: What Are Claude Code Plugins?

### Overview

Claude Code is Anthropic's official CLI and IDE tool that provides an interactive AI coding assistant. It's similar to GitHub Copilot or Cursor, but built by Anthropic specifically for Claude.

**Claude Code plugins** extend this CLI tool with:
- **Skills**: Custom slash commands (e.g., `/my-plugin:review`)
- **Agents**: Specialized AI subagents with custom prompts
- **Hooks**: Event handlers (e.g., run linter after file edits)
- **MCP Servers**: External tool integrations (GitHub, Jira, databases)
- **LSP Servers**: Language intelligence (TypeScript, Python, Rust, Go, etc.)
- **Settings**: Default configuration when plugin is enabled

### Plugin System Architecture

```
User runs: claude (CLI command)
    ↓
Claude Code starts (interactive terminal UI)
    ↓
Loads plugins from marketplaces
    ↓
User types: /plugin-name:skill-name
    ↓
Plugin executes within Claude Code environment
```

### Official Plugin Marketplace

Anthropic maintains an official marketplace (`claude-plugins-official`) with plugins for:

**Code Intelligence (LSP):**
- TypeScript, Python, Rust, Go, Java, C/C++, C#, PHP, Swift, Lua, Kotlin

**External Integrations (MCP):**
- **Source Control**: GitHub, GitLab
- **Project Management**: Jira/Confluence (Atlassian), Asana, Linear, Notion
- **Design**: Figma
- **Infrastructure**: Vercel, Firebase, Supabase
- **Communication**: Slack
- **Monitoring**: Sentry

**Development Workflows:**
- commit-commands (Git workflows)
- pr-review-toolkit (PR reviews)
- agent-sdk-dev (building with Claude Agent SDK)
- plugin-dev (creating plugins)

**Output Styles:**
- explanatory-output-style
- learning-output-style

### Plugin Distribution

Plugins are distributed via **marketplaces** (JSON catalogs) hosted on:
- GitHub repositories (`owner/repo` format)
- Git URLs (GitLab, Bitbucket, self-hosted)
- Local directories
- Remote URLs (direct HTTPS links)

Installation scopes:
- **User scope**: Installed for you across all projects
- **Project scope**: Installed for all collaborators (in `.claude/settings.json`)
- **Local scope**: Installed for you in this repo only

### Creating Custom Plugins

Plugin structure:
```
my-plugin/
├── .claude-plugin/
│   └── plugin.json          # Manifest (name, version, description)
├── skills/                  # Agent Skills (auto-invoked by Claude)
│   └── code-review/
│       └── SKILL.md
├── commands/                # Slash commands (user-invoked)
│   └── review.md
├── agents/                  # Custom subagents
│   └── security-reviewer.json
├── hooks/                   # Event handlers
│   └── hooks.json
├── .mcp.json               # MCP server configs
├── .lsp.json               # LSP server configs
└── settings.json           # Default settings
```

Skills are namespaced: `/my-plugin:skill-name`

---

## Part 2: AGENTHQ Current Architecture

### What AGENTHQ Is

AGENTHQ is a **Claude API-based agent framework** that:
1. Receives tasks from Plane (project management tool) via webhooks
2. Runs Claude agents using the **Anthropic TypeScript SDK**
3. Agents execute with tools (MCP via custom server)
4. Agents commit code, create PRs, add comments to Plane

### Key Architectural Components

**Agent Runner** (`/agent-runner`):
- TypeScript/Node.js service
- Uses `@anthropic-ai/sdk` to call Claude API
- Custom MCP server (`agent-plane-tools`) for Plane integration
- Runs in Docker container on VPS
- Triggered by Plane webhooks

**Current Agent Tools** (via MCP):
- `update_task_status` - Move tasks through workflow
- `add_task_comment` - Progress updates
- `list_task_comments` - Read feedback
- `add_task_link` - Attach PR URLs
- Label management (add/remove labels)
- `load_skill` / `create_skill` - Coding standards

**Skills System** (Already Exists):
- Markdown files in `/agent-runner/skills/`
- Coding standards (TypeScript, Python, testing, etc.)
- Loaded into agent prompts dynamically
- **Same concept as Claude Code Skills**, but implemented differently

### How AGENTHQ Agents Work

```
Plane webhook triggers task
    ↓
Agent Runner spawns Claude agent (via SDK)
    ↓
Agent uses tools via MCP (agent-plane-tools server)
    ↓
Agent reads/writes code, commits, creates PR
    ↓
Agent updates Plane task with status/comments
```

**Critical Difference:** AGENTHQ agents are **headless services** using the Claude API directly, not running inside the Claude Code CLI.

---

## Part 3: Why Claude Code Plugins Don't Apply

### Fundamental Incompatibility

| Aspect | Claude Code Plugins | AGENTHQ Agents |
|--------|---------------------|----------------|
| **Environment** | Claude Code CLI tool | Standalone Node.js service |
| **Runtime** | Interactive terminal UI | Automated headless execution |
| **User Interface** | Human types `/commands` | Plane webhooks trigger tasks |
| **Claude Access** | Built into Claude Code | Via Anthropic API + SDK |
| **Plugin Loading** | Claude Code plugin system | Custom MCP server |
| **Distribution** | Marketplaces for CLI users | Internal service deployment |

### Why Integration Is Not Possible

1. **Different Products**
   - Claude Code = CLI tool for developers (like GitHub Copilot)
   - AGENTHQ = Backend service using Claude API
   - They don't share a runtime environment

2. **Architectural Mismatch**
   - Claude Code plugins require the Claude Code CLI to be running
   - AGENTHQ agents run as Docker containers on a VPS
   - No way to load Claude Code plugins into an SDK-based agent

3. **Would Require Complete Rewrite**
   - To use Claude Code plugins, we'd need to:
     - Abandon our current agent architecture
     - Run agents inside Claude Code CLI processes
     - Lose webhook integration with Plane
     - Lose Docker deployment model
     - Convert everything to interactive CLI sessions

4. **No Official SDK Integration**
   - Anthropic doesn't provide a way to use Claude Code plugins via the SDK
   - Plugins are tightly coupled to the Claude Code CLI

### What About the MCP Servers in Claude Code Plugins?

**Good question!** Claude Code plugins can bundle MCP servers (GitHub, Sentry, etc.), but:

- These are **standard MCP servers** (following the Model Context Protocol)
- They can be used **directly** without Claude Code
- We can integrate them into AGENTHQ's existing MCP architecture
- We don't need the "plugin" wrapper, just the MCP server itself

**Example:** Instead of installing the "GitHub plugin for Claude Code", we can:
1. Use the standalone GitHub MCP server (`@modelcontextprotocol/server-github`)
2. Configure it in our agent's MCP client
3. Give agents GitHub tools without Claude Code

This is exactly what the original MCP-focused analysis recommended.

---

## Part 4: What the Original Analysis Got Right

### MCP (Model Context Protocol) Remains the Answer

The original investigation (before discovering Claude Code docs) correctly identified MCP as the extensibility mechanism. This is still true:

1. **MCP is the standard** - Anthropic's official protocol for extending Claude
2. **Works with SDK** - MCP clients work with Claude API agents (our architecture)
3. **Same servers** - Claude Code plugins often wrap MCP servers we can use directly
4. **Already implemented** - AGENTHQ already uses MCP (`agent-plane-tools`)

### Recommended Path Forward (Unchanged)

**Phase 1: Multi-Server MCP + GitHub Integration** (9 days)

1. **Implement multi-server MCP composition** (3-4 days)
   - Currently limited to one MCP server per agent
   - Add MCP server registry to support multiple servers
   - Merge tools from multiple servers into agent context

2. **Integrate GitHub MCP server** (5-6 days)
   - Use `@modelcontextprotocol/server-github` (official)
   - Replace `gh` CLI commands with structured GitHub tools
   - Benefits:
     - Typed responses vs. bash output parsing
     - Better error handling
     - Cross-repo capabilities (search issues/PRs across repos)
     - PR templates, labels, milestones, reviews

**Phase 2: Additional MCP Servers** (As Needed)

- **Sentry MCP** - Production error investigation (5-7 days)
- **Web Search MCP** - Research tasks (3-4 days)
- **Database MCP** - PostgreSQL/MySQL operations (5-7 days)

### Benefits (Same as Original Analysis)

**Quantified Impact:**
- 30% reduction in GitHub-related bugs
- 20% faster PR creation and management
- Better structured tool responses (typed vs. string parsing)
- Cross-repository intelligence
- Foundation for future MCP server additions

**Cost-Benefit:**
- Investment: 9 days (~$3,600)
- Annual benefits: ~$5,360
- ROI: Break-even at 8 months, 350% over 3 years

---

## Part 5: Detailed Comparison

### Claude Code Plugins vs. MCP Servers

| Feature | Claude Code Plugins | Direct MCP Integration |
|---------|---------------------|------------------------|
| **Compatible with AGENTHQ** | ❌ No (requires CLI) | ✅ Yes (SDK-friendly) |
| **Requires rewrite** | ❌ Yes (entire architecture) | ✅ No (extends existing) |
| **GitHub integration** | via GitHub plugin | Same server, no plugin wrapper |
| **Sentry integration** | via Sentry plugin | Same server, no plugin wrapper |
| **Custom tools** | via plugin system | via MCP server (more flexible) |
| **Skills system** | Built into plugins | Already implemented in AGENTHQ |
| **Marketplace distribution** | ✅ Yes (for CLI users) | N/A (direct server config) |
| **Learning curve** | High (new ecosystem) | Low (build on existing MCP) |
| **Maintenance** | Depends on plugin authors | Depends on MCP server authors |
| **Deployment** | N/A (wrong environment) | Docker, VPS-friendly |

### Could We Run Claude Code Inside AGENTHQ?

**Theoretically yes, but practically no.**

We could:
1. Install Claude Code CLI in Docker container
2. Automate Claude Code CLI interactions
3. Load plugins via `--plugin-dir`
4. Parse Claude Code output to get responses

**Why this is a terrible idea:**
- ❌ Huge complexity (automating an interactive CLI)
- ❌ Fragile (CLI output parsing, screen scraping)
- ❌ Resource-heavy (full Claude Code process per agent)
- ❌ No API guarantees (CLI can change)
- ❌ Loses benefits of SDK (streaming, fine control, typed responses)
- ❌ Debugging nightmare
- ❌ No clear advantage over direct MCP server integration

**Verdict:** Not worth it. Use MCP servers directly.

---

## Part 6: Skills Comparison

### Claude Code Skills vs. AGENTHQ Skills

Interestingly, both systems have "Skills", but they work differently:

| Aspect | Claude Code Skills | AGENTHQ Skills |
|--------|-------------------|----------------|
| **Format** | Markdown with frontmatter | Markdown with frontmatter |
| **Location** | `plugin/skills/skill-name/SKILL.md` | `/agent-runner/skills/skill-name.md` |
| **Invocation** | Auto-invoked by Claude | Loaded into system prompt |
| **Namespace** | `/plugin-name:skill-name` | Skill ID (e.g., `python-best-practices`) |
| **Loading** | Plugin system | `load_skill` MCP tool |
| **Scope** | Per-plugin | Global + project-specific |
| **Distribution** | Via plugin marketplace | Version control + MCP tool |

**Key Insight:** AGENTHQ's skills system already provides similar functionality to Claude Code's skill system, just implemented differently. No need to migrate.

### Could We Convert AGENTHQ Skills to Claude Code Plugins?

**For what purpose?**

If the goal is to distribute AGENTHQ's coding standards to the community:
- ✅ Yes, could package as Claude Code plugins
- ✅ Other Claude Code CLI users could install them
- ❌ But wouldn't help AGENTHQ's agents (they don't run in Claude Code)

If the goal is to improve AGENTHQ's agents:
- ❌ No benefit (current skills system already works)
- ❌ Would add unnecessary complexity
- ❌ Agents don't run in Claude Code CLI

**Verdict:** Not worth it for internal use. Maybe worth it if we want to share coding standards with the broader community.

---

## Part 7: What We Can Learn from Claude Code Plugins

Even though we can't use Claude Code plugins directly, there are useful ideas:

### 1. **Plugin Marketplace Pattern**

Claude Code's marketplace distribution is elegant:
- Plugins hosted on GitHub (or any Git host)
- Marketplace is just a JSON catalog
- Auto-updates built in
- Scoped installation (user/project/local)

**Could we apply this to AGENTHQ?**
- Not really needed (we're an internal tool, not distributed software)
- But could inspire how we share skills across projects
- Could create a "skill marketplace" for coding standards

### 2. **Hooks System**

Claude Code plugins support **hooks** (event handlers):
```json
{
  "hooks": {
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "jq -r '.tool_input.file_path' | xargs npm run lint:fix"
          }
        ]
      }
    ]
  }
}
```

**Could we add hooks to AGENTHQ?**
- ✅ Potentially useful (e.g., auto-format after file edits)
- ✅ Could implement in agent runner
- ⚠️ Adds complexity (error handling, performance)
- ⚠️ Defer until we have a clear use case

### 3. **LSP Integration**

Claude Code uses LSP (Language Server Protocol) for code intelligence:
- Jump to definition
- Find references
- Type checking
- Diagnostics after edits

**Could AGENTHQ agents use LSP?**
- ✅ Technically possible (LSP servers are standalone)
- ✅ Could provide better code navigation than grep
- ⚠️ Significant complexity (managing LSP server processes)
- ⚠️ Unclear ROI (agents already use grep/glob effectively)
- ❌ Defer until we see agents struggling with code navigation

### 4. **Agent Settings System**

Claude Code plugins can ship `settings.json` to configure default behavior:
```json
{
  "agent": "security-reviewer"
}
```

**AGENTHQ equivalent:**
- We could allow tasks to specify which "agent profile" to use
- Different profiles = different system prompts, tool restrictions, models
- Already somewhat possible via task labels or custom fields
- Could formalize this pattern

---

## Part 8: Risk Assessment

### Risks of Trying to Integrate Claude Code Plugins

| Risk | Severity | Impact |
|------|----------|--------|
| **Architectural incompatibility** | 🔴 Critical | Complete rewrite required |
| **Loss of webhook integration** | 🔴 Critical | Plane integration breaks |
| **Increased complexity** | 🔴 High | CLI automation, process management |
| **Deployment challenges** | 🟡 Medium | Docker, resource overhead |
| **Maintenance burden** | 🟡 Medium | Parsing CLI output, handling updates |
| **Limited documentation** | 🟡 Medium | SDK approach well-documented, CLI automation is not |
| **No clear benefits** | 🔴 Critical | Same functionality available via MCP |

### Risks of MCP Approach (Original Recommendation)

| Risk | Severity | Mitigation |
|------|----------|------------|
| **MCP server reliability** | 🟢 Low | Use official servers, implement fallbacks |
| **Integration complexity** | 🟢 Low | Building on existing MCP pattern |
| **Performance overhead** | 🟢 Low | Minimal (JSON-RPC), benchmark before production |
| **Version compatibility** | 🟡 Medium | Pin versions, test before updating |

---

## Part 9: Final Recommendations

### Recommendation Matrix

| Approach | Verdict | Reason |
|----------|---------|--------|
| **Integrate Claude Code plugins** | ❌ **Do NOT pursue** | Wrong product, architectural mismatch, no benefits |
| **Expand MCP server usage** | ✅ **Strongly recommend** | Compatible, proven, clear ROI |
| **Use MCP servers from plugin ecosystem** | ✅ **Yes, directly** | Take servers, skip plugin wrapper |
| **Package AGENTHQ skills as Claude Code plugins** | ⚠️ **Optional, low priority** | Only if distributing to community |
| **Add hooks to AGENTHQ** | ⚠️ **Defer** | Interesting but not urgent |
| **Add LSP to AGENTHQ agents** | ⚠️ **Defer** | High complexity, unclear ROI |

### What to Do Now

#### ✅ Immediate Actions (Do These)

1. **Close this investigation task** with findings
2. **Create follow-up implementation task** for MCP expansion:
   - Title: "Implement multi-server MCP composition + GitHub integration"
   - Scope: Phase 1 from original analysis (9 days)
   - Priority: High (clear ROI, builds on existing architecture)

3. **Update AGENTHQ documentation**:
   - Clarify that AGENTHQ uses Claude API/SDK (not Claude Code CLI)
   - Explain MCP as the extensibility mechanism
   - Document current MCP server (`agent-plane-tools`)
   - Add roadmap for additional MCP servers

#### 🔄 Future Considerations (Defer)

4. **Explore specific MCP servers** from Claude Code ecosystem:
   - GitHub MCP server (high priority)
   - Sentry MCP server (for production debugging)
   - Web search MCP server (for research tasks)
   - Database MCP servers (if working with DB-heavy projects)

5. **Consider hook system** if use cases emerge:
   - Auto-formatting after edits
   - Auto-testing after code changes
   - Security scanning before commits

6. **Evaluate LSP integration** if agents struggle with navigation:
   - Only if grep/glob prove insufficient
   - Start with one language (TypeScript or Python)
   - Benchmark performance impact

#### ❌ Do NOT Do

7. **Do NOT try to integrate Claude Code plugins**
   - Wrong architecture
   - No benefits over direct MCP approach
   - Would require complete rewrite

8. **Do NOT run Claude Code CLI inside agents**
   - Terrible idea
   - Massive complexity
   - No advantages

---

## Part 10: Implementation Roadmap (MCP Expansion)

### Phase 1: Multi-Server Foundation + GitHub (9 days)

**Week 1-2:**

**Days 1-2: Design multi-server architecture**
- Design MCP server registry pattern
- Plan tool namespace collision handling
- Design server lifecycle management
- Document architecture decisions

**Days 3-4: Implement MCP server registry**
- Extend agent runner to support multiple MCP servers
- Implement server discovery and initialization
- Add tool aggregation from multiple servers
- Write tests for multi-server composition

**Days 5-6: Integrate GitHub MCP server**
- Install and configure `@modelcontextprotocol/server-github`
- Add to MCP server registry
- Test GitHub tools (create PR, search issues, etc.)
- Update agent prompts to use GitHub tools

**Days 7-8: Replace git CLI usage**
- Identify all `gh` CLI calls in codebase
- Replace with GitHub MCP tools
- Update error handling
- Test with real tasks

**Day 9: Documentation and testing**
- Document new MCP architecture
- Write integration tests
- Update README with GitHub integration
- Create runbook for adding new MCP servers

### Phase 2: Additional Servers (Future Sprints)

**Sentry Integration (5-7 days)**
- Add Sentry MCP server
- Enable agents to investigate production errors
- Create "debug production issue" task type
- Test with real Sentry errors

**Web Search Integration (3-4 days)**
- Add web search MCP server
- Enable agents to research during task execution
- Useful for "investigate X" tasks
- Test search quality and latency

**Database Integration (5-7 days, if needed)**
- Add PostgreSQL/MySQL MCP servers
- Enable agents to query databases directly
- Useful for data migration, schema changes
- Test with read-only access first

### Success Metrics

**Quantitative:**
- 30% reduction in GitHub-related agent errors
- 20% faster PR creation times
- 100% of git operations use structured tools (vs. CLI parsing)
- <200ms latency added by MCP composition

**Qualitative:**
- Agents can search issues across repos
- Better error messages from GitHub operations
- Easier to add new tool integrations
- Cleaner agent code (less bash command construction)

---

## Part 11: Lessons Learned

### What This Investigation Taught Us

1. **Terminology matters**
   - "Claude code plugins" could mean:
     - Plugins for Claude Code CLI (what actually exists)
     - Plugins for Claude API/SDK (what we initially imagined)
   - Always clarify the context

2. **MCP is the universal answer**
   - For Claude Code CLI users: MCP servers via plugins
   - For Claude API/SDK users: MCP servers directly
   - MCP is Anthropic's standard extensibility protocol

3. **Don't assume product integration**
   - Claude Code (CLI) and Claude API (SDK) are separate products
   - They share the underlying Claude model, but different runtimes
   - Tools/plugins for one don't automatically work with the other

4. **Architecture matters more than features**
   - Claude Code plugins have cool features (marketplace, hooks, LSP)
   - But architectural mismatch makes them unusable for AGENTHQ
   - Better to stick with compatible, simpler solutions

5. **Community ecosystem is valuable**
   - Claude Code plugin marketplace has useful MCP servers
   - We can use these servers directly (without the plugin wrapper)
   - Open-source MCP servers benefit both CLI and SDK users

### Skill Recording Opportunity

This investigation revealed important patterns worth recording:

**Potential skills to create:**
1. **MCP Server Integration Patterns** - How to add new MCP servers to AGENTHQ
2. **GitHub MCP Usage Guide** - When to use which GitHub tools
3. **Multi-Server MCP Best Practices** - Handling tool conflicts, namespacing
4. **Distinguishing Claude Products** - Claude Code vs. Claude API vs. Claude.ai

---

## Part 12: FAQ

### Q: Can AGENTHQ agents use Claude Code plugins?
**A:** No. Claude Code plugins only work in the Claude Code CLI environment. AGENTHQ agents use the Claude API directly via SDK.

### Q: Can we extract MCP servers from Claude Code plugins?
**A:** Yes! Many Claude Code plugins wrap standard MCP servers. We can use those MCP servers directly without the plugin wrapper.

### Q: Should we switch from SDK to Claude Code CLI?
**A:** Absolutely not. That would mean:
- Losing webhook integration with Plane
- Losing Docker deployment model
- Automating an interactive CLI (fragile)
- No benefit over current architecture

### Q: Are AGENTHQ skills the same as Claude Code skills?
**A:** Similar concept, different implementation:
- Both: Markdown files with instructions
- Claude Code: Auto-invoked by Claude, namespaced by plugin
- AGENTHQ: Loaded into system prompt, referenced by ID
- Our system already works well, no need to change

### Q: Could we contribute to the Claude Code plugin ecosystem?
**A:** Sure, if we want to share our coding standards with the community. But it wouldn't improve AGENTHQ's agents.

### Q: What about the LSP integration in Claude Code?
**A:** LSP (Language Server Protocol) could theoretically be added to AGENTHQ agents, but:
- High complexity (managing server processes)
- Unclear ROI (agents already navigate code well)
- Defer until we see clear need

### Q: Can we use Claude Code's marketplace pattern?
**A:** The marketplace pattern is interesting but not applicable:
- AGENTHQ is an internal tool, not distributed software
- We don't need plugin distribution mechanisms
- Skills are versioned via git, loaded via MCP tool

### Q: What's the TL;DR?
**A:**
- ❌ Claude Code plugins = wrong product, can't integrate
- ✅ MCP servers = right approach, continue expanding
- 📦 Use MCP servers from plugin ecosystem directly (no wrapper needed)
- 🎯 Focus on Phase 1: Multi-server MCP + GitHub integration

---

## Appendix A: Technical Glossary

**Claude Code:** Anthropic's CLI/IDE tool for developers (like GitHub Copilot). Provides interactive AI coding assistance in the terminal.

**Claude API:** Anthropic's HTTP API for accessing Claude models programmatically. What AGENTHQ uses.

**Claude SDK:** Official client libraries (`@anthropic-ai/sdk`) for using Claude API. What AGENTHQ's agent runner uses.

**MCP (Model Context Protocol):** Anthropic's open standard for connecting AI applications to external tools/data. Works with both Claude Code and Claude API.

**MCP Server:** A service that implements MCP protocol, providing tools/resources to AI applications. Examples: GitHub, Sentry, databases.

**MCP Client:** The AI application side that connects to MCP servers. AGENTHQ's agent runner is an MCP client.

**Claude Code Plugin:** Extension package for Claude Code CLI containing skills, agents, hooks, MCP servers, or LSP servers.

**Plugin Marketplace:** A JSON catalog of Claude Code plugins that can be installed. Hosted on GitHub or other Git platforms.

**LSP (Language Server Protocol):** Microsoft's standard for providing code intelligence (go-to-definition, find-references, diagnostics). Used by VS Code, Claude Code, and other editors.

**Skills (Claude Code):** Markdown files in plugins that define AI capabilities. Auto-invoked by Claude based on context.

**Skills (AGENTHQ):** Markdown files with coding standards loaded into agent system prompts. Similar concept, different implementation.

**Hooks (Claude Code):** Event handlers in plugins that trigger on specific events (e.g., PostToolUse, PreFileWrite).

**Subagents (Claude Code):** Specialized AI agents with custom prompts and tool restrictions defined in plugins.

---

## Appendix B: References

### Official Documentation
- [Claude Code Plugins Overview](https://code.claude.com/docs/en/plugins)
- [Discover and Install Plugins](https://code.claude.com/docs/en/discover-plugins)
- [Create Plugin Marketplaces](https://code.claude.com/docs/en/plugin-marketplaces)
- [Plugins Reference](https://code.claude.com/docs/en/plugins-reference)
- [Model Context Protocol (MCP)](https://code.claude.com/docs/en/mcp)
- [Skills Documentation](https://code.claude.com/docs/en/skills)
- [Subagents Documentation](https://code.claude.com/docs/en/sub-agents)

### MCP Ecosystem
- [MCP Official GitHub](https://github.com/modelcontextprotocol)
- [MCP Server Collection](https://github.com/modelcontextprotocol/servers)
- [GitHub MCP Server](https://github.com/modelcontextprotocol/servers/tree/main/src/github)
- [MCP Specification](https://spec.modelcontextprotocol.io/)

### AGENTHQ Documentation
- [AGENTHQ README](/root/agenthq/README.md)
- [Agent Runner Source](/root/agenthq/agent-runner/src)
- [Current MCP Server](/root/agenthq/agent-runner/src/agent/mcp-tools.ts)
- [Skills Directory](/root/agenthq/agent-runner/skills)

---

## Document History

| Version | Date | Changes |
|---------|------|---------|
| 1.0 | 2027-02-27 | Initial analysis following user feedback about Claude Code plugins |

---

**End of Analysis**
