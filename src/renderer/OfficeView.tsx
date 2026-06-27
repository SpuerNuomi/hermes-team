import { Component, lazy, Suspense, useMemo, useState, type ReactNode } from "react";
import { Building2, CircleDot, Cpu, X } from "lucide-react";
import type { TranslationVars } from "../i18n/types";
import type { OrchestrationState } from "../core/orchestrator";
import type { HermesProfileInfo } from "../runtime/hermes-runtime";
import type { OfficeDesk } from "./OfficeScene";

const OfficeScene = lazy(() => import("./OfficeScene"));

interface OfficeViewProps {
  profiles: HermesProfileInfo[];
  state: OrchestrationState;
  t: (key: string, vars?: TranslationVars) => string;
}

class SceneErrorBoundary extends Component<{ fallback: ReactNode; children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? this.props.fallback : this.props.children;
  }
}

export function OfficeView({ profiles, state, t }: OfficeViewProps) {
  const [selected, setSelected] = useState<number | null>(null);

  // Profiles that currently have a running/pending orchestration task, resolved
  // through agent → capability binding → hermesProfile.
  const busyProfiles = useMemo(() => {
    const set = new Set<string>();
    const activeAgentIds = new Set(
      state.tasks
        .filter((task) => task.status === "running" || task.status === "pending")
        .map((task) => task.agentId),
    );
    for (const binding of state.bindings) {
      if (activeAgentIds.has(binding.agentId)) set.add(binding.hermesProfile);
    }
    return set;
  }, [state.tasks, state.bindings]);

  const desks: OfficeDesk[] = useMemo(
    () =>
      profiles.map((profile) => ({
        name: profile.name,
        color: profile.color || "#58a6ff",
        active: profile.active,
        busy: busyProfiles.has(profile.name),
      })),
    [profiles, busyProfiles],
  );

  const selectedProfile = selected != null ? profiles[selected] : null;
  const selectedAgents = useMemo(() => {
    if (!selectedProfile) return [];
    const agentIds = new Set(
      state.bindings
        .filter((binding) => binding.hermesProfile === selectedProfile.name)
        .map((binding) => binding.agentId),
    );
    return state.agents.filter((agent) => agentIds.has(agent.id));
  }, [selectedProfile, state.bindings, state.agents]);

  const statusKey = (profile: HermesProfileInfo) =>
    busyProfiles.has(profile.name) ? "busy" : profile.active ? "active" : "idle";

  const fallback = (
    <div className="office-fallback">
      <Building2 size={32} />
      <p>{t("office.unavailable")}</p>
    </div>
  );

  return (
    <div className="office-view">
      <header className="office-header">
        <div className="office-header-title">
          <Building2 size={20} />
          <div>
            <h1>{t("office.title")}</h1>
            <p>{t("office.subtitle", { count: profiles.length })}</p>
          </div>
        </div>
        <div className="office-legend">
          <span className="office-legend-item"><span className="office-dot busy" />{t("office.status.busy")}</span>
          <span className="office-legend-item"><span className="office-dot active" />{t("office.status.active")}</span>
          <span className="office-legend-item"><span className="office-dot idle" />{t("office.status.idle")}</span>
        </div>
      </header>

      <div className="office-stage">
        {profiles.length === 0 ? (
          <div className="office-fallback">
            <Building2 size={32} />
            <p>{t("office.noProfiles")}</p>
          </div>
        ) : (
          <SceneErrorBoundary fallback={fallback}>
            <Suspense fallback={<div className="office-fallback"><p>{t("office.loading")}</p></div>}>
              <OfficeScene desks={desks} onSelect={setSelected} />
            </Suspense>
          </SceneErrorBoundary>
        )}

        {selectedProfile && (
          <aside className="office-panel">
            <div className="office-panel-head">
              <div className="office-panel-id">
                <span className="office-dot-large" style={{ background: selectedProfile.color || "#58a6ff" }} />
                <div>
                  <strong>{selectedProfile.name}</strong>
                  <span className={`office-status office-status-${statusKey(selectedProfile)}`}>
                    <CircleDot size={11} />
                    {t(`office.status.${statusKey(selectedProfile)}`)}
                  </span>
                </div>
              </div>
              <button type="button" onClick={() => setSelected(null)} aria-label={t("office.close")}>
                <X size={16} />
              </button>
            </div>

            <dl className="office-panel-meta">
              <div>
                <dt>{t("office.model")}</dt>
                <dd>{selectedProfile.model || "—"}</dd>
              </div>
              <div>
                <dt>{t("office.provider")}</dt>
                <dd>{selectedProfile.provider || "—"}</dd>
              </div>
              <div>
                <dt>{t("office.gateway")}</dt>
                <dd>{selectedProfile.gatewayRunning ? t("office.running") : t("office.stopped")}</dd>
              </div>
              <div>
                <dt>{t("office.skills")}</dt>
                <dd>{selectedProfile.skillCount}</dd>
              </div>
            </dl>

            <div className="office-panel-agents">
              <strong><Cpu size={13} /> {t("office.boundAgents")}</strong>
              {selectedAgents.length === 0 ? (
                <p className="office-panel-empty">{t("office.noAgents")}</p>
              ) : (
                <ul>
                  {selectedAgents.map((agent) => (
                    <li key={agent.id}>
                      <span className="office-dot-small" style={{ background: agent.color }} />
                      {agent.name}
                      <em>{agent.role}</em>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}
