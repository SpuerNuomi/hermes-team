import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";

export function SidebarRecentSessions({
  sessions,
  formatTime,
  onRestore,
  onShowAll,
}: {
  sessions: HermesTeamSessionSummary[];
  formatTime: (timestamp: number) => string;
  onRestore: (session: HermesTeamSessionSummary) => void;
  onShowAll: () => void;
}) {
  return (
    <section className="sidebar-panel sidebar-recent">
      <div className="sidebar-section-head">
        <p className="panel-label">最近会话</p>
        <button type="button" onClick={onShowAll}>
          全部
        </button>
      </div>
      <div className="sidebar-recent-list">
        {sessions.length > 0 ? (
          sessions.slice(0, 5).map((session) => (
            <button
              className="recent-session"
              key={session.id}
              type="button"
              onClick={() => onRestore(session)}
            >
              <strong>{session.title}</strong>
              <span>
                {formatTime(session.updatedAt)} · {session.messageCount} messages
              </span>
            </button>
          ))
        ) : (
          <p className="empty-note">还没有历史聊天。</p>
        )}
      </div>
    </section>
  );
}
