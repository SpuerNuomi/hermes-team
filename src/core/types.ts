export type WorkspaceMode = "manual" | "smart";

export interface Workspace {
  id: string;
  name: string;
  description: string;
  mode: WorkspaceMode;
  defaultAgentId?: string;
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
  authorKind: "user" | "agent" | "system";
  authorId?: string;
  authorName: string;
  content: string;
  createdAt: number;
  replyToMessageId?: string;
  attachments?: MessageAttachment[];
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
