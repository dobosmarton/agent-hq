import { describe, it, expect } from "vitest";
import { buildMcpServersRecord } from "../mcp-servers";
import type { McpServerConfig } from "@anthropic-ai/claude-agent-sdk";

const fakeSdkServer = { type: "sdk", name: "agent-plane-tools" } as unknown as McpServerConfig;

describe("buildMcpServersRecord", () => {
  it("should include only the SDK server when no external servers provided", () => {
    const result = buildMcpServersRecord({ sdkServer: fakeSdkServer });

    expect(Object.keys(result)).toEqual(["agent-plane-tools"]);
    expect(result["agent-plane-tools"]).toBe(fakeSdkServer);
  });

  it("should include global external servers", () => {
    const result = buildMcpServersRecord({
      sdkServer: fakeSdkServer,
      globalServers: {
        github: { command: "npx", args: ["-y", "@modelcontextprotocol/server-github"] },
      },
    });

    expect(Object.keys(result).sort()).toEqual(["agent-plane-tools", "github"]);
    expect(result.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["-y", "@modelcontextprotocol/server-github"],
    });
  });

  it("should let project servers override global servers with same name", () => {
    const result = buildMcpServersRecord({
      sdkServer: fakeSdkServer,
      globalServers: {
        github: { command: "npx", args: ["global-github"] },
      },
      projectServers: {
        github: { command: "npx", args: ["project-github"], env: { TOKEN: "proj-token" } },
      },
    });

    expect(result.github).toEqual({
      type: "stdio",
      command: "npx",
      args: ["project-github"],
      env: { TOKEN: "proj-token" },
    });
  });

  it("should merge global and project servers with different names", () => {
    const result = buildMcpServersRecord({
      sdkServer: fakeSdkServer,
      globalServers: {
        github: { command: "npx", args: ["github-server"] },
      },
      projectServers: {
        slack: { command: "npx", args: ["slack-server"] },
      },
    });

    expect(Object.keys(result).sort()).toEqual(["agent-plane-tools", "github", "slack"]);
  });

  it("should not allow external servers to override agent-plane-tools", () => {
    const result = buildMcpServersRecord({
      sdkServer: fakeSdkServer,
      projectServers: {
        "agent-plane-tools": { command: "malicious", args: [] },
      },
    });

    // SDK server takes precedence
    expect(result["agent-plane-tools"]).toBe(fakeSdkServer);
  });

  it("should set type to stdio for external servers", () => {
    const result = buildMcpServersRecord({
      sdkServer: fakeSdkServer,
      globalServers: {
        custom: { command: "node", args: ["server.js"] },
      },
    });

    const custom = result.custom as { type: string };
    expect(custom.type).toBe("stdio");
  });
});
