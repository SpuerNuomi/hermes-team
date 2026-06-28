import type { OrchestrationState } from "../core/orchestrator";
import type { ChatRunWindowRequest, HermesTeamSessionSummary } from "../runtime/hermes-runtime";

export type ChatRunWindowKind = "main" | "child";
export type ChatRunPersistence = "persistent" | "temporary";

export interface ChatRunLaunchInput {
  kind?: ChatRunWindowKind;
  windowLabel?: string;
  chatRunId?: string;
  profile?: string;
  sessionId?: string;
  parentSessionId?: string;
  source?: string;
  label?: string;
}

export interface ChatRunContext {
  id: string;
  kind: ChatRunWindowKind;
  persistence: ChatRunPersistence;
  label: string;
  initialProfile?: string;
  initialSessionId?: string;
  parentSessionId?: string;
  source?: string;
  restoreGlobalState: boolean;
  persistGlobalState: boolean;
  allowSessionSnapshot: boolean;
}

export function buildChatRunWindowRequest(input: ChatRunLaunchInput): ChatRunWindowRequest {
  const chatRunId = cleanParam(input.chatRunId);
  const title =
    cleanParam(input.label) ??
    buildChatRunLaunchLabel({
      kind: input.kind,
      profile: input.profile,
      sessionId: input.sessionId,
      source: input.source,
    });
  return {
    windowLabel: buildChatRunWindowLabel(input),
    chatRunId,
    sessionId: cleanParam(input.sessionId),
    parentSessionId: cleanParam(input.parentSessionId),
    source: cleanParam(input.source),
    url: buildChatRunLaunchUrl({ ...input, label: title }),
    title: `Hermes Team · ${title}`,
  };
}

export function buildChatRunWindowLabel(input: ChatRunLaunchInput): string {
  const raw =
    cleanParam(input.windowLabel) ??
    cleanParam(input.chatRunId) ??
    cleanParam(input.sessionId) ??
    cleanParam(input.profile) ??
    cleanParam(input.source) ??
    "child";
  const normalized = raw
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  const label = normalized || "child";
  return trimWindowLabel(label.startsWith("chat-run-") ? label : `chat-run-${label}`);
}

export function buildChatRunLaunchUrl(input: ChatRunLaunchInput): string {
  const kind = input.kind ?? "child";
  const params = new URLSearchParams();
  appendParam(params, "window", kind);
  appendParam(params, "chatRunId", input.chatRunId);
  appendParam(params, "profile", input.profile);
  appendParam(params, "sessionId", input.sessionId);
  appendParam(params, "parentSessionId", input.parentSessionId);
  appendParam(params, "source", input.source);
  appendParam(
    params,
    "label",
    input.label ??
      buildChatRunLaunchLabel({
        kind,
        profile: input.profile,
        sessionId: input.sessionId,
        source: input.source,
      }),
  );
  const query = params.toString();
  return query ? `/?${query}` : "/";
}

export function buildChatRunLaunchLabel(input: {
  kind?: ChatRunWindowKind;
  profile?: string;
  sessionId?: string;
  source?: string;
}): string {
  if (input.kind === "main") return "Main";
  const source = cleanParam(input.source);
  const profile = cleanParam(input.profile);
  const sessionId = cleanParam(input.sessionId);
  if (source && profile) return trimLabel(`Child · ${source} · ${profile}`);
  if (source && sessionId) return trimLabel(`Child · ${source} · ${sessionId}`);
  if (profile) return trimLabel(`Child · ${profile}`);
  if (sessionId) return trimLabel(`Child · ${sessionId}`);
  return "Child";
}

export function chatRunContextFromLocation(href: string | undefined): ChatRunContext {
  const params = paramsFromHref(href);
  const kind = normalizeWindowKind(
    firstParam(params, ["chatRun", "chat_run", "window", "kind", "mode"]),
  );
  const initialProfile = cleanParam(firstParam(params, ["profile", "initialProfile"]));
  const initialSessionId = cleanParam(firstParam(params, ["session", "sessionId", "run", "runId"]));
  const parentSessionId = cleanParam(firstParam(params, ["parent", "parentSession", "parentSessionId"]));
  const source = cleanParam(firstParam(params, ["source", "from"]));
  const id =
    cleanParam(firstParam(params, ["chatRunId", "runId", "id"])) ??
    `${kind}-${initialSessionId ?? initialProfile ?? "default"}`;
  const label = chatRunLabel({
    rawLabel: firstParam(params, ["label", "title", "name"]),
    kind,
    initialProfile,
    initialSessionId,
  });
  const persistence: ChatRunPersistence = kind === "main" ? "persistent" : "temporary";

  return {
    id,
    kind,
    persistence,
    label,
    initialProfile,
    initialSessionId,
    parentSessionId,
    source,
    restoreGlobalState: kind === "main",
    persistGlobalState: kind === "main",
    allowSessionSnapshot: true,
  };
}

export function applyChatRunInitialProfile(
  state: OrchestrationState,
  context: Pick<ChatRunContext, "initialProfile">,
): OrchestrationState {
  const profile = context.initialProfile?.trim();
  if (!profile) return state;
  const defaultAgentId = state.workspace.defaultAgentId ?? state.agents[0]?.id;
  if (!defaultAgentId) return state;
  return {
    ...state,
    bindings: state.bindings.map((binding) =>
      binding.agentId === defaultAgentId ? { ...binding, hermesProfile: profile } : binding,
    ),
  };
}

export function sessionForChatRun(
  sessions: HermesTeamSessionSummary[],
  context: Pick<ChatRunContext, "initialSessionId">,
): HermesTeamSessionSummary | null {
  const id = context.initialSessionId?.trim();
  if (!id) return null;
  return sessions.find((session) => session.id === id || session.workspaceId === id) ?? null;
}

export function shouldRestoreGlobalState(context: Pick<ChatRunContext, "restoreGlobalState">): boolean {
  return context.restoreGlobalState;
}

export function shouldPersistGlobalState(context: Pick<ChatRunContext, "persistGlobalState">): boolean {
  return context.persistGlobalState;
}

export function shouldSaveSessionSnapshot(context: Pick<ChatRunContext, "allowSessionSnapshot">): boolean {
  return context.allowSessionSnapshot;
}

function chatRunLabel(input: {
  rawLabel: string | undefined;
  kind: ChatRunWindowKind;
  initialProfile?: string;
  initialSessionId?: string;
}): string {
  const explicit = cleanParam(input.rawLabel);
  if (explicit) return trimLabel(explicit);
  if (input.kind === "main") return "Main";
  if (input.initialProfile) return trimLabel(`Child · ${input.initialProfile}`);
  if (input.initialSessionId) return trimLabel(`Child · ${input.initialSessionId}`);
  return "Child";
}

function normalizeWindowKind(raw: string | undefined): ChatRunWindowKind {
  const value = raw?.trim().toLowerCase();
  if (value === "child" || value === "temporary" || value === "temp" || value === "parallel") {
    return "child";
  }
  return "main";
}

function paramsFromHref(href: string | undefined): URLSearchParams {
  const merged = new URLSearchParams();
  if (!href) return merged;
  try {
    const url = new URL(href, "app://hermes-team");
    mergeParams(merged, url.searchParams);
    const hash = url.hash.startsWith("#") ? url.hash.slice(1) : url.hash;
    const hashQuery = hash.includes("?") ? hash.slice(hash.indexOf("?") + 1) : hash;
    if (hashQuery.includes("=")) mergeParams(merged, new URLSearchParams(hashQuery));
  } catch {
    const raw = href.startsWith("?") || href.startsWith("#") ? href.slice(1) : href;
    mergeParams(merged, new URLSearchParams(raw));
  }
  return merged;
}

function mergeParams(target: URLSearchParams, source: URLSearchParams): void {
  source.forEach((value, key) => {
    if (!target.has(key)) target.set(key, value);
  });
}

function appendParam(params: URLSearchParams, key: string, value: string | undefined): void {
  const cleaned = cleanParam(value);
  if (cleaned) params.set(key, cleaned);
}

function firstParam(params: URLSearchParams, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = params.get(key);
    if (value != null) return value;
  }
  return undefined;
}

function cleanParam(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}

function trimLabel(value: string): string {
  return value.length > 80 ? `${value.slice(0, 77)}...` : value;
}

function trimWindowLabel(value: string): string {
  return value.length > 80 ? value.slice(0, 80).replace(/-+$/g, "") : value;
}
