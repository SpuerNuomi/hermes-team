import type { Message } from "../core/types";

export type TranscriptFormat = "text" | "markdown";

/**
 * A message belongs in the transcript only when it is a real chat bubble:
 * user/agent turns with visible text. Reasoning, tool, clarify, runtime
 * activity and empty rows are process detail, not conversation, so they are
 * left out of the copied transcript.
 */
export function isTranscriptMessage(message: Message): boolean {
  if (message.kind && message.kind !== "message") return false;
  if (message.authorKind === "system") return false;
  if (message.authorName === "Runtime activity") return false;
  return message.content.trim().length > 0;
}

function speakerLabel(message: Message): string {
  if (message.authorKind === "user") return "You";
  return message.authorName?.trim() || "Hermes";
}

/**
 * Serialise a conversation into a clipboard-ready transcript.
 *
 * - `text`     → plain `You: …` / `Hermes: …` blocks.
 * - `markdown` → `**You:**` / `**Hermes:**` headed blocks.
 *
 * Blocks are separated by a blank line. Exported for unit testing.
 */
export function buildChatTranscript(
  messages: Message[],
  format: TranscriptFormat,
): string {
  return messages
    .filter(isTranscriptMessage)
    .map((message) => {
      const speaker = speakerLabel(message);
      const content = message.content.trim();
      return format === "markdown"
        ? `**${speaker}:**\n\n${content}`
        : `${speaker}: ${content}`;
    })
    .join("\n\n");
}

/** Resolve current text selection as a trimmed string (empty when none). */
export function currentSelectionText(): string {
  return (window.getSelection()?.toString() ?? "").trim();
}

/** Shared clipboard write that resolves/rejects so callers can show feedback. */
export function copyTextToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.reject(new Error("clipboard unavailable"));
}
