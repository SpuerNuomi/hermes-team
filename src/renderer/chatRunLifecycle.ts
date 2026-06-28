import type { ChatRunWindowClosedEvent, HermesTeamSessionSummary } from "../runtime/hermes-runtime";

export interface ChatRunClosedTaskSummary {
  total: number;
  completed: number;
  failed: number;
  cancelled: number;
  pending: number;
  running: number;
  unfinished: number;
}

export function chatRunClosedSessionLookupId(event: ChatRunWindowClosedEvent): string | null {
  return (
    cleanId(event.sessionId) ??
    cleanId(event.chatRunId) ??
    cleanId(event.windowLabel)
  );
}

export function chatRunClosedDedupKey(event: ChatRunWindowClosedEvent): string {
  return (
    chatRunClosedSessionLookupId(event) ??
    `${event.windowLabel}:${event.title}:${event.parentSessionId ?? ""}`
  );
}

export function isChatRunClosedForWorkspace(
  event: ChatRunWindowClosedEvent,
  workspaceId: string,
): boolean {
  const parentSessionId = cleanId(event.parentSessionId);
  return parentSessionId ? parentSessionId === workspaceId : false;
}

export function summarizeChatRunSession(
  session: HermesTeamSessionSummary | null | undefined,
): ChatRunClosedTaskSummary {
  const summary: ChatRunClosedTaskSummary = {
    total: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
    pending: 0,
    running: 0,
    unfinished: 0,
  };
  for (const task of session?.state?.tasks ?? []) {
    summary.total += 1;
    if (task.status === "completed") summary.completed += 1;
    if (task.status === "failed") summary.failed += 1;
    if (task.status === "cancelled") summary.cancelled += 1;
    if (task.status === "pending") summary.pending += 1;
    if (task.status === "running") summary.running += 1;
  }
  summary.unfinished = summary.pending + summary.running;
  return summary;
}

function cleanId(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}
