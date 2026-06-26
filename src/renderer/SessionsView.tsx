import { Check, Database, FolderOpen, History, Pencil, Plus, RefreshCw, Search, Trash2, X } from "lucide-react";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  HermesStateSearchResult,
  HermesStateSessionSummary,
  HermesTeamSessionSummary,
} from "../runtime/hermes-runtime";

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
  desktopSessions: HermesStateSessionSummary[];
  desktopBusy: boolean;
  onRefreshDesktopSessions: () => void;
  onSearchDesktopSessions: (query: string) => Promise<HermesStateSearchResult[]>;
  onImportDesktopSession: (session: HermesStateSessionSummary) => void;
}) {
  const [query, setQuery] = useState("");
  const [editingSessionId, setEditingSessionId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState("");
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [desktopResults, setDesktopResults] = useState<HermesStateSearchResult[]>([]);
  const [desktopSearching, setDesktopSearching] = useState(false);
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

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="panel-label">Sessions</p>
          <h1>会话</h1>
          <p>恢复历史聊天，或开始一个新的 Hermes 会话。</p>
        </div>
        <div className="status-card">
          <History size={18} />
          <span>{sessions.length} 条记录</span>
        </div>
      </header>
      <div className="settings-content">
        <section className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div>
              <p className="panel-label">History</p>
              <h2>聊天历史</h2>
            </div>
            <button className="refresh-runtime" type="button" onClick={onNewChat}>
              <Plus size={14} />
              <span>新建聊天</span>
            </button>
            <button className="refresh-runtime" type="button" onClick={onRefresh}>
              <RefreshCw size={14} />
              <span>刷新</span>
            </button>
          </div>
          <label className="session-search">
            <Search size={15} />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="搜索标题、消息或文件夹"
              aria-label="搜索会话"
            />
            {query && (
              <button type="button" onClick={() => setQuery("")} aria-label="清除搜索">
                <X size={13} />
              </button>
            )}
          </label>
          <div className="mini-list">
            {sessions.length === 0 ? (
              <p className="empty-note">还没有会话。发送第一条消息后会自动保存。</p>
            ) : visibleSessions.length > 0 ? (
              visibleSessions.map((session) => (
                <article key={session.id}>
                  <div>
                    {editingSessionId === session.id ? (
                      <input
                        className="session-title-input"
                        value={editingTitle}
                        onChange={(event) => setEditingTitle(event.target.value)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter") confirmRename(session.id);
                          if (event.key === "Escape") cancelRename();
                        }}
                        aria-label="Session 标题"
                        autoFocus
                      />
                    ) : (
                      <strong>{session.title}</strong>
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
                      <span className="session-delete-warning">确认删除这个会话？</span>
                    )}
                  </div>
                  <div className="mini-actions">
                    {editingSessionId === session.id ? (
                      <>
                        <button type="button" onClick={() => confirmRename(session.id)}>
                          <Check size={13} />
                          <span>保存</span>
                        </button>
                        <button type="button" onClick={cancelRename}>
                          <X size={13} />
                          <span>取消</span>
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
                          <span>删除</span>
                        </button>
                        <button type="button" onClick={() => setPendingDeleteId(null)}>
                          <X size={13} />
                          <span>取消</span>
                        </button>
                      </>
                    ) : (
                      <>
                        <button type="button" onClick={() => onRestore(session)}>
                          恢复
                        </button>
                        <button type="button" onClick={() => startRename(session)} title="重命名">
                          <Pencil size={13} />
                          <span>重命名</span>
                        </button>
                        <button
                          className="danger-action"
                          type="button"
                          onClick={() => {
                            setEditingSessionId(null);
                            setPendingDeleteId(session.id);
                          }}
                          title="删除"
                        >
                          <Trash2 size={13} />
                          <span>删除</span>
                        </button>
                      </>
                    )}
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-note">没有匹配的会话。</p>
            )}
          </div>
        </section>
        <section className="settings-card settings-card-wide">
          <div className="settings-card-head">
            <div>
              <p className="panel-label">state.db</p>
              <h2>本地历史</h2>
            </div>
            <button className="refresh-runtime" type="button" onClick={onRefreshDesktopSessions} disabled={desktopBusy}>
              <Database size={14} />
              <span>{desktopBusy ? "读取中" : "刷新 state.db"}</span>
            </button>
          </div>
          {trimmedQuery ? (
            <div className="mini-list">
              {desktopSearching ? (
                <p className="empty-note">正在全文检索 state.db…</p>
              ) : desktopResults.length === 0 ? (
                <p className="empty-note">state.db 中没有匹配「{trimmedQuery}」的会话。</p>
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
                        导入
                      </button>
                    </div>
                  </article>
                ))
              )}
            </div>
          ) : (
            <div className="mini-list">
              {desktopSessions.length === 0 ? (
                <p className="empty-note">没有读取到本地 state.db 会话。</p>
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
                        导入
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
