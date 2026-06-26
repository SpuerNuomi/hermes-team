import { FolderOpen, MoreHorizontal, Pin } from "lucide-react";
import { useMemo, useState } from "react";
import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";
import type { SessionProject } from "./SessionMoveMenu";
import { SidebarSessionMenu, type SidebarMenuTarget } from "./SidebarSessionMenu";

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export function SidebarRecentSessions({
  sessions,
  formatTime,
  onRestore,
  onShowAll,
  onTogglePin,
  onMoveToFolder,
  onPickFolder,
}: {
  sessions: HermesTeamSessionSummary[];
  formatTime: (timestamp: number) => string;
  onRestore: (session: HermesTeamSessionSummary) => void;
  onShowAll: () => void;
  onTogglePin: (sessionId: string) => void;
  onMoveToFolder: (sessionId: string, folder: string | null) => void;
  onPickFolder: (sessionId: string) => void;
}) {
  const [menuTarget, setMenuTarget] = useState<SidebarMenuTarget | null>(null);

  const pinnedSessions = sessions.filter((session) => session.pinned);
  const recentSessions = sessions.filter((session) => !session.pinned).slice(0, 5);

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

  const openMenu = (session: HermesTeamSessionSummary, x: number, y: number) => {
    setMenuTarget({
      id: session.id,
      title: session.title,
      contextFolder: session.contextFolder ?? null,
      x,
      y,
    });
  };

  const renderSession = (session: HermesTeamSessionSummary) => (
    <div
      className="recent-session"
      key={session.id}
      role="button"
      tabIndex={0}
      onClick={() => onRestore(session)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onRestore(session);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        openMenu(session, event.clientX, event.clientY);
      }}
    >
      <div className="recent-session-main">
        <strong>
          {session.pinned && <Pin size={11} className="recent-session-pin" />}
          {session.title}
        </strong>
        <span>
          {formatTime(session.updatedAt)} · {session.messageCount} messages
        </span>
      </div>
      <button
        type="button"
        className="recent-session-options"
        aria-label="会话操作"
        title="会话操作"
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenu(session, rect.right, rect.bottom + 4);
        }}
      >
        <MoreHorizontal size={15} />
      </button>
    </div>
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
        {pinnedSessions.length === 0 && recentSessions.length === 0 ? (
          <p className="empty-note">还没有历史聊天。</p>
        ) : (
          <>
            {pinnedSessions.length > 0 && (
              <div className="recent-project-group">
                <div className="recent-chat-head recent-pinned-head">
                  <Pin size={12} />
                  <span>置顶</span>
                </div>
                {pinnedSessions.map(renderSession)}
              </div>
            )}
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
                {(projectGroups.size > 0 || pinnedSessions.length > 0) && (
                  <div className="recent-chat-head">Chats</div>
                )}
                {chatSessions.map(renderSession)}
              </div>
            )}
          </>
        )}
      </div>
      {menuTarget && (
        <SidebarSessionMenu
          target={menuTarget}
          isPinned={pinnedSessions.some((session) => session.id === menuTarget.id)}
          projects={projects}
          onClose={() => setMenuTarget(null)}
          onTogglePin={() => onTogglePin(menuTarget.id)}
          onMove={(folder) => onMoveToFolder(menuTarget.id, folder)}
          onPickFolder={() => onPickFolder(menuTarget.id)}
        />
      )}
    </section>
  );
}
