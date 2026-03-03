import { describe, expect, it } from "vitest";
import {
  formatErrorMessage,
  formatFinalMessage,
  formatProgressMessage,
  type ProgressStep,
} from "../progress-formatter";

describe("formatProgressMessage", () => {
  it("should return initial message when no steps", () => {
    const result = formatProgressMessage([], Date.now());
    expect(result).toBe("⏳ Processing your request...");
  });

  it("should format steps with emoji indicators", () => {
    const steps: ProgressStep[] = [
      { name: "Parse request", status: "completed", timestamp: Date.now() },
      { name: "Execute query", status: "in_progress", timestamp: Date.now() },
      { name: "Format result", status: "pending", timestamp: Date.now() },
    ];

    const result = formatProgressMessage(steps, Date.now() - 5000);

    expect(result).toContain("✅ Parse request");
    expect(result).toContain("🔄 Execute query");
    expect(result).toContain("⏳ Format result");
    expect(result).toContain("Elapsed:");
  });

  it("should include step details when provided", () => {
    const steps: ProgressStep[] = [
      {
        name: "Processing",
        status: "in_progress",
        details: "Step 2 of 5",
        timestamp: Date.now(),
      },
    ];

    const result = formatProgressMessage(steps, Date.now());
    expect(result).toContain("Processing");
    expect(result).toContain("Step 2 of 5");
  });

  it("should format elapsed time in seconds", () => {
    const result = formatProgressMessage(
      [{ name: "Test", status: "in_progress", timestamp: Date.now() }],
      Date.now() - 30000
    );

    expect(result).toMatch(/Elapsed: 30s/);
  });

  it("should format elapsed time in minutes and seconds", () => {
    const result = formatProgressMessage(
      [{ name: "Test", status: "in_progress", timestamp: Date.now() }],
      Date.now() - 125000
    );

    expect(result).toMatch(/Elapsed: 2m 5s/);
  });
});

describe("formatFinalMessage", () => {
  it("should return the message as-is", () => {
    const message = "<b>Task completed</b>";
    expect(formatFinalMessage(message)).toBe(message);
  });
});

describe("formatErrorMessage", () => {
  it("should format error with emoji and bold header", () => {
    const error = "Something went wrong";
    const result = formatErrorMessage(error);

    expect(result).toContain("❌");
    expect(result).toContain("<b>Error</b>");
    expect(result).toContain("Something went wrong");
  });
});
