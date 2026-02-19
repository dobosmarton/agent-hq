import { describe, it, expect } from "vitest";
import { extractTaskId, chunkMessage } from "../utils.js";

describe("extractTaskId", () => {
  it("extracts standard task ID", () => {
    expect(extractTaskId("Agent needs help with HQ-123 please")).toBe("HQ-123");
  });

  it("extracts multi-word identifier", () => {
    expect(extractTaskId("Agent needs help VERDANDI-42 blocked")).toBe("VERDANDI-42");
  });

  it("returns null when no match", () => {
    expect(extractTaskId("Agent needs help no id here")).toBeNull();
  });

  it("extracts numeric-prefixed identifier", () => {
    expect(extractTaskId("A2B-99 is blocked")).toBe("A2B-99");
  });

  it("picks first match when multiple IDs present", () => {
    expect(extractTaskId("HQ-1 and HQ-2")).toBe("HQ-1");
  });
});

describe("chunkMessage", () => {
  it("returns single chunk for short message", () => {
    expect(chunkMessage("Hello")).toEqual(["Hello"]);
  });

  it("returns single chunk for exactly maxLen", () => {
    const msg = "x".repeat(4096);
    expect(chunkMessage(msg)).toEqual([msg]);
  });

  it("splits at maxLen boundary", () => {
    const msg = "x".repeat(4097);
    const chunks = chunkMessage(msg);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBe(4096);
    expect(chunks[1]!.length).toBe(1);
  });

  it("handles two full chunks", () => {
    const msg = "x".repeat(8192);
    const chunks = chunkMessage(msg);
    expect(chunks).toHaveLength(2);
    expect(chunks[0]!.length).toBe(4096);
    expect(chunks[1]!.length).toBe(4096);
  });

  it("handles empty string", () => {
    expect(chunkMessage("")).toEqual([""]);
  });

  it("respects custom maxLen", () => {
    const chunks = chunkMessage("hello world", 5);
    expect(chunks).toEqual(["hello", " worl", "d"]);
  });
});
