import { FolderOpen, History, Plus } from "lucide-react";
import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";

function folderName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export function SessionsView({
  sessions,
  formatTime,
  onNewChat,
  onRestore,
}: {
  sessions: HermesTeamSessionSummary[];
  formatTime: (timestamp: number) => string;
  onNewChat: () => void;
  onRestore: (session: HermesTeamSessionSummary) => void;
}) {
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
          </div>
          <div className="mini-list">
            {sessions.length > 0 ? (
              sessions.map((session) => (
                <article key={session.id}>
                  <div>
                    <strong>{session.title}</strong>
                    <span>
                      {formatTime(session.updatedAt)} · {session.messageCount} messages
                    </span>
                    {session.contextFolder && (
                      <span className="session-context-folder" title={session.contextFolder}>
                        <FolderOpen size={12} />
                        {folderName(session.contextFolder)}
                      </span>
                    )}
                  </div>
                  <div className="mini-actions">
                    <button type="button" onClick={() => onRestore(session)}>
                      恢复
                    </button>
                  </div>
                </article>
              ))
            ) : (
              <p className="empty-note">还没有会话。发送第一条消息后会自动保存。</p>
            )}
          </div>
        </section>
      </div>
    </>
  );
}
