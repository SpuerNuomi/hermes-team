import type { HermesStateMessage, HermesStateSessionSummary, HermesTeamSessionSummary } from "../runtime/hermes-runtime";
import type { OrchestrationState } from "../core/orchestrator";
import type { WorkspaceMode } from "../core/types";
import type { TranslateFn } from "./appTypes";
import {
  buildFreshOrchestrationState,
  buildStateFromHermesStateSession,
  hasActiveSessionTasks,
  isScratchSession,
  normalizeLoadedState,
} from "./sessionState";

export interface SessionStateTransition {
  previousWorkspaceId: string;
  nextState: OrchestrationState;
}

export type NewSessionPlan =
  | { kind: "blocked-active-tasks" }
  | { kind: "scratch" }
  | ({ kind: "open" } & SessionStateTransition);

export type RestoreSessionPlan =
  | { kind: "missing-state" }
  | ({ kind: "restore" } & SessionStateTransition);

export type DeleteSessionsPlan =
  | { kind: "empty"; ids: string[] }
  | { kind: "blocked-active-tasks"; ids: string[] }
  | { kind: "delete-only"; ids: string[]; removedIds: Set<string> }
  | ({ kind: "delete-and-reset"; ids: string[]; removedIds: Set<string> } & SessionStateTransition);

export function planNewSession(
  currentState: OrchestrationState,
  workspaceMode: WorkspaceMode,
): NewSessionPlan {
  if (hasActiveSessionTasks(currentState)) return { kind: "blocked-active-tasks" };
  if (isScratchSession(currentState)) return { kind: "scratch" };
  return {
    kind: "open",
    previousWorkspaceId: currentState.workspace.id,
    nextState: buildFreshOrchestrationState(workspaceMode),
  };
}

export function planSessionRestore(
  currentState: OrchestrationState,
  session: HermesTeamSessionSummary,
): RestoreSessionPlan {
  if (!session.state || !session.state.workspace) return { kind: "missing-state" };
  return {
    kind: "restore",
    previousWorkspaceId: currentState.workspace.id,
    nextState: normalizeLoadedState(session.state),
  };
}

export function planImportedSession(
  currentState: OrchestrationState,
  session: HermesStateSessionSummary,
  rows: HermesStateMessage[],
  workspaceMode: WorkspaceMode,
  t: TranslateFn,
): SessionStateTransition {
  return {
    previousWorkspaceId: currentState.workspace.id,
    nextState: buildStateFromHermesStateSession(session, rows, workspaceMode, t),
  };
}

export function normalizeSessionIds(sessionIds: string[]): string[] {
  return Array.from(new Set(sessionIds.map((id) => id.trim()).filter(Boolean)));
}

export function planSessionDeletion(
  currentState: OrchestrationState,
  sessionIds: string[],
  workspaceMode: WorkspaceMode,
): DeleteSessionsPlan {
  const ids = normalizeSessionIds(sessionIds);
  if (ids.length === 0) return { kind: "empty", ids };
  if (ids.includes(currentState.workspace.id) && hasActiveSessionTasks(currentState)) {
    return { kind: "blocked-active-tasks", ids };
  }

  const removedIds = new Set(ids);
  if (!removedIds.has(currentState.workspace.id)) {
    return { kind: "delete-only", ids, removedIds };
  }

  return {
    kind: "delete-and-reset",
    ids,
    removedIds,
    previousWorkspaceId: currentState.workspace.id,
    nextState: buildFreshOrchestrationState(workspaceMode),
  };
}
