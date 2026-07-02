import { classifyAssistantHandoff } from "./handoff";
import { parseMentions } from "./mention-parser";
import type {
  Agent,
  Artifact,
  CapabilityBinding,
  CoordinatorDecision,
  DispatchAssignment,
  DispatchTask,
  Message,
  MessageAttachment,
  Workspace,
} from "./types";

export interface DispatchLogEntry {
  id: string;
  createdAt: number;
  triggerMessageId: string;
  decision: CoordinatorDecision;
  status: "success" | "skipped" | "blocked";
}

export interface OrchestrationState {
  workspace: Workspace;
  agents: Agent[];
  bindings: CapabilityBinding[];
  messages: Message[];
  tasks: DispatchTask[];
  logs: DispatchLogEntry[];
  /** Task-scoped file artifacts produced by write/edit tools. */
  artifacts?: Artifact[];
}

export interface OrchestrationResult {
  state: OrchestrationState;
  notice: string;
  createdTaskIds: string[];
}

export function handleUserMessage(
  state: OrchestrationState,
  content: string,
  attachmentsOrNow: MessageAttachment[] | number = [],
  nowArg?: number,
): OrchestrationResult {
  const attachments = Array.isArray(attachmentsOrNow) ? attachmentsOrNow : [];
  const now = typeof attachmentsOrNow === "number" ? attachmentsOrNow : nowArg ?? Date.now();
  const userMessage = createMessage({
    workspaceId: state.workspace.id,
    authorKind: "user",
    authorName: "你",
    content,
    createdAt: now,
    attachments,
  });

  const agentNames = state.agents.filter((agent) => agent.enabled).map((agent) => agent.name);
  const mentions = parseMentions(content, agentNames).map((mention) => mention.name);
  const decision = decideForUserMessage(state, userMessage, mentions);
  const applied = applyDecision(
    {
      ...state,
      messages: [...state.messages, userMessage],
    },
    userMessage,
    decision,
    now + 1,
  );

  return {
    state: applied,
    notice: describeDecision(decision),
    createdTaskIds: applied.tasks
      .filter((task) => task.triggerMessageId === userMessage.id)
      .map((task) => task.id),
  };
}

export function handleAgentMessage(
  state: OrchestrationState,
  agentMessage: Message,
  now = Date.now(),
): OrchestrationResult {
  if (state.workspace.mode === "manual") {
    return {
      state: {
        ...state,
        messages: [...state.messages, agentMessage],
      },
      notice: "手动模式下，Agent 消息中的 @ 只展示，不自动触发。",
      createdTaskIds: [],
    };
  }

  const agentNames = state.agents.filter((agent) => agent.enabled).map((agent) => agent.name);
  const agentIdByName = new Map(state.agents.map((agent) => [agent.name, agent.id]));
  const handoff = classifyAssistantHandoff({
    mentionNames: parseMentions(agentMessage.content, agentNames).map((mention) => mention.name),
    selfAgentId: agentMessage.authorId,
    agentIdByName,
  });

  if (handoff.kind === "none") {
    return {
      state: {
        ...state,
        messages: [...state.messages, agentMessage],
      },
      notice: "Agent 回复未包含可触发接力，等待用户或 watchdog。",
      createdTaskIds: [],
    };
  }

  const decision: CoordinatorDecision =
    handoff.kind === "single"
      ? {
          type: "dispatch",
          mode: "single",
          assignments: [
            {
              agentId: agentIdByName.get(handoff.targetNames[0])!,
              instruction: `接续处理：${agentMessage.content}`,
            },
          ],
          reason: "assistant_single_handoff",
        }
      : {
          type: "dispatch",
          mode: "parallel",
          assignments: handoff.targetNames.map((name) => ({
            agentId: agentIdByName.get(name)!,
            instruction: `并行处理来自 ${agentMessage.authorName} 的交接：${agentMessage.content}`,
          })),
          reason: "assistant_multi_handoff",
        };

  const applied = applyDecision(
    {
      ...state,
      messages: [...state.messages, agentMessage],
    },
    agentMessage,
    decision,
    now + 1,
  );

  return {
    state: applied,
    notice: describeDecision(decision),
    createdTaskIds: applied.tasks
      .filter((task) => task.triggerMessageId === agentMessage.id)
      .map((task) => task.id),
  };
}

export function markTaskRunning(
  state: OrchestrationState,
  taskId: string,
): OrchestrationState {
  return {
    ...state,
    tasks: state.tasks.map((task) =>
      task.id === taskId ? { ...task, status: "running" } : task,
    ),
  };
}

export function appendTask(params: {
  state: OrchestrationState;
  workspaceId: string;
  agentId: string;
  triggerMessageId: string;
  instruction: string;
  createdAt?: number;
}): { state: OrchestrationState; taskId: string } {
  const task = createTask({
    workspaceId: params.workspaceId,
    triggerMessageId: params.triggerMessageId,
    assignment: {
      agentId: params.agentId,
      instruction: params.instruction,
    },
    createdAt: params.createdAt ?? Date.now(),
  });
  return {
    state: {
      ...params.state,
      tasks: [task, ...params.state.tasks],
    },
    taskId: task.id,
  };
}

export function appendSystemMessage(params: {
  state: OrchestrationState;
  content: string;
  replyToMessageId?: string;
  createdAt?: number;
}): OrchestrationState {
  return {
    ...params.state,
    messages: [
      ...params.state.messages,
      createMessage({
        workspaceId: params.state.workspace.id,
        authorKind: "system",
        authorName: "系统",
        content: params.content,
        createdAt: params.createdAt ?? Date.now(),
        replyToMessageId: params.replyToMessageId,
      }),
    ],
  };
}

export function completeTaskWithAgentMessage(params: {
  state: OrchestrationState;
  taskId: string;
  content: string;
  createdAt?: number;
}): OrchestrationState {
  const task = params.state.tasks.find((item) => item.id === params.taskId);
  if (!task) return params.state;
  const agent = params.state.agents.find((item) => item.id === task.agentId);
  const now = params.createdAt ?? Date.now();
  const message = createMessage({
    workspaceId: task.workspaceId,
    authorKind: "agent",
    authorId: agent?.id,
    authorName: agent?.name ?? "未知 Agent",
    content: params.content,
    createdAt: now,
    replyToMessageId: task.triggerMessageId,
  });

  return {
    ...params.state,
    messages: [...params.state.messages, message],
    tasks: params.state.tasks.map((item) =>
      item.id === task.id
        ? { ...item, status: "completed", completedAt: now }
        : item,
    ),
  };
}

export function failTaskWithSystemMessage(params: {
  state: OrchestrationState;
  taskId: string;
  error: string;
  createdAt?: number;
}): OrchestrationState {
  const task = params.state.tasks.find((item) => item.id === params.taskId);
  if (!task) return params.state;
  const now = params.createdAt ?? Date.now();
  const message = createMessage({
    workspaceId: task.workspaceId,
    authorKind: "system",
    authorName: "系统",
    content: `真实 Hermes Runtime 调用失败：${params.error}`,
    createdAt: now,
    replyToMessageId: task.triggerMessageId,
  });

  return {
    ...params.state,
    messages: [...params.state.messages, message],
    tasks: params.state.tasks.map((item) =>
      item.id === task.id
        ? { ...item, status: "failed", completedAt: now }
        : item,
    ),
  };
}

export function cancelTaskWithSystemMessage(params: {
  state: OrchestrationState;
  taskId: string;
  reason?: string;
  createdAt?: number;
}): OrchestrationState {
  const task = params.state.tasks.find((item) => item.id === params.taskId);
  if (!task) return params.state;
  const now = params.createdAt ?? Date.now();
  const message = createMessage({
    workspaceId: task.workspaceId,
    authorKind: "system",
    authorName: "系统",
    content: params.reason ? `任务已取消：${params.reason}` : "任务已取消。",
    createdAt: now,
    replyToMessageId: task.triggerMessageId,
  });

  return {
    ...params.state,
    messages: [...params.state.messages, message],
    tasks: params.state.tasks.map((item) =>
      item.id === task.id
        ? { ...item, status: "cancelled", completedAt: now }
        : item,
    ),
  };
}

function decideForUserMessage(
  state: OrchestrationState,
  message: Message,
  mentionNames: string[],
): CoordinatorDecision {
  const agentByName = new Map(state.agents.map((agent) => [agent.name, agent]));
  const mentionedAgents = mentionNames
    .map((name) => agentByName.get(name))
    .filter((agent): agent is Agent => !!agent && agent.enabled);

  if (state.workspace.mode === "manual") {
    if (mentionedAgents.length === 0) {
      return {
        type: "no_action",
        reason: "manual_mode_without_target",
      };
    }
    return {
      type: "dispatch",
      mode: "single",
      assignments: [
        {
          agentId: mentionedAgents[0].id,
          instruction: stripLeadingMention(message.content, mentionedAgents[0].name),
        },
      ],
      reason: "manual_explicit_target",
    };
  }

  if (mentionedAgents.length === 1) {
    return {
      type: "dispatch",
      mode: "single",
      assignments: [
        {
          agentId: mentionedAgents[0].id,
          instruction: stripLeadingMention(message.content, mentionedAgents[0].name),
        },
      ],
      reason: "user_explicit_target",
    };
  }

  if (mentionedAgents.length > 1) {
    const serialRequested = /(^|\s)\/serial(\s|$)|串行|依次|按顺序/.test(message.content);
    return {
      type: "dispatch",
      mode: serialRequested ? "serial" : "parallel",
      assignments: mentionedAgents.map((agent) => ({
        agentId: agent.id,
        instruction: stripLeadingMention(message.content, agent.name),
      })),
      reason: serialRequested ? "user_serial_targets" : "user_parallel_targets",
    };
  }

  const defaultAgent = state.workspace.defaultAgentId
    ? state.agents.find((agent) => agent.id === state.workspace.defaultAgentId && agent.enabled)
    : undefined;

  if (defaultAgent) {
    return {
      type: "dispatch",
      mode: "single",
      assignments: [
        {
          agentId: defaultAgent.id,
          instruction: message.content,
        },
      ],
      reason: "workspace_default_agent",
    };
  }

  return {
    type: "ask_user",
    question: "当前没有可用的 Hermes Agent。请在设置中确认默认 profile 和 Agent 配置。",
    reason: "smart_mode_without_route",
  };
}

function applyDecision(
  state: OrchestrationState,
  triggerMessage: Message,
  decision: CoordinatorDecision,
  now: number,
): OrchestrationState {
  const log: DispatchLogEntry = {
    id: createId("log"),
    createdAt: now,
    triggerMessageId: triggerMessage.id,
    decision,
    status: decision.type === "dispatch" ? "success" : decision.type === "blocked" ? "blocked" : "skipped",
  };

  if (decision.type !== "dispatch") {
    const systemMessage =
      decision.type === "ask_user"
        ? createMessage({
            workspaceId: state.workspace.id,
            authorKind: "system",
            authorName: "系统",
            content: decision.question,
            createdAt: now + 1,
          })
        : undefined;

    return {
      ...state,
      logs: [log, ...state.logs],
      messages: systemMessage ? [...state.messages, systemMessage] : state.messages,
    };
  }

  const taskAssignments = decision.mode === "serial"
    ? decision.assignments.slice(0, 1)
    : decision.assignments;
  const tasks = taskAssignments.map((assignment, index) =>
    createTask({
      workspaceId: state.workspace.id,
      triggerMessageId: triggerMessage.id,
      assignment,
      createdAt: now + index,
    }),
  );

  return {
    ...state,
    tasks: [...tasks, ...state.tasks],
    logs: [log, ...state.logs],
    messages: state.messages,
  };
}

function createTask(params: {
  workspaceId: string;
  triggerMessageId: string;
  assignment: DispatchAssignment;
  createdAt: number;
}): DispatchTask {
  return {
    id: createId("task"),
    workspaceId: params.workspaceId,
    agentId: params.assignment.agentId,
    triggerMessageId: params.triggerMessageId,
    instruction: params.assignment.instruction,
    status: "pending",
    createdAt: params.createdAt,
  };
}

function createMessage(input: Omit<Message, "id"> & { id?: string }): Message {
  return {
    id: input.id ?? createId("msg"),
    ...input,
  };
}

function stripLeadingMention(content: string, agentName: string): string {
  return content.replace(new RegExp(`^\\s*@${escapeRegExp(agentName)}\\s*`), "").trim() || content.trim();
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function createId(prefix: string): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function describeDecision(decision: CoordinatorDecision): string {
  if (decision.type === "dispatch") {
    if (decision.mode === "parallel") return `已启动 ${decision.assignments.length} 个 Hermes 任务。`;
    if (decision.mode === "serial") return `已创建 ${decision.assignments.length} 步 Hermes 任务。`;
    return "Hermes 正在处理。";
  }
  if (decision.type === "ask_user") return "需要先完成 Hermes Agent 配置。";
  if (decision.type === "blocked") return `任务被阻断：${decision.reason}`;
  return "未启动 Hermes 任务。";
}
