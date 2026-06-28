import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";
import type { DispatchTask } from "../src/core/types";
import type { ChatRunWindowClosedEvent, HermesTeamSessionSummary } from "../src/runtime/hermes-runtime";
import {
  chatRunClosedDedupKey,
  chatRunClosedSessionLookupId,
  isChatRunClosedForWorkspace,
  summarizeChatRunSession,
} from "../src/renderer/chatRunLifecycle";

function state(tasks: DispatchTask[]): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-current" },
    agents: seedAgents.map((agent) => ({ ...agent, workspaceId: "workspace-current" })),
    bindings: seedBindings.map((binding) => ({ ...binding })),
    messages: [],
    tasks,
    logs: [],
  };
}

function task(id: string, status: DispatchTask["status"]): DispatchTask {
  return {
    id,
    workspaceId: "workspace-current",
    agentId: "agent-hermes",
    triggerMessageId: "message-1",
    instruction: "Work",
    status,
    createdAt: 1,
  };
}

function session(tasks: DispatchTask[]): HermesTeamSessionSummary {
  return {
    id: "session-1",
    workspaceId: "workspace-current",
    title: "Child run",
    updatedAt: 1,
    messageCount: 0,
    taskCount: tasks.length,
    state: state(tasks),
  };
}

function closedEvent(overrides: Partial<ChatRunWindowClosedEvent> = {}): ChatRunWindowClosedEvent {
  return {
    windowLabel: "chat-run-task-1",
    chatRunId: "task-1",
    sessionId: "session-1",
    parentSessionId: "parent-1",
    source: "planner",
    title: "Child run",
    ...overrides,
  };
}

describe("chat run lifecycle", () => {
  it("uses stable identifiers for closed child session lookup and deduping", () => {
    expect(chatRunClosedSessionLookupId(closedEvent())).toBe("session-1");
    expect(chatRunClosedDedupKey(closedEvent())).toBe("session-1");
    expect(chatRunClosedSessionLookupId(closedEvent({ sessionId: " " }))).toBe("task-1");
    expect(chatRunClosedSessionLookupId(closedEvent({ sessionId: " ", chatRunId: " " }))).toBe(
      "chat-run-task-1",
    );
  });

  it("matches close events only to their parent workspace", () => {
    expect(isChatRunClosedForWorkspace(closedEvent(), "parent-1")).toBe(true);
    expect(isChatRunClosedForWorkspace(closedEvent(), "other")).toBe(false);
    expect(isChatRunClosedForWorkspace(closedEvent({ parentSessionId: " " }), "parent-1")).toBe(false);
  });

  it("summarizes child task status without mutating session state", () => {
    const summary = summarizeChatRunSession(
      session([
        task("completed-1", "completed"),
        task("failed-1", "failed"),
        task("cancelled-1", "cancelled"),
        task("pending-1", "pending"),
        task("running-1", "running"),
      ]),
    );

    expect(summary).toEqual({
      total: 5,
      completed: 1,
      failed: 1,
      cancelled: 1,
      pending: 1,
      running: 1,
      unfinished: 2,
    });
  });
});
