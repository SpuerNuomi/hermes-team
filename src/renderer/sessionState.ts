import { buildSessionSummary, type HermesStateMessage, type HermesStateSessionSummary, type HermesTeamSessionSummary } from "../runtime/hermes-runtime";
import type { OrchestrationState } from "../core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../core/seed";
import type { Message, SessionModelOverride, WorkspaceMode } from "../core/types";
import type { TranslateFn } from "./appTypes";

const LEGACY_PRODUCT_RD_WORKSPACE_NAME = "产品研发协作室";
const LEGACY_AGENT_WORKSPACE_NAME = "Agent 编排工作区";
const LEGACY_PRODUCT_RD_WORKSPACE_DESCRIPTION = "用于把需求、设计、实现、验证放进同一个 Agent 团队流程。";
const LEGACY_AGENT_WORKSPACE_DESCRIPTION = "用于组织多个 Agent 的并行、串行与接力协作。";
const LEGACY_SEED_MESSAGE_CONTENTS = new Set([
  "@产品经理 帮我把这个想法拆成可执行的研发任务。",
  "我会先收敛目标、用户场景和验收标准，然后交给 @架构师 做模块边界设计。",
]);
const DEFAULT_WORKSPACE_NAME = seedWorkspace.name;
const DEFAULT_WORKSPACE_DESCRIPTION = seedWorkspace.description;

export function buildFreshOrchestrationState(workspaceMode: WorkspaceMode = "smart"): OrchestrationState {
  const baseTime = Date.now();
  const workspaceId = `workspace-${baseTime}`;
  const agentIdMap = new Map<string, string>();
  const agents = seedAgents.map((agent) => {
    const nextAgentId = `${agent.id}-${baseTime}`;
    agentIdMap.set(agent.id, nextAgentId);
    return {
      ...agent,
      id: nextAgentId,
      workspaceId,
    };
  });

  return {
    workspace: {
      ...seedWorkspace,
      id: workspaceId,
      mode: workspaceMode,
      defaultAgentId: seedWorkspace.defaultAgentId
        ? agentIdMap.get(seedWorkspace.defaultAgentId) ?? seedWorkspace.defaultAgentId
        : undefined,
    },
    agents,
    bindings: seedBindings.map((binding) => ({
      ...binding,
      agentId: agentIdMap.get(binding.agentId) ?? binding.agentId,
    })),
    messages: [],
    tasks: [],
    logs: [],
    artifacts: [],
  };
}

export function isScratchSession(state: OrchestrationState): boolean {
  return (
    state.messages.length === 0 &&
    state.tasks.every((task) => task.status !== "pending" && task.status !== "running")
  );
}

export function hasActiveSessionTasks(state: OrchestrationState): boolean {
  return state.tasks.some((task) => task.status === "pending" || task.status === "running");
}

export function sameSessionModelOverride(
  left: SessionModelOverride | undefined,
  right: SessionModelOverride | undefined,
): boolean {
  if (!left && !right) return true;
  if (!left || !right) return false;
  return (
    left.provider === right.provider &&
    left.model === right.model &&
    (left.baseUrl ?? "") === (right.baseUrl ?? "") &&
    (left.contextLength ?? 0) === (right.contextLength ?? 0)
  );
}

export function buildStateFromHermesStateSession(
  session: HermesStateSessionSummary,
  rows: HermesStateMessage[],
  workspaceMode: WorkspaceMode,
  t: TranslateFn,
): OrchestrationState {
  const base = buildFreshOrchestrationState(workspaceMode);
  const importedWorkspaceId = `desktop-${session.id}`;
  const agentId = base.agents[0]?.id ?? "agent-hermes";
  return {
    ...base,
    workspace: {
      ...base.workspace,
      id: importedWorkspaceId,
      name: "Hermes Chat",
      description: t("app.importDesc", { title: session.title }),
    },
    agents: base.agents.map((agent) => ({ ...agent, workspaceId: importedWorkspaceId })),
    messages: rows.map((row, index) => {
      const kind = row.kind === "reasoning" ? "reasoning" : row.kind === "tool" ? "tool" : "message";
      return {
        id: `desktop-${session.id}-${row.kind}-${row.id}-${index}`,
        workspaceId: importedWorkspaceId,
        kind,
        authorKind: row.kind === "user" ? "user" : "agent",
        authorId: row.kind === "user" ? undefined : agentId,
        authorName: row.kind === "user" ? "You" : row.kind === "tool" ? row.name || t("app.toolCall") : "Hermes",
        content: decodeHermesStateContent(row.content),
        createdAt: normalizeHermesStateTimestamp(row.timestamp),
      } satisfies Message;
    }),
    tasks: [],
    logs: [],
  };
}

function normalizeHermesStateTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return Date.now();
  return value < 10_000_000_000 ? value * 1000 : value;
}

function decodeHermesStateContent(raw: string): string {
  const prefix = "\u0000json:";
  if (!raw.startsWith(prefix)) return raw;
  try {
    const parsed = JSON.parse(raw.slice(prefix.length));
    if (!Array.isArray(parsed)) return typeof parsed === "string" ? parsed : raw;
    const texts = parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const type = String(record.type || "").toLowerCase();
        if (type === "text" || type === "input_text" || type === "output_text") {
          return typeof record.text === "string" ? record.text : "";
        }
        if (type === "image_url" || type === "input_image") return "[image]";
        return "";
      })
      .filter(Boolean);
    return texts.join("\n\n") || raw;
  } catch {
    return raw;
  }
}

export function normalizeLoadedState(saved: OrchestrationState): OrchestrationState {
  const workspaceName =
    saved.workspace.name === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
    saved.workspace.name === LEGACY_AGENT_WORKSPACE_NAME
      ? DEFAULT_WORKSPACE_NAME
      : saved.workspace.name;
  const workspaceDescription =
    saved.workspace.description === LEGACY_PRODUCT_RD_WORKSPACE_DESCRIPTION ||
    saved.workspace.description === LEGACY_AGENT_WORKSPACE_DESCRIPTION
      ? DEFAULT_WORKSPACE_DESCRIPTION
      : saved.workspace.description;
  const hasLegacyWorkspace =
    saved.workspace.name === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
    saved.workspace.name === LEGACY_AGENT_WORKSPACE_NAME;
  const normalizedAgents = hasLegacyWorkspace
    ? seedAgents.map((agent) => ({ ...agent, workspaceId: saved.workspace.id }))
    : saved.agents;
  const normalizedBindings = hasLegacyWorkspace ? seedBindings : saved.bindings;

  return {
    ...saved,
    workspace: {
      ...saved.workspace,
      name: workspaceName,
      description: workspaceDescription,
      defaultAgentId: hasLegacyWorkspace ? seedWorkspace.defaultAgentId : saved.workspace.defaultAgentId,
      workMode: saved.workspace.workMode === "plan" || saved.workspace.workMode === "craft"
        ? saved.workspace.workMode
        : "ask",
    },
    agents: normalizedAgents,
    bindings: normalizedBindings,
    messages: saved.messages.filter((message) => !LEGACY_SEED_MESSAGE_CONTENTS.has(message.content)),
    tasks: saved.tasks.map((task) =>
      task.status === "running" || task.status === "pending"
        ? { ...task, status: "failed", completedAt: Date.now() }
        : task,
    ),
    artifacts: saved.artifacts ?? [],
  };
}

export function normalizeLoadedSessions(sessions: HermesTeamSessionSummary[]): HermesTeamSessionSummary[] {
  const normalized = sessions.map((session) => {
    const state = normalizeLoadedState(session.state);
    const defaultAgentId = state.workspace.defaultAgentId ?? state.agents[0]?.id;
    const contextFolder = session.folderEdited
      ? session.contextFolder ?? null
      : session.contextFolder ??
        state.bindings.find((binding) => binding.agentId === defaultAgentId)?.workDir?.trim() ??
        null;
    return {
      ...session,
      title:
        session.title === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
        session.title === LEGACY_AGENT_WORKSPACE_NAME
          ? DEFAULT_WORKSPACE_NAME
          : session.title,
      pinned: session.pinned ?? false,
      contextFolder,
      state,
      messageCount: state.messages.length,
      taskCount: state.tasks.length,
    };
  });
  return normalized.sort(
    (left, right) =>
      Number(right.pinned ?? false) - Number(left.pinned ?? false) ||
      right.updatedAt - left.updatedAt,
  );
}

export function sessionSummaryForSave(
  state: OrchestrationState,
  sessions: HermesTeamSessionSummary[],
): HermesTeamSessionSummary {
  const summary = buildSessionSummary(state);
  const existing = sessions.find((session) => session.id === summary.id);
  if (!existing) return summary;
  return {
    ...summary,
    title: existing.titleEdited ? existing.title : summary.title,
    titleEdited: existing.titleEdited,
    pinned: existing.pinned ?? false,
    folderEdited: existing.folderEdited,
    contextFolder: existing.folderEdited ? existing.contextFolder ?? null : summary.contextFolder,
  };
}

