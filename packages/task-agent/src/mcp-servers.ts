import type { McpServerConfig, McpStdioServerConfig } from "@anthropic-ai/claude-agent-sdk";
import type { ExternalMcpServer } from "./adapters";

type McpServersBuildInput = {
  /** The built-in SDK MCP server instance (from createAgentMcpServer) */
  sdkServer: McpServerConfig;
  /** Global MCP server configs (from agent config) */
  globalServers?: Record<string, ExternalMcpServer>;
  /** Per-project MCP server configs (overrides globals with same name) */
  projectServers?: Record<string, ExternalMcpServer>;
};

const toStdioConfig = (server: ExternalMcpServer): McpStdioServerConfig => ({
  type: "stdio",
  command: server.command,
  args: server.args,
  env: server.env,
});

/**
 * Build the mcpServers record for query().
 * Priority: built-in SDK server > project servers > global servers.
 */
export const buildMcpServersRecord = (
  input: McpServersBuildInput
): Record<string, McpServerConfig> => {
  const servers: Record<string, McpServerConfig> = {};

  // Global servers (lowest priority)
  for (const [name, config] of Object.entries(input.globalServers ?? {})) {
    servers[name] = toStdioConfig(config);
  }

  // Project servers (override globals with same name)
  for (const [name, config] of Object.entries(input.projectServers ?? {})) {
    servers[name] = toStdioConfig(config);
  }

  // Built-in SDK server (always present, cannot be overridden)
  servers["agent-plane-tools"] = input.sdkServer;

  return servers;
};
