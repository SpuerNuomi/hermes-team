import type { MessageAttachment } from "../core/types";

export type TranslateFn = (key: string, vars?: Record<string, string | number>) => string;

export type ActiveView = "team" | "sessions" | "discover" | "kanban" | "multiagent" | "office" | "settings";

export type SettingsPanel =
  | "overview"
  | "appearance"
  | "privacy"
  | "network"
  | "profiles"
  | "providers"
  | "models"
  | "gateway"
  | "messaging"
  | "schedules"
  | "capabilities"
  | "skills"
  | "memory"
  | "update"
  | "logs";

export type InspectorPanel = "agents" | "dispatch" | "sessions" | "runtime" | "logs";

export type ModelForm = {
  id?: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  contextLength: string;
};

export type ProviderKeyDrafts = Record<string, string>;

export type PoolForm = {
  provider: string;
  apiKey: string;
  label: string;
};

export type ProfileForm = {
  name: string;
  cloneConfig: boolean;
};

export type McpForm = {
  name: string;
  transport: "http" | "stdio";
  url: string;
  command: string;
  args: string;
  env: string;
  auth: string;
  enabled: boolean;
};

export type SkillInstallForm = {
  sourcePath: string;
  category: string;
  name: string;
};

export type MessagingEnvDrafts = Record<string, Record<string, string>>;

export type RuntimeEvent = {
  id: string;
  taskId: string;
  label: string;
  detail: string;
  createdAt: number;
  level: "info" | "ok" | "warning";
};

export type QueuedChatMessage = {
  id: string;
  text: string;
  attachments: MessageAttachment[];
};
