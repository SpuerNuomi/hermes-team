import { FolderOpen } from "lucide-react";
import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

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
  const recentSessions = sessions.slice(0, 5);
  const projectGroups = new Map<string, HermesTeamSessionSummary[]>();
  const chatSessions: HermesTeamSessionSummary[] = [];

  for (const session of recentSessions) {
    const folder = session.contextFolder?.trim();
    if (!folder) {
      chatSessions.push(session);
      continue;
    }
    projectGroups.set(folder, [...(projectGroups.get(folder) ?? []), session]);
  }

  const renderSession = (session: HermesTeamSessionSummary) => (
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
  );

  return (
    <section className="sidebar-panel sidebar-recent">
      <div className="sidebar-section-head">
        <p className="panel-label">最近会话</p>
        <button type="button" onClick={onShowAll}>
          全部
        </button>
      </div>
      <div className="sidebar-recent-list">
        {recentSessions.length > 0 ? (
          <>
            {Array.from(projectGroups.entries()).map(([folder, projectSessions]) => (
              <div className="recent-project-group" key={folder}>
                <div className="recent-project-head" title={folder}>
                  <FolderOpen size={13} />
                  <span>{folderName(folder)}</span>
                </div>
                {projectSessions.map(renderSession)}
              </div>
            ))}
            {chatSessions.length > 0 && (
              <div className="recent-project-group">
                {projectGroups.size > 0 && <div className="recent-chat-head">Chats</div>}
                {chatSessions.map(renderSession)}
              </div>
            )}
          </>
        ) : (
          <p className="empty-note">还没有历史聊天。</p>
        )}
      </div>
    </section>
  );
}
