import { describe, it, expect, vi, beforeEach } from "vitest";

const mockFetch = vi.fn();
vi.stubGlobal("fetch", mockFetch);

import { createNotifier } from "../../telegram/notifier.js";

const notifier = createNotifier({ botToken: "tok123", chatId: "chat456" });

beforeEach(() => {
  mockFetch.mockReset();
});

const mockTelegramOk = (messageId: number) =>
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: () => Promise.resolve({ result: { message_id: messageId } }),
  });

const mockTelegramError = () =>
  mockFetch.mockResolvedValueOnce({
    ok: false,
    status: 400,
    text: () => Promise.resolve("Bad Request"),
  });

describe("sendMessage", () => {
  it("sends to correct URL", async () => {
    mockTelegramOk(1);
    await notifier.sendMessage("hello");

    const [url] = mockFetch.mock.calls[0]!;
    expect(url).toBe("https://api.telegram.org/bottok123/sendMessage");
  });

  it("sends correct body", async () => {
    mockTelegramOk(1);
    await notifier.sendMessage("hello");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.chat_id).toBe("chat456");
    expect(body.text).toBe("hello");
    expect(body.parse_mode).toBe("HTML");
  });

  it("returns message_id on success", async () => {
    mockTelegramOk(42);
    const id = await notifier.sendMessage("test");
    expect(id).toBe(42);
  });

  it("returns 0 on error", async () => {
    mockTelegramError();
    const id = await notifier.sendMessage("test");
    expect(id).toBe(0);
  });

  it("includes reply_to_message_id when provided", async () => {
    mockTelegramOk(1);
    await notifier.sendMessage("reply", 99);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.reply_to_message_id).toBe(99);
  });

  it("omits reply_to_message_id when not provided", async () => {
    mockTelegramOk(1);
    await notifier.sendMessage("no reply");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body).not.toHaveProperty("reply_to_message_id");
  });
});

describe("agentStarted", () => {
  it("sends correct HTML format", async () => {
    mockTelegramOk(1);
    await notifier.agentStarted("HQ-42", "Fix bug");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.text).toContain("<b>Agent started</b>");
    expect(body.text).toContain("<code>HQ-42</code>");
    expect(body.text).toContain("Fix bug");
  });
});

describe("agentCompleted", () => {
  it("sends correct HTML format", async () => {
    mockTelegramOk(1);
    await notifier.agentCompleted("HQ-42", "Fix bug");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.text).toContain("<b>Agent completed</b>");
  });
});

describe("agentErrored", () => {
  it("includes error in pre tag", async () => {
    mockTelegramOk(1);
    await notifier.agentErrored("HQ-42", "Fix bug", "Something broke");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.text).toContain("<pre>Something broke</pre>");
  });

  it("truncates error to 500 chars", async () => {
    mockTelegramOk(1);
    const longError = "x".repeat(1000);
    await notifier.agentErrored("HQ-42", "Fix bug", longError);

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    const preContent = body.text.match(/<pre>(.*?)<\/pre>/s)?.[1] ?? "";
    expect(preContent.length).toBe(500);
  });
});

describe("agentBlocked", () => {
  it("returns message_id", async () => {
    mockTelegramOk(55);
    const id = await notifier.agentBlocked("HQ-42", "What DB?");
    expect(id).toBe(55);
  });

  it("includes reply instruction", async () => {
    mockTelegramOk(1);
    await notifier.agentBlocked("HQ-42", "What DB?");

    const [, init] = mockFetch.mock.calls[0]!;
    const body = JSON.parse(init.body);
    expect(body.text).toContain("Reply to this message to answer");
  });
});
