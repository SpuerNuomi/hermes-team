import { describe, expect, it } from "vitest";
import {
  buildChatTranscript,
  isTranscriptMessage,
} from "../src/renderer/chatTranscript";
import type { Message } from "../src/core/types";

function msg(partial: Partial<Message>): Message {
  return {
    id: partial.id ?? `m-${Math.random().toString(16).slice(2)}`,
    workspaceId: "w1",
    authorKind: partial.authorKind ?? "user",
    authorName: partial.authorName ?? "You",
    content: partial.content ?? "",
    createdAt: partial.createdAt ?? 0,
    ...partial,
  };
}

describe("isTranscriptMessage", () => {
  it("keeps user and agent bubbles with visible text", () => {
    expect(isTranscriptMessage(msg({ authorKind: "user", content: "hi" }))).toBe(true);
    expect(
      isTranscriptMessage(msg({ authorKind: "agent", authorName: "Hermes", content: "hello" })),
    ).toBe(true);
  });

  it("drops reasoning, tool, clarify, runtime, system and empty rows", () => {
    expect(isTranscriptMessage(msg({ kind: "reasoning", content: "thinking" }))).toBe(false);
    expect(isTranscriptMessage(msg({ kind: "tool", content: "ran" }))).toBe(false);
    expect(isTranscriptMessage(msg({ kind: "clarify", content: "?" }))).toBe(false);
    expect(
      isTranscriptMessage(msg({ authorName: "Runtime activity", content: "x" })),
    ).toBe(false);
    expect(isTranscriptMessage(msg({ authorKind: "system", content: "x" }))).toBe(false);
    expect(isTranscriptMessage(msg({ content: "   " }))).toBe(false);
  });
});

describe("buildChatTranscript", () => {
  const messages: Message[] = [
    msg({ authorKind: "user", authorName: "You", content: "Hello there" }),
    msg({ kind: "reasoning", authorKind: "agent", authorName: "Hermes", content: "thinking" }),
    msg({ authorKind: "agent", authorName: "Hermes", content: "Hi, how can I help?" }),
    msg({ content: "" }),
  ];

  it("renders plain text blocks separated by blank lines", () => {
    expect(buildChatTranscript(messages, "text")).toBe(
      "You: Hello there\n\nHermes: Hi, how can I help?",
    );
  });

  it("renders markdown blocks with bold speaker headers", () => {
    expect(buildChatTranscript(messages, "markdown")).toBe(
      "**You:**\n\nHello there\n\n**Hermes:**\n\nHi, how can I help?",
    );
  });

  it("returns an empty string when there is nothing to copy", () => {
    expect(buildChatTranscript([msg({ kind: "tool", content: "ran" })], "text")).toBe("");
  });
});
