import {
  Check,
  CheckSquare,
  Database,
  FolderInput,
  FolderOpen,
  History,
  Pencil,
  Pin,
  PinOff,
  Plus,
  RefreshCw,
  Search,
  Square,
  Trash2,
  X,
} from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  HermesStateSearchResult,
  HermesStateSessionSummary,
  HermesTeamSessionSummary,
} from "../runtime/hermes-runtime";
import { useTranslation } from "../i18n";
import { SessionMoveMenu, type SessionProject } from "./SessionMoveMenu";

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export function SessionsView({
  sessions,
  formatTime,
  onNewChat,
  onRestore,
  onRefresh,
  onRename,
  onDelete,
  onBulkDelete,
  onTogglePin,
  onMoveToFolder,
  onPickFolder,
  desktopSessions,
  desktopBusy,
  onRefreshDesktopSessions,
  onSearchDesktopSessions,
  onImportDesktopSession,
}: {
  sessions: HermesTeamSessionSummary[];
  formatTime: (timestamp: number) => string;
  onNewChat: () => void;
  onRestore: (session: HermesTeamSessionSummary) => void;
  onRefresh: () => void;
  onRename: (sessionId: string, title: string) => void;
  onDelete: (sessionId: string) => void;
  onBulkDelete: (sessionIds: string[]) => void;
  onTogglePin: (sessionId: string) => void;
  onMoveToFolder: (sessionId: string, folder: string | null) => void;
  onPickFolder: (sessionId: string) => void;
  desktopSessions: HermesStateSessionSummary[];
  desktopBusy: boolean;
  onRefreshDesktopSessions: () => void;
  onSearchDesktopSessions: (query: string) => Promise<HermesStateSearchResult[]>;
  onImportDesktopSession: (session: HermesStateSessionSummary) => void;
}) {
  const t = useTranslation();
  const [query, setQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [desktopResults, setDesktopResults] = useState<HermesStateSearchResult[]>([]);
  const [desktopSearching, setDesktopSearching] = useState(false);
  const [selectMode, setSelectMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(() => new Set());
  const [pendingBulkDelete, setPendingBulkDelete] = useState(false);
  const [moveMenuId, setMoveMenuId] = useState<string | null>(null);
  const normalizedQuery = query.trim().toLowerCase();
  const trimmedQuery = query.trim();
  const searchDesktopRef = useRef(onSearchDesktopSessions);
  searchDesktopRef.current = onSearchDesktopSessions;
  const visibleSessions = useMemo(
    () =>
      normalizedQuery
        ? sessions.filter((session) => sessionMatchesQuery(session, normalizedQuery))
        : sessions,
    [normalizedQuery, sessions],
  );

  const projects = useMemo<SessionProject[]>(() => {
    const byPath = new Map<string, SessionProject>();
    for (const session of sessions) {
      const folder = session.contextFolder?.trim();
      if (folder && !byPath.has(folder)) {
        byPath.set(folder, { path: folder, name: folderName(folder) });
      }
    }
    return Array.from(byPath.values());
  }, [sessions]);

  // Keep selection in sync with the available sessions (e.g. after deletes).
  useEffect(() => {
    setSelectedIds((current) => {
      if (current.size === 0) return current;
      const valid = new Set(sessions.map((session) => session.id));
      let changed = false;
      const next = new Set<string>();
      for (const id of current) {
        if (valid.has(id)) next.add(id);
        else changed = true;
      }
      return changed ? next : current;
    });
  }, [sessions]);

  // Full-text search over the profile's state.db (FTS5 when available), debounced
  // so we don't fire a sqlite query on every keystroke.
  useEffect(() => {
    if (!trimmedQuery) {
      setDesktopResults([]);
      setDesktopSearching(false);
      return;
    }
    let cancelled = false;
    setDesktopSearching(true);
    const handle = window.setTimeout(() => {
      searchDesktopRef
        .current(trimmedQuery)
        .then((items) => {
          if (!cancelled) setDesktopResults(items);
        })
        .catch(() => {
          if (!cancelled) setDesktopResults([]);
        })
        .finally(() => {
          if (!cancelled) setDesktopSearching(false);
        });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(handle);
    };
  }, [trimmedQuery]);

  const startRename = (session: HermesTeamSessionSummary) => {
    setPendingDeleteId(null);
    setEditingSessionId(session.id);
    setEditingTitle(session.title);
  };

  const confirmRename = (sessionId: string) => {
    const nextTitle = editingTitle.trim();
    if (nextTitle) onRename(sessionId, nextTitle);
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const cancelRename = () => {
    setEditingSessionId(null);
    setEditingTitle("");
  };

  const toggleSelectMode = () => {
    setSelectMode((current) => {
      const next = !current;
      if (!next) {
        setSelectedIds(new Set());
        setPendingBulkDelete(false);
      } else {
        setEditingSessionId(null);
        setPendingDeleteId(null);
        setMoveMenuId(null);
      }
      return next;
    });
  };

  const toggleSelected = (sessionId: string) => {
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(sessionId)) next.delete(sessionId);
      else next.add(sessionId);
      return next;
    });
  };

  const visibleIds = visibleSessions.map((session) => session.id);
  const allVisibleSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.has(id));

  const toggleSelectAll = () => {
    setSelectedIds((current) => {
      if (allVisibleSelected) {
        const next = new Set(current);
        for (const id of visibleIds) next.delete(id);
        return next;
      }
      const next = new Set(current);
      for (const id of visibleIds) next.add(id);
      return next;
    });
  };

  const confirmBulkDelete = () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    onBulkDelete(ids);
    setSelectedIds(new Set());
    setPendingBulkDelete(false);
    setSelectMode(false);
  };

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="panel-label">Sessions</p>
          <h1>{t("sessionsView.title")}</h1>
          <p>{t("sessionsView.subtitle")}</p>
        </div>
        <div className="status-card">
          <History size={18} />
          <span>{t("sessionsView.recordCount", { count: sessions.length })}</span>
        </div>
      </header>
      <div className="settings-content">
        <section className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div>
              <p className="panel-label">History</p>
              <h2>{t("sessionsView.chatHistory")}</h2>
            </div>
            <button className="refresh-runtime" type="button" onClick={onNewChat}>
              <Plus size={14} />
              <span>{t("nav.newChat")}</span>
            </button>
            <button
              className={`refresh-runtime ${selectMode ? "is-active" : ""}`}
              type="button"
              onClick={toggleSelectMode}
              disabled={sessions.length === 0}
            >
              <CheckSquare size={14} />
              <span>{selectMode ? t("sessionsView.exitSelect") : t("sessionsView.select")}</span>
            </button>
            <button className="refresh-runtime" type="button" onClick={onRefresh}>
              <RefreshCw size={14} />
              <span>{t("common.refresh")}</span>
            </button>
          </div>
          <label className="session-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder={t("sessionsView.searchPlaceholder")}
              aria-label={t("sessionsView.searchAria")}
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label={t("sessionsView.clearSearch")}>
                <X size={13} />
              </button>
            )}
          </label>
          {selectMode && (
            <div className="session-bulk-bar">
              <button type="button" onClick={toggleSelectAll} disabled={visibleIds.length === 0}>
                {allVisibleSelected ? <CheckSquare size={14} /> : <Square size={14} />}
                <span>{allVisibleSelected ? t("sessionsView.deselectAll") : t("sessionsView.selectAll")}</span>
              </button>
              <span className="session-bulk-count">{t("sessionsView.selectedCount", { count: selectedIds.size })}</span>
              {pendingBulkDelete ? (
                <>
                  <span className="session-delete-warning">{t("sessionsView.confirmBulkDelete", { count: selectedIds.size })}</span>
                  <button className="danger-action" type="button" onClick={confirmBulkDelete}>
                    <Trash2 size={13} />
                    <span>{t("sessionsView.delete")}</span>
                  </button>
                  <button type="button" onClick={() => setPendingBulkDelete(false)}>
                    <X size={13} />
                    <span>{t("common.cancel")}</span>
                  </button>
                </>
              ) : (
                <button
                  className="danger-action"
                  type="button"
                  onClick={() => setPendingBulkDelete(true)}
                  disabled={selectedIds.size === 0}
                >
                  <Trash2 size={13} />
                  <span>{t("sessionsView.deleteSelected")}</span>
                </button>
              )}
            </div>
          )}
          <div className="mini-list">
            {sessions.length === 0 ? (
              <p className="empty-note">{t("sessionsView.emptyNote")}</p>
            ) : visibleSessions.length > 0 ? (
              visibleSessions.map((session) => (
                <article
                  key={session.id}
                  className={`${session.pinned ? "session-pinned" : ""} ${
                    selectMode && selectedIds.has(session.id) ? "session-selected" : ""
                  }`}
                >
                  {selectMode && (
                    <button
                      type="button"
                      className="session-select-toggle"
                      onClick={() => toggleSelected(session.id)}
                      aria-label={selectedIds.has(session.id) ? t("sessionsView.deselect") : t("sessionsView.selectSession")}
                    >
                      {selectedIds.has(session.id) ? (
                        <CheckSquare size={18} />
                      ) : (
                        <Square size={18} />
                      )}
                    </button>
                  )}
                  <div className="session-card-body">
                    {editingSessionId === session.id ? (
                      <input
                        className="session-title-input"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") confirmRename(session.id);
                          if (event.key === "Escape") cancelRename();
                        }}
                        aria-label={t("sessionsView.titleAria")}
                        autoFocus
                      />
                    ) : (
                      <strong className="session-title-row">
                        {session.pinned && (
                          <Pin size={12} className="session-pin-badge" aria-label={t("sessions.pinned")} />
                        )}
                        {session.title}
                      </strong>
                    )}
                    <span>
                      {formatTime(session.updatedAt)} · {session.messageCount} messages
                    </span>
                    {session.contextFolder && (
                      <span className="session-context-folder" title={session.contextFolder}>
                        <FolderOpen size={12} />
                        {folderName(session.contextFolder)}
                      </span>
                    )}
                    {pendingDeleteId === session.id && (
                      <span className="session-delete-warning">{t("sessionsView.confirmDeleteOne")}</span>
                    )}
                  </div>
                  {!selectMode && (
                    <div className="mini-actions">
                      {editingSessionId === session.id ? (
                        <>
                          <button type="button" onClick={() => confirmRename(session.id)}>
                            <Check size={13} />
                            <span>{t("common.save")}</span>
                          </button>
                          <button type="button" onClick={cancelRename}>
                            <X size={13} />
                            <span>{t("common.cancel")}</span>
                          </button>
                        </>
                      ) : pendingDeleteId === session.id ? (
                        <>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => {
                              onDelete(session.id);
                              setPendingDeleteId(null);
                            }}
                          >
                            <Trash2 size={13} />
                            <span>{t("sessionsView.delete")}</span>
                          </button>
                          <button type="button" onClick={() => setPendingDeleteId(null)}>
                            <X size={13} />
                            <span>{t("common.cancel")}</span>
                          </button>
                        </>
                      ) : (
                        <>
                          <button type="button" onClick={() => onRestore(session)}>
                            {t("sessionsView.restore")}
                          </button>
                          <button
                            type="button"
                            onClick={() => onTogglePin(session.id)}
                            title={session.pinned ? t("sessions.unpin") : t("sessions.pin")}
                          >
                            {session.pinned ? <PinOff size={13} /> : <Pin size={13} />}
                            <span>{session.pinned ? t("sessions.unpin") : t("sessions.pin")}</span>
                          </button>
                          <div className="session-move-wrap">
                            <button
                              type="button"
                              onClick={() =>
                                setMoveMenuId((current) =>
                                  current === session.id ? null : session.id,
                                )
                              }
                              title={t("sessions.moveToGroup")}
                            >
                              <FolderInput size={13} />
                              <span>{t("sessionsView.move")}</span>
                            </button>
                            {moveMenuId === session.id && (
                              <SessionMoveMenu
                                projects={projects}
                                currentFolder={session.contextFolder ?? null}
                                onClose={() => setMoveMenuId(null)}
                                onMove={(folder) => {
                                  onMoveToFolder(session.id, folder);
                                  setMoveMenuId(null);
                                }}
                                onPickFolder={() => {
                                  onPickFolder(session.id);
                                  setMoveMenuId(null);
                                }}
                              />
                            )}
                          </div>
                          <button type="button" onClick={() => startRename(session)} title={t("sessionsView.rename")}>
                            <Pencil size={13} />
                            <span>{t("sessionsView.rename")}</span>
                          </button>
                          <button
                            className="danger-action"
                            type="button"
                            onClick={() => {
                              setEditingSessionId(null);
                              setPendingDeleteId(session.id);
                            }}
                            title={t("sessionsView.delete")}
                          >
                            <Trash2 size={13} />
                            <span>{t("sessionsView.delete")}</span>
                          </button>
                        </>
                      )}
                    </div>
                  )}
                </article>
              ))
            ) : (
              <p className="empty-note">{t("sessionsView.noMatch")}</p>
            )}
          </div>
        </section>
        <section className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div>
              <p className="panel-label">state.db</p>
              <h2>{t("sessionsView.localHistory")}</h2>
            </div>
            <button className="refresh-runtime" type="button" onClick={onRefreshDesktopSessions} disabled={desktopBusy}>
              <Database size={14} />
              <span>{desktopBusy ? t("sessionsView.reading") : t("sessionsView.refreshStateDb")}</span>
            </button>
          </div>
          {trimmedQuery ? (
            <div className="mini-list">
              {desktopSearching ? (
                <p className="empty-note">{t("sessionsView.fullTextSearching")}</p>
              ) : desktopResults.length === 0 ? (
                <p className="empty-note">{t("sessionsView.stateDbNoMatch", { query: trimmedQuery })}</p>
              ) : (
                desktopResults.map((result) => (
                  <article key={`${result.profile}-${result.id}`}>
                    <div>
                      <strong>{result.title}</strong>
                      <span>
                        {formatTime(normalizeSessionTime(result.startedAt))} · {result.messageCount} messages · {result.profile}
                      </span>
                      {result.snippet && (
                        <span className="session-search-snippet">{renderSnippet(result.snippet)}</span>
                      )}
                    </div>
                    <div className="mini-actions">
                      <button
                        type="button"
                        onClick={() =>
                          onImportDesktopSession({
                            id: result.id,
                            title: result.title,
                            startedAt: result.startedAt,
                            endedAt: null,
                            messageCount: result.messageCount,
                            model: result.model,
                            preview: result.snippet,
                            profile: result.profile,
                          })
                        }
                      >
                        {t("sessionsView.import")}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="mini-list">
              {desktopSessions.length === 0 ? (
                <p className="empty-note">{t("sessionsView.noLocalStateDb")}</p>
              ) : (
                desktopSessions.slice(0, 30).map((session) => (
                  <article key={`${session.profile}-${session.id}`}>
                    <div>
                      <strong>{session.title}</strong>
                      <span>
                        {formatTime(normalizeSessionTime(session.startedAt))} · {session.messageCount} messages · {session.profile}
                      </span>
                      {session.preview && <span>{session.preview}</span>}
                    </div>
                    <div className="mini-actions">
                      <button type="button" onClick={() => onImportDesktopSession(session)}>
                        {t("sessionsView.import")}
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          )}
        </section>
      </div>
    </>
  );
}

function normalizeSessionTime(value: number): number {
  return value > 0 && value < 10_000_000_000 ? value * 1000 : value;
}

/**
 * Render a search snippet, highlighting the matched terms that the backend
 * wrapped in «» (both the FTS5 `snippet()` output and the LIKE fallback use
 * these markers).
 */
function renderSnippet(snippet: string) {
  const parts = snippet.split(/«([^»]*)»/g);
  return parts.map((part, index) =>
    index % 2 === 1 ? (
      <mark key={index} className="session-search-hit">
        {part}
      </mark>
    ) : (
      <Fragment key={index}>{part}</Fragment>
    ),
  );
}

function sessionMatchesQuery(session: HermesTeamSessionSummary, query: string): boolean {
  if (session.title.toLowerCase().includes(query)) return true;
  if (session.contextFolder?.toLowerCase().includes(query)) return true;
  return session.state.messages.some((message) => {
    if (message.content.toLowerCase().includes(query)) return true;
    return message.attachments?.some(
      (attachment) =>
        attachment.name.toLowerCase().includes(query) ||
        attachment.path?.toLowerCase().includes(query) ||
        attachment.text?.toLowerCase().includes(query) ||
        attachment.mime?.toLowerCase().includes(query),
    );
  });
}
