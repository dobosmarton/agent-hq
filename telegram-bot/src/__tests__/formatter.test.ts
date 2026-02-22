import { describe, expect, it } from "vitest";
import {
  formatComment,
  formatForTelegram,
  formatTaskDetails,
  smartChunkMessage,
} from "../formatter";

describe("formatForTelegram", () => {
  describe("HTML tag conversion", () => {
    it("should convert h1-h6 to bold with emoji", () => {
      expect(formatForTelegram("<h1>Title</h1>")).toBe("<b>📋 Title</b>\n\n");
      expect(formatForTelegram("<h3>Subtitle</h3>")).toBe("<b>📋 Subtitle</b>\n\n");
    });

    it("should convert paragraphs to text with spacing", () => {
      expect(formatForTelegram("<p>Hello world</p>")).toBe("Hello world\n\n");
      expect(formatForTelegram("<p>First</p><p>Second</p>")).toBe("First\n\nSecond\n\n");
    });

    it("should convert unordered lists to bullets", () => {
      const html = "<ul><li>Item 1</li><li>Item 2</li></ul>";
      const expected = "• Item 1\n• Item 2\n\n";
      expect(formatForTelegram(html)).toBe(expected);
    });

    it("should convert ordered lists to numbers", () => {
      const html = "<ol><li>First</li><li>Second</li><li>Third</li></ol>";
      const expected = "1. First\n2. Second\n3. Third\n\n";
      expect(formatForTelegram(html)).toBe(expected);
    });

    it("should convert strong to bold", () => {
      expect(formatForTelegram("<p>This is <strong>bold</strong></p>")).toBe(
        "This is <b>bold</b>\n\n"
      );
    });

    it("should convert em to italic", () => {
      expect(formatForTelegram("<p>This is <em>italic</em></p>")).toBe("This is <i>italic</i>\n\n");
    });

    it("should preserve code tags", () => {
      expect(formatForTelegram("<code>const x = 5;</code>")).toBe("<code>const x = 5;</code>");
    });

    it("should preserve pre tags", () => {
      const html = "<pre>function test() {\n  return true;\n}</pre>";
      const expected = "<pre>function test() {\n  return true;\n}</pre>";
      expect(formatForTelegram(html)).toBe(expected);
    });

    it("should preserve links", () => {
      const html = '<a href="https://example.com">Click here</a>';
      const expected = '<a href="https://example.com">Click here</a>';
      expect(formatForTelegram(html)).toBe(expected);
    });

    it("should remove unsupported tags but keep content", () => {
      expect(formatForTelegram("<div>Hello</div>")).toBe("Hello");
      expect(formatForTelegram("<span>World</span>")).toBe("World");
    });
  });

  describe("complex nested structures", () => {
    it("should handle nested lists", () => {
      const html = `
        <ul>
          <li>Item 1</li>
          <li>Item 2 with <strong>bold</strong></li>
          <li>Item 3</li>
        </ul>
      `;
      const result = formatForTelegram(html);
      expect(result).toContain("• Item 1");
      expect(result).toContain("• Item 2 with <b>bold</b>");
      expect(result).toContain("• Item 3");
    });

    it("should handle mixed content", () => {
      const html = `
        <h3>Description</h3>
        <p>This is a <strong>test</strong> task with <code>code</code>.</p>
        <ul>
          <li>First item</li>
          <li>Second item</li>
        </ul>
      `;
      const result = formatForTelegram(html);
      expect(result).toContain("<b>📋 Description</b>");
      expect(result).toContain("This is a <b>test</b> task with <code>code</code>");
      expect(result).toContain("• First item");
      expect(result).toContain("• Second item");
    });

    it("should handle links in paragraphs", () => {
      const html = '<p>Check out <a href="https://example.com">this link</a> for more.</p>';
      const result = formatForTelegram(html);
      expect(result).toContain('<a href="https://example.com">this link</a>');
    });
  });

  describe("emoji insertion", () => {
    it("should add success emoji to success patterns", () => {
      const result = formatForTelegram("<p>Task completed successfully</p>");
      expect(result).toContain("✅ completed");
    });

    it("should add warning emoji to error patterns", () => {
      const result = formatForTelegram("<p>Build failed with error</p>");
      expect(result).toContain("⚠️ failed");
      expect(result).toContain("⚠️ error");
    });

    it("should not add emojis when disabled", () => {
      const result = formatForTelegram("<p>Task completed successfully</p>", {
        addEmojis: false,
      });
      expect(result).not.toContain("✅");
      expect(result).toBe("Task completed successfully\n\n");
    });

    it("should be case insensitive for emoji patterns", () => {
      expect(formatForTelegram("<p>COMPLETED</p>")).toContain("✅ COMPLETED");
      expect(formatForTelegram("<p>Failed</p>")).toContain("⚠️ Failed");
    });
  });

  describe("truncation", () => {
    it("should not truncate short messages", () => {
      const short = "This is a short message";
      expect(formatForTelegram(short)).toBe(short);
    });

    it("should truncate long messages", () => {
      const long = "x".repeat(5000);
      const result = formatForTelegram(long);
      expect(result.length).toBeLessThan(4096);
      expect(result).toContain("content truncated");
    });

    it("should add Read more link when url provided", () => {
      const long = "x".repeat(5000);
      const url = "https://plane.example.com/task/123";
      const result = formatForTelegram(long, { url });
      expect(result).toContain("content truncated");
      expect(result).toContain(url);
      expect(result).toContain("Read full details in Plane");
    });

    it("should try to truncate at paragraph boundaries", () => {
      const long = "Short paragraph\n\n" + "x".repeat(4000) + "\n\nAnother paragraph";
      const result = formatForTelegram(long, { url: "https://example.com" });
      expect(result.length).toBeLessThan(4096);
    });
  });

  describe("edge cases", () => {
    it("should handle empty string", () => {
      expect(formatForTelegram("")).toBe("");
    });

    it("should handle whitespace-only string", () => {
      expect(formatForTelegram("   \n\n   ")).toBe("");
    });

    it("should handle malformed HTML gracefully", () => {
      const malformed = "<p>Unclosed paragraph<p>Another one</p>";
      const result = formatForTelegram(malformed);
      expect(result).toBeTruthy();
      expect(result).toContain("Unclosed paragraph");
    });

    it("should handle special HTML characters", () => {
      const html = "<p>Use &lt;brackets&gt; and &amp; symbols</p>";
      const result = formatForTelegram(html);
      expect(result).toContain("&lt;brackets&gt;");
      expect(result).toContain("&amp;");
    });

    it("should clean up excessive newlines", () => {
      const html = "<p>First</p>\n\n\n\n<p>Second</p>";
      const result = formatForTelegram(html);
      expect(result).not.toMatch(/\n{3,}/);
    });

    it("should handle code with special characters", () => {
      const html = "<code>if (x < 5 && y > 3)</code>";
      const result = formatForTelegram(html);
      expect(result).toContain("<code>");
    });

    it("should handle empty lists", () => {
      expect(formatForTelegram("<ul></ul>")).toBe("");
      expect(formatForTelegram("<ol></ol>")).toBe("");
    });
  });

  describe("real-world examples", () => {
    it("should format task description from plan", () => {
      const html = `
        <h3>Description</h3>
        <p>Create a lightweight end-to-end quality validation system.</p>
        <h3>Acceptance Criteria</h3>
        <ul>
          <li>Test real agent workflows</li>
          <li>Verify agent behavior across multiple projects</li>
          <li>Catch regressions in core functionality</li>
        </ul>
      `;
      const result = formatForTelegram(html);
      expect(result).toContain("<b>📋 Description</b>");
      expect(result).toContain("<b>📋 Acceptance Criteria</b>");
      expect(result).toContain("• Test real agent workflows");
      expect(result).toContain("• Verify agent behavior");
    });

    it("should format comment with code block", () => {
      const html = `
        <p>Here's the implementation:</p>
        <pre>
function formatMessage(text) {
  return text.trim();
}
        </pre>
        <p>This should work now.</p>
      `;
      const result = formatForTelegram(html);
      expect(result).toContain("Here's the implementation:");
      expect(result).toContain("<pre>");
      expect(result).toContain("function formatMessage");
      expect(result).toContain("This should work now.");
    });

    it("should format technical considerations", () => {
      const html = `
        <h3>Technical Considerations</h3>
        <ul>
          <li><strong>Escaping:</strong> Different formats require different escaping</li>
          <li><strong>Testing:</strong> Test with <code>real content</code></li>
        </ul>
      `;
      const result = formatForTelegram(html);
      expect(result).toContain("<b>📋 Technical Considerations</b>");
      expect(result).toContain("• <b>Escaping:</b>");
      expect(result).toContain("<code>real content</code>");
    });
  });
});

describe("smartChunkMessage", () => {
  it("should not chunk short messages", () => {
    const short = "Hello world";
    expect(smartChunkMessage(short)).toEqual([short]);
  });

  it("should chunk long messages", () => {
    const long = "x".repeat(5000);
    const chunks = smartChunkMessage(long);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(4096);
    });
  });

  it("should try to chunk at paragraph boundaries", () => {
    const text = "Paragraph 1\n\n" + "x".repeat(4000) + "\n\nParagraph 2\n\n" + "y".repeat(100);
    const chunks = smartChunkMessage(text);
    expect(chunks.length).toBeGreaterThan(1);
    // First chunk should end near paragraph boundary
    expect(chunks[0]).toContain("Paragraph 1");
  });

  it("should respect custom max length", () => {
    const text = "a".repeat(500);
    const chunks = smartChunkMessage(text, 100);
    expect(chunks.length).toBeGreaterThan(1);
    chunks.forEach((chunk) => {
      expect(chunk.length).toBeLessThanOrEqual(100);
    });
  });
});

describe("formatTaskDetails", () => {
  it("should format complete task details", () => {
    const task = {
      id: "VERDANDI-5",
      title: "Test task",
      description_html: "<p>This is a <strong>test</strong> task.</p>",
      state: "In Progress",
      priority: "high",
      created_at: "2024-01-01T00:00:00Z",
      updated_at: "2024-01-02T00:00:00Z",
      url: "https://plane.example.com/task/5",
    };

    const result = formatTaskDetails(task);
    expect(result).toContain("<b>📋 VERDANDI-5: Test task</b>");
    expect(result).toContain("State: <b>In Progress</b>");
    expect(result).toContain("Priority: high");
    expect(result).toContain("This is a <b>test</b> task.");
    expect(result).toContain("View in Plane");
    expect(result).toContain(task.url);
  });

  it("should handle minimal task details", () => {
    const task = {
      id: "HQ-42",
      title: "Simple task",
    };

    const result = formatTaskDetails(task);
    expect(result).toContain("<b>📋 HQ-42: Simple task</b>");
    expect(result).not.toContain("State:");
    expect(result).not.toContain("Priority:");
  });

  it("should handle task without description", () => {
    const task = {
      id: "TEST-1",
      title: "No description",
      state: "Todo",
    };

    const result = formatTaskDetails(task);
    expect(result).toContain("<b>📋 TEST-1: No description</b>");
    expect(result).toContain("State: <b>Todo</b>");
  });
});

describe("formatComment", () => {
  it("should format comment with author and date", () => {
    const comment = {
      author: "John Doe",
      comment_html: "<p>This looks good!</p>",
      created_at: "2024-01-15T10:30:00Z",
    };

    const result = formatComment(comment);
    expect(result).toContain("💬 <b>John Doe</b>");
    expect(result).toContain("This looks good!");
  });

  it("should format comment with code", () => {
    const comment = {
      author: "Jane Smith",
      comment_html: "<p>Try this: <code>npm install</code></p>",
      created_at: "2024-01-15T10:30:00Z",
    };

    const result = formatComment(comment);
    expect(result).toContain("💬 <b>Jane Smith</b>");
    expect(result).toContain("<code>npm install</code>");
  });

  it("should not add extra emojis to comment content", () => {
    const comment = {
      author: "Bot",
      comment_html: "<p>Task completed successfully</p>",
      created_at: "2024-01-15T10:30:00Z",
    };

    const result = formatComment(comment);
    // Should have the comment emoji but not success emoji
    expect(result).toContain("💬");
    expect(result).not.toContain("✅");
  });
});
