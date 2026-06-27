import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";
import type { DispatchTask, Message } from "../src/core/types";
import type { HermesTeamSessionSummary } from "../src/runtime/hermes-runtime";
import {
  normalizeSessionIds,
  planNewSession,
  planSessionDeletion,
  planSessionRestore,
} from "../src/renderer/sessionLifecycle";

function makeState(overrides: Partial<OrchestrationState> = {}): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-current", mode: "smart" },
    agents: seedAgents.map((agent) => ({ ...agent, workspaceId: "workspace-current" })),
    bindings: seedBindings,
    messages: [],
    tasks: [],
    logs: [],
    ...overrides,
  };
}

function makeMessage(id = "msg-1"): Message {
  return {
    id,
    workspaceId: "workspace-current",
    authorKind: "user",
    authorName: "You",
    content: "hello",
    createdAt: 1,
  };
}

function makeTask(status: DispatchTask["status"] = "running"): DispatchTask {
  return {
    id: "task-1",
    workspaceId: "workspace-current",
    agentId: seedAgents[0].id,
    triggerMessageId: "msg-1",
    instruction: "answer",
    status,
    createdAt: 1,
  };
}

function makeSummary(state: OrchestrationState | null): HermesTeamSessionSummary {
  return {
    id: "session-1",
    workspaceId: state?.workspace.id ?? "missing",
    title: "Saved session",
    updatedAt: 2,
    messageCount: state?.messages.length ?? 0,
    taskCount: state?.tasks.length ?? 0,
    state: state as OrchestrationState,
  };
}

describe("session lifecycle planning", () => {
  it("blocks a new session while tasks are active", () => {
    const plan = planNewSession(makeState({ tasks: [makeTask("running")] }), "smart");

    expect(plan.kind).toBe("blocked-active-tasks");
  });

  it("keeps a scratch session instead of creating another blank workspace", () => {
    const plan = planNewSession(makeState(), "smart");

    expect(plan.kind).toBe("scratch");
  });

  it("plans a fresh session when the current workspace has content", () => {
    const plan = planNewSession(makeState({ messages: [makeMessage()] }), "manual");

    expect(plan.kind).toBe("open");
    if (plan.kind !== "open") return;
    expect(plan.previousWorkspaceId).toBe("workspace-current");
    expect(plan.nextState.workspace.id).not.toBe("workspace-current");
    expect(plan.nextState.workspace.mode).toBe("manual");
  });

  it("restores and normalizes a saved session state", () => {
    const savedState = makeState({
      workspace: { ...seedWorkspace, id: "workspace-saved", mode: "manual" },
      tasks: [makeTask("running")],
    });
    const plan = planSessionRestore(makeState(), makeSummary(savedState));

    expect(plan.kind).toBe("restore");
    if (plan.kind !== "restore") return;
    expect(plan.previousWorkspaceId).toBe("workspace-current");
    expect(plan.nextState.workspace.id).toBe("workspace-saved");
    expect(plan.nextState.tasks[0].status).toBe("failed");
  });

  it("deduplicates and trims requested session ids", () => {
    expect(normalizeSessionIds([" a ", "", "b", "a"])).toEqual(["a", "b"]);
  });

  it("blocks deleting the active session while tasks are active", () => {
    const plan = planSessionDeletion(makeState({ tasks: [makeTask("pending")] }), ["workspace-current"], "smart");

    expect(plan.kind).toBe("blocked-active-tasks");
  });

  it("resets to a fresh state after deleting the active session", () => {
    const plan = planSessionDeletion(makeState({ messages: [makeMessage()] }), [" other ", "workspace-current"], "smart");

    expect(plan.kind).toBe("delete-and-reset");
    if (plan.kind !== "delete-and-reset") return;
    expect(plan.ids).toEqual(["other", "workspace-current"]);
    expect(plan.removedIds.has("workspace-current")).toBe(true);
    expect(plan.nextState.workspace.id).not.toBe("workspace-current");
  });

  it("plans a delete-only operation for inactive sessions", () => {
    const plan = planSessionDeletion(makeState({ messages: [makeMessage()] }), ["archive-1"], "smart");

    expect(plan.kind).toBe("delete-only");
    if (plan.kind !== "delete-only") return;
    expect(plan.removedIds.has("archive-1")).toBe(true);
  });
});
