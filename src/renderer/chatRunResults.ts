import type { OrchestrationState } from "../core/orchestrator";
import type { DispatchTask, Message } from "../core/types";
import type { HermesTeamSessionSummary } from "../runtime/hermes-runtime";
import { summarizeChatRunSession, type ChatRunClosedTaskSummary } from "./chatRunLifecycle";

export type ChatRunBatchStatus = "idle" | "running" | "completed" | "failed" | "cancelled" | "partial";

export interface ChatRunResultRow {
  agentId: string;
  agentName: string;
  profile: string;
  instruction: string;
  sessionId: string | null;
  sessionTitle: string;
  taskId: string | null;
  status: DispatchTask["status"] | "missing";
  updatedAt: number | null;
  content: string;
  preview: string;
  summary: ChatRunClosedTaskSummary;
}

export interface ChatRunResultBatch {
  id: string;
  triggerMessageId: string;
  prompt: string;
  reason: string;
  createdAt: number;
  status: ChatRunBatchStatus;
  readyToMerge: boolean;
  rows: ChatRunResultRow[];
  summary: ChatRunClosedTaskSummary;
}

export interface ChatRunMergeMarkdownLabels {
  title: string;
  prompt: string;
  status: string;
  noResult: string;
  agent: string;
}

const TERMINAL_STATUSES = new Set<DispatchTask["status"]>(["completed", "failed", "cancelled"]);

export function buildChatRunResultBatches(
  state: OrchestrationState,
  sessions: HermesTeamSessionSummary[],
): ChatRunResultBatch[] {
  const agentById = new Map(state.agents.map((agent) => [agent.id, agent]));
  const bindingByAgent = new Map(state.bindings.map((binding) => [binding.agentId, binding]));
  const childSessions = sessions.filter(isChatRunSession);

  return state.logs
    .filter((log) => log.decision.type === "dispatch" && log.decision.mode === "parallel")
    .map((log) => {
      if (log.decision.type !== "dispatch") {
        throw new Error("unreachable");
      }
      const prompt = promptForTrigger(state, log.triggerMessageId);
      const rows = log.decision.assignments.map((assignment) => {
        const agent = agentById.get(assignment.agentId);
        const session = findSessionForAssignment(childSessions, log.triggerMessageId, assignment.agentId);
        const task = session?.state.tasks.find(
          (item) => item.triggerMessageId === log.triggerMessageId && item.agentId === assignment.agentId,
        );
        const resultMessage = session && task ? findResultMessage(session.state.messages, task) : null;
        const content = resultMessage?.content.trim() ?? "";
        return {
          agentId: assignment.agentId,
          agentName: agent?.name ?? assignment.agentId,
          profile:
            session?.state.bindings.find((binding) => binding.agentId === assignment.agentId)?.hermesProfile ??
            bindingByAgent.get(assignment.agentId)?.hermesProfile ??
            "default",
          instruction: assignment.instruction,
          sessionId: session?.id ?? null,
          sessionTitle: session?.title ?? "",
          taskId: task?.id ?? null,
          status: task?.status ?? "missing",
          updatedAt: session?.updatedAt ?? null,
          content,
          preview: previewText(content),
          summary: summarizeChatRunSession(session),
        } satisfies ChatRunResultRow;
      });
      const summary = mergeTaskSummaries(rows.map((row) => row.summary));
      const status = batchStatus(rows);
      return {
        id: log.id,
        triggerMessageId: log.triggerMessageId,
        prompt,
        reason: log.decision.reason,
        createdAt: log.createdAt,
        status,
        readyToMerge:
          rows.length > 0 &&
          rows.every((row) => row.sessionId && TERMINAL_STATUSES.has(row.status as DispatchTask["status"])),
        rows,
        summary,
      };
    });
}

export function buildChatRunMergeMarkdown(
  batch: ChatRunResultBatch,
  labels: ChatRunMergeMarkdownLabels,
): string {
  const lines = [
    `### ${labels.title}`,
    "",
    `**${labels.prompt}** ${batch.prompt || batch.reason}`,
    `**${labels.status}** ${batch.status}`,
    "",
  ];
  for (const row of batch.rows) {
    lines.push(`#### ${labels.agent}: ${row.agentName} · ${row.profile}`);
    lines.push(row.content || row.preview || labels.noResult);
    lines.push("");
  }
  return lines.join("\n").trim();
}

function isChatRunSession(session: HermesTeamSessionSummary): boolean {
  return (
    session.id.startsWith("chatrun-") ||
    session.workspaceId.startsWith("chatrun-") ||
    session.state.workspace.id.startsWith("chatrun-")
  );
}

function findSessionForAssignment(
  sessions: HermesTeamSessionSummary[],
  triggerMessageId: string,
  agentId: string,
): HermesTeamSessionSummary | null {
  return (
    sessions.find((session) =>
      session.state.tasks.some((task) => task.triggerMessageId === triggerMessageId && task.agentId === agentId),
    ) ?? null
  );
}

function findResultMessage(messages: Message[], task: DispatchTask): Message | null {
  const streamId = `stream-${task.id}`;
  return (
    [...messages]
      .reverse()
      .find(
        (message) =>
          message.content.trim() &&
          (message.id === streamId ||
            (message.authorKind === "agent" && message.authorId === task.agentId) ||
            (message.replyToMessageId === task.triggerMessageId &&
              (message.authorKind === "agent" || message.authorKind === "system"))),
      ) ?? null
  );
}

function promptForTrigger(state: OrchestrationState, triggerMessageId: string): string {
  return state.messages.find((message) => message.id === triggerMessageId)?.content.trim() ?? "";
}

function previewText(content: string, max = 220): string {
  const normalized = content.replace(/\s+/g, " ").trim();
  return normalized.length > max ? `${normalized.slice(0, max - 1)}...` : normalized;
}

function batchStatus(rows: ChatRunResultRow[]): ChatRunBatchStatus {
  if (rows.length === 0 || rows.every((row) => row.status === "missing")) return "idle";
  if (rows.some((row) => row.status === "running" || row.status === "pending")) return "running";
  if (rows.some((row) => row.status === "failed")) return "failed";
  if (rows.every((row) => row.status === "cancelled")) return "cancelled";
  if (rows.every((row) => row.status === "completed")) return "completed";
  return "partial";
}

function mergeTaskSummaries(summaries: ChatRunClosedTaskSummary[]): ChatRunClosedTaskSummary {
  return summaries.reduce(
    (next, item) => ({
      total: next.total + item.total,
      completed: next.completed + item.completed,
      failed: next.failed + item.failed,
      cancelled: next.cancelled + item.cancelled,
      pending: next.pending + item.pending,
      running: next.running + item.running,
      unfinished: next.unfinished + item.unfinished,
    }),
    {
      total: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
      pending: 0,
      running: 0,
      unfinished: 0,
    },
  );
}
