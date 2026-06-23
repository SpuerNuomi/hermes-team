import type { Agent, CapabilityBinding, Message, Workspace } from "./types";

export const seedWorkspace: Workspace = {
  id: "workspace-hermes-chat",
  name: "Hermes Chat",
  description: "与 Hermes 助手开始一次新的聊天。",
  mode: "smart",
  defaultAgentId: "agent-hermes",
};

export const seedAgents: Agent[] = [
  {
    id: "agent-hermes",
    workspaceId: seedWorkspace.id,
    name: "Hermes",
    role: "AI Assistant",
    prompt: "负责理解用户请求、调用 Hermes 能力、返回清晰可靠的回答。",
    enabled: true,
    color: "#17201c",
  },
];

export const seedBindings: CapabilityBinding[] = [
  {
    agentId: "agent-hermes",
    hermesProfile: "default",
    toolsets: ["terminal", "file", "code_execution", "skills", "memory"],
    mcpServers: [],
    skills: [],
    memoryEnabled: true,
  },
];

export const seedMessages: Message[] = [];
