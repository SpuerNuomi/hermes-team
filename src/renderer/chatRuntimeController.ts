import { completeTaskWithAgentMessage, type OrchestrationState } from "../core/orchestrator";
import type { Agent, CapabilityBinding, MessageAttachment } from "../core/types";
import {
  runHermesTaskStream,
  type HermesProfileInfo,
  type RunHermesAgentOutput,
} from "../runtime/hermes-runtime";
import { parseBackgroundCommand, parseBrowseCommand } from "./chatCommands";
import { isLocalReplyCommand, slashCommandName } from "./chatInput/localCommands";
import { applyStreamEventSnapshot } from "./chatStreamState";

export interface ParallelChatRunSessionPlan {
  taskId: string;
  agentId: string;
  agentName: string;
  profile: string;
  sessionId: string;
  parentSessionId: string;
  source: string;
  label: string;
  state: OrchestrationState;
}

export type SendMessagePlan =
  | { kind: "empty" }
  | { kind: "browse"; url: string }
  | { kind: "new-session" }
  | { kind: "clear-session" }
  | { kind: "fast-mode" }
  | { kind: "local-reply" }
  | { kind: "queue"; text: string; attachments: MessageAttachment[] }
  | {
      kind: "dispatch";
      content: string;
      attachments: MessageAttachment[];
      background: boolean;
    };

export interface PlanSendMessageInput {
  draft: string;
  draftAttachments: MessageAttachment[];
  contentOverride?: string;
  hasActiveTasks: boolean;
  attachmentFallbackText: string;
}

export function planSendMessage(input: PlanSendMessageInput): SendMessagePlan {
  const content = (input.contentOverride ?? input.draft).trim();
  if (!content && input.draftAttachments.length === 0) return { kind: "empty" };

  const browseUrl = parseBrowseCommand(content);
  if (browseUrl) return { kind: "browse", url: browseUrl };

  const slashName = slashCommandName(content);
  if (slashName === "/new") return { kind: "new-session" };
  if (slashName === "/clear") return { kind: "clear-session" };
  if (slashName === "/fast") return { kind: "fast-mode" };
  if (isLocalReplyCommand(content)) return { kind: "local-reply" };

  const attachments = input.contentOverride ? [] : input.draftAttachments;
  const backgroundQuestion = parseBackgroundCommand(content);
  if (input.hasActiveTasks && backgroundQuestion === null) {
    return {
      kind: "queue",
      text: content || input.attachmentFallbackText,
      attachments,
    };
  }

  return {
    kind: "dispatch",
    content:
      backgroundQuestion !== null
        ? `💭 ${backgroundQuestion || content}`
        : content || input.attachmentFallbackText,
    attachments,
    background: backgroundQuestion !== null,
  };
}

export type TaskRuntimeContext =
  | { kind: "missing-task" }
  | { kind: "missing-agent" }
  | {
      kind: "ready";
      task: OrchestrationState["tasks"][number];
      agent: Agent;
      binding: CapabilityBinding | undefined;
      effectiveBinding: CapabilityBinding | undefined;
      profileName: string;
      selectedProfile: HermesProfileInfo | undefined;
    };

export function resolveTaskRuntimeContext(
  state: OrchestrationState,
  taskId: string,
  profiles: HermesProfileInfo[],
): TaskRuntimeContext {
  const task = state.tasks.find((item) => item.id === taskId);
  if (!task) return { kind: "missing-task" };

  const agent = state.agents.find((item) => item.id === task.agentId);
  if (!agent) return { kind: "missing-agent" };

  const binding = state.bindings.find((item) => item.agentId === agent.id);
  const profileName = binding?.hermesProfile ?? "default";
  const selectedProfile = profiles.find((profile) => profile.name === profileName);
  const sessionOverride = state.workspace.modelOverride;
  const effectiveBinding =
    binding && sessionOverride?.model
      ? { ...binding, model: sessionOverride.model }
      : binding;

  return {
    kind: "ready",
    task,
    agent,
    binding,
    effectiveBinding,
    profileName,
    selectedProfile,
  };
}

export function planParallelChatRunSessions(
  state: OrchestrationState,
  taskIds: string[],
): ParallelChatRunSessionPlan[] {
  const idSet = new Set(taskIds);
  return state.tasks
    .filter((task) => idSet.has(task.id))
    .map((task) => {
      const agent = state.agents.find((item) => item.id === task.agentId);
      const binding = state.bindings.find((item) => item.agentId === task.agentId);
      const profile = binding?.hermesProfile ?? "default";
      const agentName = agent?.name ?? task.agentId;
      const sessionId = `chatrun-${task.id}`;
      const label = `Child · ${agentName} · ${profile}`;
      const childState: OrchestrationState = {
        ...state,
        workspace: {
          ...state.workspace,
          id: sessionId,
          name: label,
          defaultAgentId: task.agentId,
        },
        agents: state.agents.map((item) => ({ ...item, workspaceId: sessionId })),
        messages: state.messages.map((message) => ({ ...message, workspaceId: sessionId })),
        tasks: [
          {
            ...task,
            workspaceId: sessionId,
            status: "pending",
            completedAt: undefined,
          },
        ],
      };
      return {
        taskId: task.id,
        agentId: task.agentId,
        agentName,
        profile,
        sessionId,
        parentSessionId: state.workspace.id,
        source: "parallel",
        label,
        state: childState,
      };
    });
}

export function detachParallelChatRunTasks(
  state: OrchestrationState,
  taskIds: string[],
  systemContent: string,
): OrchestrationState {
  const idSet = new Set(taskIds);
  const firstTask = state.tasks.find((task) => idSet.has(task.id));
  return {
    ...state,
    tasks: state.tasks.filter((task) => !idSet.has(task.id)),
    messages: [
      ...state.messages,
      {
        id: `chatrun-launch-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        workspaceId: state.workspace.id,
        authorKind: "system",
        authorName: "系统",
        content: systemContent,
        createdAt: Date.now(),
        replyToMessageId: firstTask?.triggerMessageId,
      },
    ],
  };
}

export async function executeTaskRuntimeStream(
  context: Extract<TaskRuntimeContext, { kind: "ready" }>,
  messages: OrchestrationState["messages"],
): Promise<RunHermesAgentOutput> {
  return runHermesTaskStream({
    task: context.task,
    agent: context.agent,
    binding: context.effectiveBinding,
    messages,
  });
}

export interface ApplyTaskStreamOutputLabels {
  generating: string;
}

export function applyTaskStreamOutput(
  state: OrchestrationState,
  taskId: string,
  output: RunHermesAgentOutput,
  labels: ApplyTaskStreamOutputLabels,
  completedAt = Date.now(),
): OrchestrationState {
  const content = output.content;
  const streamMessageId = `stream-${taskId}`;
  const hasStreamMessage = state.messages.some((message) => message.id === streamMessageId);

  if (!hasStreamMessage) {
    const replayedState = (output.events ?? []).reduce(
      (nextState, event) => applyStreamEventSnapshot(nextState, event, { generating: labels.generating }),
      state,
    );
    if (replayedState.messages.some((message) => message.id === streamMessageId)) {
      return completeReplayedStreamMessage(replayedState, taskId, content, labels.generating, completedAt);
    }
    return completeTaskWithAgentMessage({
      state,
      taskId,
      content,
    });
  }

  return completeReplayedStreamMessage(state, taskId, content, labels.generating, completedAt);
}

function completeReplayedStreamMessage(
  state: OrchestrationState,
  taskId: string,
  content: string,
  generatingLabel: string,
  completedAt: number,
): OrchestrationState {
  const streamMessageId = `stream-${taskId}`;
  const shouldReplacePlaceholder = content.trim().length > 0;
  return {
    ...state,
    messages: state.messages.map((message) =>
      message.id === streamMessageId && shouldReplacePlaceholder
        ? {
            ...message,
            content:
              message.content === generatingLabel || message.content.trim().length === 0
                ? content
                : message.content,
          }
        : message,
    ),
    tasks: state.tasks.map((item) =>
      item.id === taskId ? { ...item, status: "completed", completedAt } : item,
    ),
  };
}
