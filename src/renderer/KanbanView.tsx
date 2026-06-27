import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  Ban,
  Check,
  ChevronDown,
  CircleSlash,
  Clock,
  MessageSquarePlus,
  Plus,
  RefreshCw,
  Rocket,
  Undo2,
  UserPlus,
  X,
} from "lucide-react";
import type { TranslationVars } from "../i18n/types";
import {
  createKanbanTask,
  currentKanbanBoard,
  getKanbanTask,
  kanbanTaskAction,
  listKanbanBoards,
  listKanbanTasks,
  switchKanbanBoard,
  type KanbanAction,
  type KanbanBoard,
  type KanbanTask,
  type KanbanTaskDetail,
} from "../runtime/hermes-runtime";

function runtimeErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

interface KanbanViewProps {
  profile?: string;
  t: (key: string, vars?: TranslationVars) => string;
  onNotice: (message: string) => void;
}

const COLUMNS: { key: string; tone: string }[] = [
  { key: "triage", tone: "neutral" },
  { key: "todo", tone: "todo" },
  { key: "scheduled", tone: "scheduled" },
  { key: "ready", tone: "ready" },
  { key: "running", tone: "running" },
  { key: "blocked", tone: "blocked" },
  { key: "review", tone: "review" },
  { key: "done", tone: "done" },
];
const ARCHIVED_COLUMN = { key: "archived", tone: "archived" };

const POLL_INTERVAL_MS = 12000;

// Lifecycle verbs offered per source status. The CLI enforces real validity;
// invalid attempts surface their own error as a notice rather than being hidden.
const ACTIONS_BY_STATUS: Record<string, KanbanAction[]> = {
  triage: ["specify", "block", "archive"],
  todo: ["promote", "schedule", "block", "archive"],
  scheduled: ["unblock", "block", "archive"],
  ready: ["schedule", "block", "archive"],
  running: ["reclaim", "complete", "block", "archive"],
  blocked: ["unblock", "archive"],
  review: ["complete", "block", "archive"],
  done: ["archive"],
  archived: [],
};

// Verbs that take a free-text argument (reason / result / assignee / comment).
const VALUE_ACTIONS: Partial<Record<KanbanAction, string>> = {
  complete: "kanban.valuePrompt.result",
  block: "kanban.valuePrompt.reason",
  schedule: "kanban.valuePrompt.reason",
  reclaim: "kanban.valuePrompt.reason",
  assign: "kanban.valuePrompt.assignee",
  comment: "kanban.valuePrompt.comment",
};

export function KanbanView({ profile, t, onNotice }: KanbanViewProps) {
  const [boards, setBoards] = useState<KanbanBoard[]>([]);
  const [currentSlug, setCurrentSlug] = useState<string>("");
  const [tasks, setTasks] = useState<KanbanTask[]>([]);
  const [showArchived, setShowArchived] = useState(false);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<KanbanTaskDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [boardMenuOpen, setBoardMenuOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [createTitle, setCreateTitle] = useState("");
  const [createBody, setCreateBody] = useState("");
  const [actionInput, setActionInput] = useState<{ action: KanbanAction; value: string } | null>(null);

  const profileRef = useRef(profile);
  profileRef.current = profile;

  const loadBoards = useCallback(async () => {
    try {
      const [list, slug] = await Promise.all([
        listKanbanBoards({ profile: profileRef.current, includeArchived: true }),
        currentKanbanBoard({ profile: profileRef.current }).catch(() => ""),
      ]);
      setBoards(list);
      setCurrentSlug(slug || list.find((b) => b.is_current)?.slug || "");
    } catch {
      // Board listing failure is non-fatal; task load reports the real error.
    }
  }, []);

  const loadTasks = useCallback(
    async (silent = false) => {
      if (!silent) setLoading(true);
      try {
        const list = await listKanbanTasks({
          profile: profileRef.current,
          includeArchived: true,
        });
        setTasks(list);
        setError(null);
      } catch (err) {
        if (!silent) setError(runtimeErrorMessage(err));
      } finally {
        if (!silent) setLoading(false);
      }
    },
    [],
  );

  useEffect(() => {
    void loadBoards();
    void loadTasks();
  }, [profile, loadBoards, loadTasks]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (!actionInput && !createOpen) void loadTasks(true);
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, [loadTasks, actionInput, createOpen]);

  const renderedColumns = useMemo(
    () => (showArchived ? [...COLUMNS, ARCHIVED_COLUMN] : COLUMNS),
    [showArchived],
  );

  const tasksByColumn = useMemo(() => {
    const map: Record<string, KanbanTask[]> = {};
    for (const column of renderedColumns) map[column.key] = [];
    for (const task of tasks) {
      const key = map[task.status] ? task.status : "todo";
      if (!showArchived && task.status === "archived") continue;
      (map[key] ?? (map[key] = [])).push(task);
    }
    return map;
  }, [tasks, renderedColumns, showArchived]);

  const openDetail = useCallback(
    async (taskId: string) => {
      setDetailLoading(true);
      try {
        const detail = await getKanbanTask({ profile: profileRef.current, taskId });
        setSelected(detail);
      } catch (err) {
        onNotice(runtimeErrorMessage(err));
      } finally {
        setDetailLoading(false);
      }
    },
    [onNotice],
  );

  const runAction = useCallback(
    async (taskId: string, action: KanbanAction, value?: string) => {
      setBusy(true);
      try {
        await kanbanTaskAction({ profile: profileRef.current, taskId, action, value });
        onNotice(t("kanban.actionDone", { action: t(`kanban.action.${action}`) }));
        await loadTasks(true);
        if (selected?.task.id === taskId) await openDetail(taskId);
      } catch (err) {
        onNotice(runtimeErrorMessage(err));
      } finally {
        setBusy(false);
        setActionInput(null);
      }
    },
    [onNotice, t, loadTasks, selected, openDetail],
  );

  const triggerAction = useCallback(
    (taskId: string, action: KanbanAction) => {
      if (VALUE_ACTIONS[action]) {
        setActionInput({ action, value: "" });
      } else {
        void runAction(taskId, action);
      }
    },
    [runAction],
  );

  const switchToBoard = useCallback(
    async (slug: string) => {
      setBoardMenuOpen(false);
      if (slug === currentSlug) return;
      setBusy(true);
      try {
        await switchKanbanBoard({ profile: profileRef.current, slug });
        setCurrentSlug(slug);
        await Promise.all([loadBoards(), loadTasks()]);
      } catch (err) {
        onNotice(runtimeErrorMessage(err));
      } finally {
        setBusy(false);
      }
    },
    [currentSlug, loadBoards, loadTasks, onNotice],
  );

  const submitCreate = useCallback(async () => {
    if (!createTitle.trim()) return;
    setBusy(true);
    try {
      await createKanbanTask({
        profile: profileRef.current,
        task: { title: createTitle.trim(), body: createBody.trim() || undefined, triage: true },
      });
      onNotice(t("kanban.created"));
      setCreateTitle("");
      setCreateBody("");
      setCreateOpen(false);
      await loadTasks(true);
    } catch (err) {
      onNotice(runtimeErrorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [createTitle, createBody, onNotice, t, loadTasks]);

  const activeBoard = boards.find((b) => b.slug === currentSlug);

  return (
    <div className="kanban-view">
      <div className="kanban-toolbar">
        <div className="kanban-board-picker">
          <button
            type="button"
            className="kanban-board-button"
            onClick={() => setBoardMenuOpen((v) => !v)}
            disabled={busy}
          >
            {activeBoard?.icon && <span className="kanban-board-icon">{activeBoard.icon}</span>}
            <span>{activeBoard?.name || currentSlug || t("kanban.noBoard")}</span>
            <ChevronDown size={14} />
          </button>
          {boardMenuOpen && boards.length > 0 && (
            <div className="kanban-board-menu">
              {boards
                .filter((b) => !b.archived)
                .map((board) => (
                  <button
                    key={board.slug}
                    type="button"
                    className={board.slug === currentSlug ? "is-active" : ""}
                    onClick={() => void switchToBoard(board.slug)}
                  >
                    {board.icon && <span>{board.icon}</span>}
                    <span className="kanban-board-menu-name">{board.name}</span>
                    <span className="kanban-board-menu-count">{board.total}</span>
                  </button>
                ))}
            </div>
          )}
        </div>

        <div className="kanban-toolbar-actions">
          <label className="kanban-archived-toggle">
            <input
              type="checkbox"
              checked={showArchived}
              onChange={(e) => setShowArchived(e.target.checked)}
            />
            <span>{t("kanban.showArchived")}</span>
          </label>
          <button type="button" className="kanban-create-btn" onClick={() => setCreateOpen((v) => !v)} disabled={busy}>
            <Plus size={14} />
            <span>{t("kanban.newTask")}</span>
          </button>
          <button type="button" className="kanban-refresh" onClick={() => void loadTasks()} disabled={loading || busy}>
            <RefreshCw size={14} />
            <span>{loading ? t("common.loading") : t("common.refresh")}</span>
          </button>
        </div>
      </div>

      {createOpen && (
        <div className="kanban-create-form">
          <input
            type="text"
            value={createTitle}
            placeholder={t("kanban.titlePlaceholder")}
            onChange={(e) => setCreateTitle(e.target.value)}
            autoFocus
          />
          <textarea
            value={createBody}
            placeholder={t("kanban.bodyPlaceholder")}
            onChange={(e) => setCreateBody(e.target.value)}
            rows={2}
          />
          <div className="kanban-create-actions">
            <button type="button" className="kanban-create-submit" onClick={() => void submitCreate()} disabled={busy || !createTitle.trim()}>
              {t("kanban.create")}
            </button>
            <button type="button" className="kanban-create-cancel" onClick={() => setCreateOpen(false)}>
              {t("common.cancel")}
            </button>
          </div>
        </div>
      )}

      {error ? (
        <div className="kanban-error">
          <CircleSlash size={16} />
          <div>
            <p>{t("kanban.loadFailed")}</p>
            <small>{error}</small>
          </div>
          <button type="button" onClick={() => void loadTasks()}>
            {t("common.refresh")}
          </button>
        </div>
      ) : (
        <div className="kanban-columns">
          {renderedColumns.map((column) => {
            const columnTasks = tasksByColumn[column.key] ?? [];
            return (
              <section className="kanban-column" key={column.key} data-tone={column.tone}>
                <header className="kanban-column-head">
                  <span className="kanban-column-dot" data-tone={column.tone} />
                  <span className="kanban-column-name">{t(`kanban.status.${column.key}`)}</span>
                  <span className="kanban-column-count">{columnTasks.length}</span>
                </header>
                <div className="kanban-column-body">
                  {columnTasks.map((task) => (
                    <article
                      key={task.id}
                      className="kanban-card"
                      onClick={() => void openDetail(task.id)}
                      role="button"
                      tabIndex={0}
                    >
                      <div className="kanban-card-title">{task.title}</div>
                      <div className="kanban-card-meta">
                        <span className="kanban-card-id">{task.id.slice(0, 8)}</span>
                        {task.assignee && <span className="kanban-card-assignee">@{task.assignee}</span>}
                        {task.priority > 0 && <span className="kanban-card-priority">P{task.priority}</span>}
                      </div>
                      {task.skills.length > 0 && (
                        <div className="kanban-card-skills">
                          {task.skills.slice(0, 3).map((skill) => (
                            <span key={skill}>{skill}</span>
                          ))}
                        </div>
                      )}
                    </article>
                  ))}
                  {columnTasks.length === 0 && <p className="kanban-column-empty">—</p>}
                </div>
              </section>
            );
          })}
        </div>
      )}

      {(selected || detailLoading) && (
        <>
          <div className="kanban-drawer-backdrop" onClick={() => setSelected(null)} />
          <aside className="kanban-drawer">
            <div className="kanban-drawer-head">
              <h3>{detailLoading ? t("common.loading") : selected?.task.title}</h3>
              <button type="button" onClick={() => setSelected(null)} aria-label={t("common.cancel")}>
                <X size={16} />
              </button>
            </div>
            {selected && (
              <div className="kanban-drawer-body">
                <div className="kanban-drawer-meta">
                  <span className="kanban-status-chip" data-tone={ARCHIVED_COLUMN.key === selected.task.status ? "archived" : (COLUMNS.find((c) => c.key === selected.task.status)?.tone ?? "neutral")}>
                    {t(`kanban.status.${selected.task.status}`)}
                  </span>
                  <span className="kanban-card-id">{selected.task.id}</span>
                  {selected.task.assignee && <span>@{selected.task.assignee}</span>}
                </div>

                {selected.task.body && <p className="kanban-drawer-text">{selected.task.body}</p>}
                {selected.latest_summary && (
                  <div className="kanban-drawer-summary">
                    <strong>{t("kanban.latestSummary")}</strong>
                    <p>{selected.latest_summary}</p>
                  </div>
                )}

                <div className="kanban-drawer-actions">
                  {(ACTIONS_BY_STATUS[selected.task.status] ?? []).map((action) => (
                    <button key={action} type="button" disabled={busy} onClick={() => triggerAction(selected.task.id, action)}>
                      {actionIcon(action)}
                      <span>{t(`kanban.action.${action}`)}</span>
                    </button>
                  ))}
                  <button type="button" disabled={busy} onClick={() => setActionInput({ action: "assign", value: "" })}>
                    <UserPlus size={13} />
                    <span>{t("kanban.action.assign")}</span>
                  </button>
                  <button type="button" disabled={busy} onClick={() => setActionInput({ action: "comment", value: "" })}>
                    <MessageSquarePlus size={13} />
                    <span>{t("kanban.action.comment")}</span>
                  </button>
                </div>

                {actionInput && (
                  <div className="kanban-action-input">
                    <label>{t(VALUE_ACTIONS[actionInput.action] ?? "kanban.valuePrompt.reason")}</label>
                    <textarea
                      value={actionInput.value}
                      rows={2}
                      autoFocus
                      onChange={(e) => setActionInput({ action: actionInput.action, value: e.target.value })}
                    />
                    <div className="kanban-action-input-buttons">
                      <button
                        type="button"
                        disabled={busy || (actionInput.action === "comment" && !actionInput.value.trim())}
                        onClick={() => void runAction(selected.task.id, actionInput.action, actionInput.value)}
                      >
                        {t("common.confirm")}
                      </button>
                      <button type="button" onClick={() => setActionInput(null)}>
                        {t("common.cancel")}
                      </button>
                    </div>
                  </div>
                )}

                {selected.comments.length > 0 && (
                  <div className="kanban-drawer-section">
                    <strong>{t("kanban.comments")}</strong>
                    {selected.comments.map((comment) => (
                      <div key={comment.id} className="kanban-comment">
                        <span className="kanban-comment-author">{comment.author || "—"}</span>
                        <p>{comment.body}</p>
                      </div>
                    ))}
                  </div>
                )}

                {selected.runs.length > 0 && (
                  <div className="kanban-drawer-section">
                    <strong>{t("kanban.runs")}</strong>
                    {selected.runs.map((run) => (
                      <div key={run.id} className="kanban-run">
                        <span>{run.status || run.outcome || "—"}</span>
                        {run.summary && <small>{run.summary}</small>}
                        {run.error && <small className="kanban-run-error">{run.error}</small>}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </aside>
        </>
      )}
    </div>
  );
}

function actionIcon(action: KanbanAction) {
  switch (action) {
    case "complete":
      return <Check size={13} />;
    case "block":
      return <Ban size={13} />;
    case "unblock":
      return <Undo2 size={13} />;
    case "promote":
      return <Rocket size={13} />;
    case "schedule":
      return <Clock size={13} />;
    case "reclaim":
      return <Undo2 size={13} />;
    case "archive":
      return <Archive size={13} />;
    case "specify":
      return <Rocket size={13} />;
    default:
      return <Check size={13} />;
  }
}
