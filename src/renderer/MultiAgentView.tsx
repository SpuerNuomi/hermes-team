import { useMemo } from "react";
import { BrainCircuit, GitBranch, Layers, StopCircle, Users } from "lucide-react";
import type { TranslationVars } from "../i18n/types";
import type { OrchestrationState } from "../core/orchestrator";
import type { DispatchMode, DispatchTask } from "../core/types";

interface MultiAgentViewProps {
  state: OrchestrationState;
  t: (key: string, vars?: TranslationVars) => string;
  onCancelTask: (taskId: string) => void;
}

const MODE_TONE: Record<DispatchMode, string> = {
  single: "single",
  parallel: "parallel",
  serial: "serial",
};

export function MultiAgentView({ state, t, onCancelTask }: MultiAgentViewProps) {
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
        </div>
      </header>

      <div className="multiagent-body">
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
