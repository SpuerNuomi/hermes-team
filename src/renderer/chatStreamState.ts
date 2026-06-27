import type { OrchestrationState } from "../core/orchestrator";
import type { Message } from "../core/types";
import type { RuntimeStreamEvent } from "../runtime/hermes-runtime";

export interface StreamStateLabels {
  generating: string;
  unknownAgentName?: string;
  completeDoneTask?: boolean;
}

export function upsertProcessMessageBeforeAnswer(
  messages: Message[],
  processMessage: Message,
  answerPlaceholder: Message,
  answerMessageId: string,
): Message[] {
  const processExists = messages.some((message) => message.id === processMessage.id);
  const answerExists = messages.some((message) => message.id === answerMessageId);
  if (processExists) {
    return messages.map((message) => (message.id === processMessage.id ? processMessage : message));
  }
  if (answerExists) {
    const nextMessages: Message[] = [];
    for (const message of messages) {
      if (message.id === answerMessageId) nextMessages.push(processMessage);
      nextMessages.push(message);
    }
    return nextMessages;
  }
  return [...messages, processMessage, answerPlaceholder];
}

export function parseClarifyChoices(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  try {
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return parsed
        .map((item) => String(item).trim())
        .filter((item) => item.length > 0)
        .slice(0, 4);
    }
  } catch {
    // Not JSON. The caller will render a free-text clarify card.
  }
  return [];
}

function normalizeProcessText(value: string): string {
  return value.replace(/\s+/g, " ").trim();
}

export function isDuplicateProcessSnapshot(processText: string, answerText: string): boolean {
  const process = normalizeProcessText(processText);
  const answer = normalizeProcessText(answerText);
  return Boolean(
    process &&
      answer &&
      (process === answer || process.startsWith(answer) || answer.startsWith(process)),
  );
}

export function mergeToolEventContent(existingContent: string | undefined, nextContent: string): string {
  if (!existingContent?.trim()) return nextContent;
  if (!nextContent.trim()) return existingContent;
  const existingLines = existingContent.split("\n").filter((line) => line.trim());
  const nextLines = nextContent.split("\n").filter((line) => line.trim());
  if (nextLines.length < existingLines.length) return existingContent;
  if (nextLines.length === existingLines.length && nextContent.length < existingContent.length) {
    return existingContent;
  }
  return nextContent;
}

export function applyStreamEventSnapshot(
  current: OrchestrationState,
  event: RuntimeStreamEvent,
  labels: StreamStateLabels,
): OrchestrationState {
  if (event.kind === "start" || event.kind === "error") return current;
  const task = current.tasks.find((item) => item.id === event.taskId);
  if (!task || task.status === "cancelled") return current;
  const agent = current.agents.find((item) => item.id === task.agentId);
  if (event.kind === "reasoning") {
    const isThinkingProgress = event.message === "thinking";
    const messageId = isThinkingProgress ? `reasoning-${event.taskId}-thinking` : `reasoning-${event.taskId}`;
    const existing = current.messages.find((message) => message.id === messageId);
    const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
    if (!nextContent.trim()) return current;
    const streamMessageId = `stream-${event.taskId}`;
    const streamExisting = current.messages.find((message) => message.id === streamMessageId);
    if (
      !isThinkingProgress &&
      streamExisting &&
      streamExisting.content !== labels.generating &&
      isDuplicateProcessSnapshot(nextContent, streamExisting.content)
    ) {
      return {
        ...current,
        messages: current.messages.filter((message) => message.id !== messageId),
      };
    }
    const nextMessage: Message = {
      id: messageId,
      workspaceId: task.workspaceId,
      kind: "reasoning",
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: nextContent,
      createdAt: existing?.createdAt ?? Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    const streamMessage: Message = {
      id: streamMessageId,
      workspaceId: task.workspaceId,
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: labels.generating,
      createdAt: Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    return {
      ...current,
      messages: upsertProcessMessageBeforeAnswer(current.messages, nextMessage, streamMessage, streamMessageId),
    };
  }
  if (event.kind === "tool") {
    const callId = event.message || "tool";
    const messageId = `tool-${event.taskId}-${callId}`;
    const existing = current.messages.find((message) => message.id === messageId);
    const nextRawContent = event.content || `${existing?.content ?? ""}${event.delta}`;
    const nextContent = mergeToolEventContent(existing?.content, nextRawContent);
    if (!nextContent.trim()) return current;
    const streamMessageId = `stream-${event.taskId}`;
    const nextMessage: Message = {
      id: messageId,
      workspaceId: task.workspaceId,
      kind: "tool",
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: nextContent,
      createdAt: existing?.createdAt ?? Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    const streamMessage: Message = {
      id: streamMessageId,
      workspaceId: task.workspaceId,
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: labels.generating,
      createdAt: Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    return {
      ...current,
      messages: upsertProcessMessageBeforeAnswer(current.messages, nextMessage, streamMessage, streamMessageId),
    };
  }
  if (event.kind === "clarify") {
    const callId = event.message || "clarify";
    const messageId = `clarify-${event.taskId}-${callId}`;
    const existing = current.messages.find((message) => message.id === messageId);
    const question = event.delta || existing?.content || "";
    if (!question.trim()) return current;
    const streamMessageId = `stream-${event.taskId}`;
    const nextMessage: Message = {
      id: messageId,
      workspaceId: task.workspaceId,
      kind: "clarify",
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: question,
      clarifyChoices: parseClarifyChoices(event.content),
      clarifyResolved: existing?.clarifyResolved ?? false,
      clarifyAnswer: existing?.clarifyAnswer,
      createdAt: existing?.createdAt ?? Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    const streamMessage: Message = {
      id: streamMessageId,
      workspaceId: task.workspaceId,
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: labels.generating,
      createdAt: Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    return {
      ...current,
      messages: upsertProcessMessageBeforeAnswer(current.messages, nextMessage, streamMessage, streamMessageId),
    };
  }

  const messageId = `stream-${event.taskId}`;
  const existing = current.messages.find((message) => message.id === messageId);
  const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
  const nextMessage: Message = {
    id: messageId,
    workspaceId: task.workspaceId,
    authorKind: "agent",
    authorId: agent?.id,
    authorName: agent?.name ?? labels.unknownAgentName ?? "Hermes",
    content: nextContent || labels.generating,
    createdAt: existing?.createdAt ?? Date.now(),
    replyToMessageId: task.triggerMessageId,
  };
  const messages = existing
    ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
    : [...current.messages, nextMessage];
  return {
    ...current,
    messages:
      event.kind === "done"
        ? messages.filter(
            (message) =>
              !(
                message.kind === "reasoning" &&
                message.id === `reasoning-${event.taskId}` &&
                message.replyToMessageId === task.triggerMessageId &&
                isDuplicateProcessSnapshot(message.content, nextMessage.content)
              ),
          )
        : messages,
    tasks:
      event.kind === "done" && labels.completeDoneTask
        ? current.tasks.map((item) =>
            item.id === task.id ? { ...item, status: "completed" as const, completedAt: Date.now() } : item,
          )
        : current.tasks,
  };
}
