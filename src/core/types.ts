export type WorkspaceMode = "manual" | "smart";

/** Session-scoped work mode tier controlling tool permissions (Ask / Plan / Craft). */
export type WorkMode = "ask" | "plan" | "craft";

/**
 * A session-scoped model selection made from the in-chat model picker. Unlike
 * the persisted global default (`config.yaml`, surfaced as `ActiveModelConfig`),
 * this override belongs to one conversation only: it rides along with the
 * session snapshot, is restored when the session is reopened, and is absent on a
 * fresh chat so new conversations start on the global active model.
 *
 * It carries the full routing identity — not just the model name — so the picker
 * label and any later persisted save stay consistent. It stores only routing
 * identity, never API keys (those remain in the profile/global credential store).
 */
export interface SessionModelOverride {
  provider: string;
  model: string;
  baseUrl: string;
  contextLength?: number;
}

export interface Workspace {
  id: string;
  name: string;
  description: string;
  mode: WorkspaceMode;
  defaultAgentId?: string;
  /** Per-session model override; absent means "use the global active model". */
  modelOverride?: SessionModelOverride;
  /** Tool permission tier for this task/session. Defaults to ask when absent. */
  workMode?: WorkMode;
  /** When true, destructive Craft operations skip per-action confirmation for this session. */
  destructiveApproved?: boolean;
}

export interface Agent {
  id: string;
  workspaceId: string;
  name: string;
  role: string;
  prompt: string;
  enabled: boolean;
  color: string;
}

export interface CapabilityBinding {
  agentId: string;
  hermesProfile: string;
  model?: string;
  workDir?: string;
  toolsets: string[];
  mcpServers: string[];
  skills: string[];
  memoryEnabled: boolean;
}

export interface MessageAttachment {
  id: string;
  path?: string;
  name: string;
  kind: "file" | "path-ref" | "text-file" | "image";
  mime?: string;
  size?: number;
  text?: string;
  dataUrl?: string;
  originalSize?: number;
  createdAt: number;
}

export interface Message {
  id: string;
  workspaceId: string;
  kind?: "message" | "reasoning" | "tool" | "clarify";
  authorKind: "user" | "agent" | "system";
  authorId?: string;
  authorName: string;
  content: string;
  createdAt: number;
  replyToMessageId?: string;
  attachments?: MessageAttachment[];
  /** For `kind: "clarify"` — quick-pick options parsed from the question. */
  clarifyChoices?: string[];
  /** For `kind: "clarify"` — set once the user answers or skips the card. */
  clarifyResolved?: boolean;
  /** For `kind: "clarify"` — the answer the user submitted (empty = skipped). */
  clarifyAnswer?: string;
}

export interface DispatchAssignment {
  agentId: string;
  instruction: string;
}

export type DispatchMode = "single" | "parallel" | "serial";

export type CoordinatorDecision =
  | {
      type: "dispatch";
      mode: DispatchMode;
      assignments: DispatchAssignment[];
      reason: string;
    }
  | { type: "no_action"; reason: string }
  | { type: "ask_user"; question: string; reason: string }
  | { type: "blocked"; reason: string };

export interface DispatchTask {
  id: string;
  workspaceId: string;
  agentId: string;
  triggerMessageId: string;
  instruction: string;
  status: "pending" | "running" | "completed" | "failed" | "cancelled";
  createdAt: number;
  completedAt?: number;
}

/** File-based task output registered from write/edit tool events (Phase 2). */
export type ArtifactKind = "code" | "doc" | "report" | "other";

export interface ArtifactChange {
  added: number;
  removed: number;
}

export interface Artifact {
  id: string;
  taskId: string;
  path: string;
  kind: ArtifactKind;
  /** Source tool call / message id. */
  source: string;
  change?: ArtifactChange;
  status: "active" | "archived";
  createdAt: number;
  updatedAt: number;
}
