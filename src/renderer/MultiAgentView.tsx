import { useMemo } from "react";
import {
  Activity,
  BrainCircuit,
  CheckCircle2,
  Clock,
  GitBranch,
  GitCompare,
  Layers,
  Merge,
  StopCircle,
  Users,
  XCircle,
} from "lucide-react";
import type { TranslationVars } from "../i18n/types";
import type { OrchestrationState } from "../core/orchestrator";
import type { DispatchMode, DispatchTask } from "../core/types";
import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";
import {
  buildChatRunMergeMarkdown,
  buildChatRunResultBatches,
  type ChatRunBatchStatus,
  type ChatRunResultBatch,
  type ChatRunResultRow,
} from "./chatRunResults";

interface MultiAgentViewProps {
  state: OrchestrationState;
  sessions: HermesTeamSessionSummary[];
  t: (key: string, vars?: TranslationVars) => string;
  onCancelTask: (taskId: string) => void;
  onMergeChatRunBatch: (content: string) => void;
}

const MODE_TONE: Record<DispatchMode, string> = {
  single: "single",
  parallel: "parallel",
  serial: "serial",
};

const BATCH_STATUS_ICON: Record<ChatRunBatchStatus, typeof Clock> = {
  idle: Clock,
  running: Activity,
  completed: CheckCircle2,
  failed: XCircle,
  cancelled: StopCircle,
  partial: GitCompare,
};

export function MultiAgentView({
  state,
  sessions,
  t,
  onCancelTask,
  onMergeChatRunBatch,
}: MultiAgentViewProps) {
  const { agents, bindings, tasks, logs, workspace } = state;

  const agentById = useMemo(() => new Map(agents.map((a) => [a.id, a])), [agents]);
  const bindingByAgent = useMemo(
    () => new Map(bindings.map((b) => [b.agentId, b])),
    [bindings],
  );

  const tasksByTrigger = useMemo(() => {
    const map = new Map<string, DispatchTask[]>();
    for (const task of tasks) {
      const list = map.get(task.triggerMessageId) ?? [];
      list.push(task);
      map.set(task.triggerMessageId, list);
    }
    return map;
  }, [tasks]);

  const activeTasks = useMemo(
    () => tasks.filter((task) => task.status === "running" || task.status === "pending"),
    [tasks],
  );

  const recentLogs = useMemo(() => [...logs].reverse().slice(0, 12), [logs]);
  const chatRunBatches = useMemo(
    () => buildChatRunResultBatches(state, sessions).slice(0, 8),
    [state, sessions],
  );
  const chatRunRows = useMemo(
    () => chatRunBatches.flatMap((batch) => batch.rows),
    [chatRunBatches],
  );
  const chatRunLiveStats = useMemo(() => {
    const running = chatRunRows.filter((row) => row.status === "running" || row.status === "pending").length;
    const completed = chatRunRows.filter((row) => row.status === "completed").length;
    const failed = chatRunRows.filter((row) => row.status === "failed").length;
    return { total: chatRunRows.length, running, completed, failed };
  }, [chatRunRows]);

  const mergeBatch = (batch: ChatRunResultBatch) => {
    onMergeChatRunBatch(
      buildChatRunMergeMarkdown(batch, {
        title: t("multiAgent.mergeMarkdownTitle"),
        prompt: t("multiAgent.mergeMarkdownPrompt"),
        status: t("multiAgent.mergeMarkdownStatus"),
        noResult: t("multiAgent.noResult"),
        agent: t("multiAgent.mergeMarkdownAgent"),
      }),
    );
  };

  return (
    <div className="multiagent-view">
      <header className="multiagent-header">
        <div className="multiagent-header-title">
          <Users size={20} />
          <div>
            <h1>{t("multiAgent.title")}</h1>
            <p>{workspace.name || t("multiAgent.subtitle")}</p>
          </div>
        </div>
        <div className="multiagent-stats">
          <div className="multiagent-stat">
            <span className="multiagent-stat-value">{agents.length}</span>
            <span className="multiagent-stat-label">{t("multiAgent.agentsLabel")}</span>
          </div>
          <div className="multiagent-stat">
            <span className="multiagent-stat-value">{activeTasks.length}</span>
            <span className="multiagent-stat-label">{t("multiAgent.activeTasks")}</span>
          </div>
          <div className="multiagent-stat">
            <span className="multiagent-stat-value">{logs.length}</span>
            <span className="multiagent-stat-label">{t("multiAgent.dispatches")}</span>
          </div>
          <div className="multiagent-stat">
            <span className="multiagent-stat-value">{chatRunLiveStats.total}</span>
            <span className="multiagent-stat-label">{t("multiAgent.chatRuns")}</span>
          </div>
        </div>
      </header>

      <div className="multiagent-body">
        <section className="multiagent-section multiagent-live">
          <div className="multiagent-section-head">
            <Activity size={16} />
            <h2>{t("multiAgent.liveStatus")}</h2>
          </div>
          {chatRunBatches.length === 0 ? (
            <p className="multiagent-empty">{t("multiAgent.noChatRuns")}</p>
          ) : (
            <div className="multiagent-live-grid">
              <LiveMetric label={t("multiAgent.chatRuns")} value={chatRunLiveStats.total} tone="neutral" />
              <LiveMetric label={t("multiAgent.liveRunning")} value={chatRunLiveStats.running} tone="running" />
              <LiveMetric label={t("multiAgent.liveCompleted")} value={chatRunLiveStats.completed} tone="completed" />
              <LiveMetric label={t("multiAgent.liveFailed")} value={chatRunLiveStats.failed} tone="failed" />
              <div className="multiagent-live-batches">
                {chatRunBatches.slice(0, 3).map((batch) => (
                  <BatchProgress key={batch.id} batch={batch} t={t} />
                ))}
              </div>
            </div>
          )}
        </section>

        <section className="multiagent-section multiagent-results">
          <div className="multiagent-section-head">
            <GitCompare size={16} />
            <h2>{t("multiAgent.resultCompare")}</h2>
          </div>
          {chatRunBatches.length === 0 ? (
            <p className="multiagent-empty">{t("multiAgent.noResults")}</p>
          ) : (
            <div className="multiagent-result-list">
              {chatRunBatches.map((batch) => (
                <article className="multiagent-result-batch" key={batch.id} data-status={batch.status}>
                  <div className="multiagent-result-head">
                    <div>
                      <span className="multiagent-result-status" data-status={batch.status}>
                        <BatchStatusIcon status={batch.status} />
                        {t(`multiAgent.batchStatus.${batch.status}`)}
                      </span>
                      <h3>{batch.prompt || batch.reason}</h3>
                    </div>
                    <button
                      type="button"
                      className="multiagent-merge"
                      disabled={!batch.readyToMerge}
                      onClick={() => mergeBatch(batch)}
                    >
                      <Merge size={13} />
                      <span>{t("multiAgent.mergeToChat")}</span>
                    </button>
                  </div>
                  <div className="multiagent-result-rows">
                    {batch.rows.map((row) => (
                      <ResultRow key={`${batch.id}-${row.agentId}`} row={row} t={t} />
                    ))}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>

        <section className="multiagent-section multiagent-roster">
          <div className="multiagent-section-head">
            <BrainCircuit size={16} />
            <h2>{t("multiAgent.roster")}</h2>
          </div>
          {agents.length === 0 ? (
            <p className="multiagent-empty">{t("multiAgent.noAgents")}</p>
          ) : (
            <div className="multiagent-agent-grid">
              {agents.map((agent) => {
                const binding = bindingByAgent.get(agent.id);
                const running = activeTasks.some((task) => task.agentId === agent.id);
                return (
                  <article className="multiagent-agent-card" key={agent.id} data-active={running}>
                    <div className="multiagent-agent-head">
                      <span className="multiagent-agent-dot" style={{ background: agent.color }} />
                      <div className="multiagent-agent-id">
                        <strong>{agent.name}</strong>
                        <span>{agent.role}</span>
                      </div>
                      {running && <span className="multiagent-agent-busy">{t("multiAgent.busy")}</span>}
                    </div>
                    {agent.prompt && <p className="multiagent-agent-prompt">{agent.prompt}</p>}
                    <div className="multiagent-agent-meta">
                      <span className="multiagent-agent-profile">{binding?.hermesProfile ?? "default"}</span>
                      {!agent.enabled && <span className="multiagent-agent-disabled">{t("multiAgent.disabled")}</span>}
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="multiagent-section multiagent-delegation">
          <div className="multiagent-section-head">
            <GitBranch size={16} />
            <h2>{t("multiAgent.delegationLog")}</h2>
          </div>
          {recentLogs.length === 0 ? (
            <p className="multiagent-empty">{t("multiAgent.emptyHint")}</p>
          ) : (
            <div className="multiagent-log-list">
              {recentLogs.map((log) => {
                const decision = log.decision;
                const relatedTasks = tasksByTrigger.get(log.triggerMessageId) ?? [];
                const mode: DispatchMode | null =
                  decision.type === "dispatch" ? decision.mode : null;
                return (
                  <article className="multiagent-log-card" key={log.id}>
                    <div className="multiagent-log-top">
                      {mode ? (
                        <span className="multiagent-mode-badge" data-tone={MODE_TONE[mode]}>
                          {mode === "parallel" && <Layers size={12} />}
                          {mode === "serial" && <GitBranch size={12} />}
                          {t(`multiAgent.mode.${mode}`)}
                        </span>
                      ) : (
                        <span className="multiagent-mode-badge" data-tone="neutral">
                          {t(`multiAgent.decision.${decision.type}`)}
                        </span>
                      )}
                      <span className="multiagent-log-status" data-status={log.status}>
                        {t(`multiAgent.logStatus.${log.status}`)}
                      </span>
                    </div>
                    <p className="multiagent-log-reason">{decision.reason}</p>
                    {decision.type === "dispatch" && (
                      <div className="multiagent-assignments">
                        {decision.assignments.map((assignment, index) => {
                          const agent = agentById.get(assignment.agentId);
                          const task = relatedTasks.find((tk) => tk.agentId === assignment.agentId);
                          return (
                            <div className="multiagent-assignment" key={`${log.id}-${index}`}>
                              <span
                                className="multiagent-assignment-dot"
                                style={{ background: agent?.color ?? "#6e7681" }}
                              />
                              <span className="multiagent-assignment-name">
                                {agent?.name ?? assignment.agentId}
                              </span>
                              {task && (
                                <span
                                  className="multiagent-task-status"
                                  data-status={task.status}
                                >
                                  {t(`multiAgent.taskStatus.${task.status}`)}
                                </span>
                              )}
                              <span className="multiagent-assignment-instruction">
                                {assignment.instruction}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>

        <section className="multiagent-section multiagent-tasks">
          <div className="multiagent-section-head">
            <Layers size={16} />
            <h2>{t("multiAgent.activeTasks")}</h2>
          </div>
          {activeTasks.length === 0 ? (
            <p className="multiagent-empty">{t("multiAgent.noActivity")}</p>
          ) : (
            <div className="multiagent-task-list">
              {activeTasks.map((task) => {
                const agent = agentById.get(task.agentId);
                return (
                  <article className="multiagent-task-card" key={task.id}>
                    <span
                      className="multiagent-assignment-dot"
                      style={{ background: agent?.color ?? "#6e7681" }}
                    />
                    <div className="multiagent-task-body">
                      <strong>{agent?.name ?? task.agentId}</strong>
                      <span className="multiagent-task-instruction">{task.instruction}</span>
                    </div>
                    <span className="multiagent-task-status" data-status={task.status}>
                      {t(`multiAgent.taskStatus.${task.status}`)}
                    </span>
                    <button type="button" className="multiagent-abort" onClick={() => onCancelTask(task.id)}>
                      <StopCircle size={13} />
                      <span>{t("multiAgent.abort")}</span>
                    </button>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
}

function LiveMetric({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "neutral" | "running" | "completed" | "failed";
}) {
  return (
    <div className="multiagent-live-metric" data-tone={tone}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function BatchProgress({
  batch,
  t,
}: {
  batch: ChatRunResultBatch;
  t: (key: string, vars?: TranslationVars) => string;
}) {
  const total = Math.max(batch.summary.total, 1);
  const completedPct = Math.round((batch.summary.completed / total) * 100);
  const failedPct = Math.round((batch.summary.failed / total) * 100);
  const cancelledPct = Math.round((batch.summary.cancelled / total) * 100);
  return (
    <div className="multiagent-live-batch">
      <div className="multiagent-live-batch-top">
        <span>{batch.prompt || batch.reason}</span>
        <span>{t(`multiAgent.batchStatus.${batch.status}`)}</span>
      </div>
      <div className="multiagent-progress" aria-hidden="true">
        <span className="completed" style={{ width: `${completedPct}%` }} />
        <span className="failed" style={{ width: `${failedPct}%` }} />
        <span className="cancelled" style={{ width: `${cancelledPct}%` }} />
      </div>
    </div>
  );
}

function BatchStatusIcon({ status }: { status: ChatRunBatchStatus }) {
  const Icon = BATCH_STATUS_ICON[status];
  return <Icon size={13} />;
}

function ResultRow({
  row,
  t,
}: {
  row: ChatRunResultRow;
  t: (key: string, vars?: TranslationVars) => string;
}) {
  return (
    <div className="multiagent-result-row" data-status={row.status}>
      <div className="multiagent-result-row-head">
        <strong>{row.agentName}</strong>
        <span>{row.profile}</span>
        <span className="multiagent-task-status" data-status={row.status}>
          {row.status === "missing" ? t("multiAgent.taskStatus.missing") : t(`multiAgent.taskStatus.${row.status}`)}
        </span>
      </div>
      <p className="multiagent-result-instruction">{row.instruction}</p>
      <p className="multiagent-result-preview">{row.preview || t("multiAgent.noResult")}</p>
      <div className="multiagent-result-meta">
        <span>{row.sessionId ?? t("multiAgent.noSession")}</span>
        {row.updatedAt && <span>{new Date(row.updatedAt).toLocaleTimeString()}</span>}
      </div>
    </div>
  );
}
