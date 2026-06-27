import type { RuntimeStreamEvent } from "../runtime/hermes-runtime";
import type { RuntimeEvent } from "./appTypes";

export interface TokenUsage {
  promptTokens: number;
  totalTokens: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}

export type RuntimeEventInput = Omit<RuntimeEvent, "id" | "createdAt">;

export interface StreamRuntimeEventLabels {
  started: string;
  failed: string;
  completed: string;
}

export function appendRuntimeEvent(
  current: RuntimeEvent[],
  event: RuntimeEventInput,
  options: { now?: number; random?: string } = {},
): RuntimeEvent[] {
  const now = options.now ?? Date.now();
  const random = options.random ?? Math.random().toString(16).slice(2);
  return [
    {
      id: `event-${now}-${random}`,
      createdAt: now,
      ...event,
    },
    ...current,
  ].slice(0, 20);
}

export function parseTokenUsageEvent(event: RuntimeStreamEvent): TokenUsage | null {
  if (event.kind !== "usage") return null;
  const promptTokens = Number(event.content) || 0;
  const totalTokens = Number(event.message) || 0;
  const [cacheReadRaw, cacheWriteRaw] = (event.delta || "").split(",");
  const cacheReadTokens = Number(cacheReadRaw) || 0;
  const cacheWriteTokens = Number(cacheWriteRaw) || 0;
  if (promptTokens <= 0 && totalTokens <= 0) return null;
  return {
    promptTokens,
    totalTokens,
    cacheReadTokens: cacheReadTokens > 0 ? cacheReadTokens : undefined,
    cacheWriteTokens: cacheWriteTokens > 0 ? cacheWriteTokens : undefined,
  };
}

export function streamRuntimeEvent(
  event: RuntimeStreamEvent,
  labels: StreamRuntimeEventLabels,
): RuntimeEventInput | null {
  if (event.kind === "start") {
    return {
      taskId: event.taskId,
      label: "stream",
      detail: labels.started,
      level: "info",
    };
  }
  if (event.kind === "error") {
    return {
      taskId: event.taskId,
      label: "stream error",
      detail: event.message || labels.failed,
      level: "warning",
    };
  }
  if (event.kind === "done") {
    return {
      taskId: event.taskId,
      label: "stream done",
      detail: labels.completed,
      level: "ok",
    };
  }
  return null;
}

