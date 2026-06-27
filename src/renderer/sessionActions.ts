import {
  buildSessionSummary,
  deleteHermesTeamSession,
  deleteHermesTeamSessions,
  listHermesStateSessions,
  loadHermesStateSession,
  loadHermesTeamSessions,
  saveHermesTeamSession,
  saveHermesTeamState,
  searchHermesStateSessions,
  setHermesTeamSessionFolder,
  setHermesTeamSessionPinned,
  updateHermesTeamSessionTitle,
  type HermesStateSearchResult,
  type HermesStateSessionSummary,
  type HermesTeamSessionSummary,
} from "../runtime/hermes-runtime";
import type { OrchestrationState } from "../core/orchestrator";
import type { WorkspaceMode } from "../core/types";
import type { TranslateFn } from "./appTypes";
import { planImportedSession, type SessionStateTransition } from "./sessionLifecycle";
import { normalizeLoadedSessions, sessionSummaryForSave } from "./sessionState";

export function sessionProfileName(
  currentChatProfile: string | null | undefined,
  activeProfile: string | null | undefined,
): string {
  return currentChatProfile || activeProfile || "default";
}

export function optimisticRenameSession(
  sessions: HermesTeamSessionSummary[],
  sessionId: string,
  title: string,
): HermesTeamSessionSummary[] {
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, title, titleEdited: true } : session,
  );
}

export function optimisticRemoveSessions(
  sessions: HermesTeamSessionSummary[],
  removedIds: Set<string>,
): HermesTeamSessionSummary[] {
  return sessions.filter((session) => !removedIds.has(session.id));
}

export function optimisticPinSession(
  sessions: HermesTeamSessionSummary[],
  sessionId: string,
  pinned: boolean,
): HermesTeamSessionSummary[] {
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, pinned } : session,
  );
}

export function normalizeSessionFolder(folder: string | null): string | null {
  return folder?.trim() || null;
}

export function optimisticMoveSessionFolder(
  sessions: HermesTeamSessionSummary[],
  sessionId: string,
  folder: string | null,
): HermesTeamSessionSummary[] {
  return sessions.map((session) =>
    session.id === sessionId ? { ...session, contextFolder: folder, folderEdited: true } : session,
  );
}

export function shouldPersistSessionSnapshot(state: OrchestrationState): boolean {
  return state.messages.length > 0;
}

export function sessionSnapshotForSave(
  state: OrchestrationState,
  sessions?: HermesTeamSessionSummary[],
): HermesTeamSessionSummary {
  return sessions ? sessionSummaryForSave(state, sessions) : buildSessionSummary(state);
}

export async function saveWorkspaceState(state: OrchestrationState): Promise<void> {
  await saveHermesTeamState(state);
}

export async function saveSessionSnapshot(
  state: OrchestrationState,
  sessions?: HermesTeamSessionSummary[],
): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await saveHermesTeamSession(sessionSnapshotForSave(state, sessions)));
}

export async function loadLocalSessionList(): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await loadHermesTeamSessions());
}

export async function loadDesktopSessionList(profile: string): Promise<HermesStateSessionSummary[]> {
  return listHermesStateSessions({ profile });
}

export async function searchDesktopSessionList(
  query: string,
  profile: string,
): Promise<HermesStateSearchResult[]> {
  const trimmed = query.trim();
  if (!trimmed) return [];
  return searchHermesStateSessions({ query: trimmed, profile });
}

export async function loadImportedSessionTransition(params: {
  currentState: OrchestrationState;
  session: HermesStateSessionSummary;
  workspaceMode: WorkspaceMode;
  t: TranslateFn;
}): Promise<SessionStateTransition> {
  const rows = await loadHermesStateSession({
    profile: params.session.profile,
    sessionId: params.session.id,
  });
  return planImportedSession(
    params.currentState,
    params.session,
    rows,
    params.workspaceMode,
    params.t,
  );
}

export async function renameStoredSession(
  sessionId: string,
  title: string,
): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await updateHermesTeamSessionTitle(sessionId, title));
}

export async function deleteStoredSession(sessionId: string): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await deleteHermesTeamSession(sessionId));
}

export async function deleteStoredSessions(sessionIds: string[]): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await deleteHermesTeamSessions(sessionIds));
}

export async function setStoredSessionPinned(
  sessionId: string,
  pinned: boolean,
): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await setHermesTeamSessionPinned(sessionId, pinned));
}

export async function setStoredSessionFolder(
  sessionId: string,
  folder: string | null,
): Promise<HermesTeamSessionSummary[]> {
  return normalizeLoadedSessions(await setHermesTeamSessionFolder(sessionId, folder));
}
