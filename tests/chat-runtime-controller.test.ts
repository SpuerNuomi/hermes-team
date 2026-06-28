import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";
import type { DispatchTask, MessageAttachment } from "../src/core/types";
import type { HermesProfileInfo } from "../src/runtime/hermes-runtime";
import {
  applyTaskStreamOutput,
  detachParallelChatRunTasks,
  planParallelChatRunSessions,
  planSendMessage,
  resolveTaskRuntimeContext,
} from "../src/renderer/chatRuntimeController";

function attachment(): MessageAttachment {
  return {
    id: "attachment-1",
    name: "note.txt",
    kind: "text-file",
    text: "hello",
    createdAt: 1,
  };
}

function task(): DispatchTask {
  return {
    id: "task-1",
    workspaceId: "workspace-current",
    agentId: "agent-hermes",
    triggerMessageId: "msg-1",
    instruction: "answer",
    status: "pending",
    createdAt: 1,
  };
}

function state(overrides: Partial<OrchestrationState> = {}): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-current" },
    agents: seedAgents.map((agent) => ({ ...agent, workspaceId: "workspace-current" })),
    bindings: seedBindings.map((binding) => ({ ...binding })),
    messages: [],
    tasks: [task()],
    logs: [],
    ...overrides,
  };
}

function parallelState(): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-parent" },
    agents: [
      { ...seedAgents[0], id: "agent-alpha", workspaceId: "workspace-parent", name: "Alpha" },
      { ...seedAgents[0], id: "agent-beta", workspaceId: "workspace-parent", name: "Beta" },
    ],
    bindings: [
      { ...seedBindings[0], agentId: "agent-alpha", hermesProfile: "alpha-profile" },
      { ...seedBindings[0], agentId: "agent-beta", hermesProfile: "beta-profile" },
    ],
    messages: [
      {
        id: "msg-1",
        workspaceId: "workspace-parent",
        authorKind: "user",
        authorName: "You",
        content: "@Alpha @Beta compare options",
        createdAt: 1,
      },
    ],
    tasks: [
      {
        id: "task-alpha",
        workspaceId: "workspace-parent",
        agentId: "agent-alpha",
        triggerMessageId: "msg-1",
        instruction: "compare options",
        status: "pending",
        createdAt: 2,
      },
      {
        id: "task-beta",
        workspaceId: "workspace-parent",
        agentId: "agent-beta",
        triggerMessageId: "msg-1",
        instruction: "compare options",
        status: "pending",
        createdAt: 3,
      },
    ],
    logs: [],
  };
}

function profile(name: string): HermesProfileInfo {
  return {
    name,
    active: name === "default",
    home: `/profiles/${name}`,
    gatewayUrl: "http://127.0.0.1:8642",
    hasApiKey: true,
    isDefault: name === "default",
    model: "model",
    provider: "provider",
    hasEnv: true,
    hasSoul: false,
    skillCount: 0,
    gatewayRunning: true,
  };
}

describe("chat runtime controller", () => {
  it("plans non-chat command paths before dispatch", () => {
    expect(planSendMessage({
      draft: "/browse https://example.test",
      draftAttachments: [],
      hasActiveTasks: false,
      attachmentFallbackText: "attachment",
    })).toEqual({ kind: "browse", url: "https://example.test" });

    expect(planSendMessage({
      draft: "/new",
      draftAttachments: [],
      hasActiveTasks: false,
      attachmentFallbackText: "attachment",
    })).toEqual({ kind: "new-session" });
  });

  it("queues foreground messages while tasks are active", () => {
    const file = attachment();
    const plan = planSendMessage({
      draft: "",
      draftAttachments: [file],
      hasActiveTasks: true,
      attachmentFallbackText: "attachment fallback",
    });

    expect(plan).toEqual({
      kind: "queue",
      text: "attachment fallback",
      attachments: [file],
    });
  });

  it("allows background messages while tasks are active", () => {
    const plan = planSendMessage({
      draft: "/background check this quietly",
      draftAttachments: [],
      hasActiveTasks: true,
      attachmentFallbackText: "attachment",
    });

    expect(plan).toEqual({
      kind: "dispatch",
      content: "💭 check this quietly",
      attachments: [],
      background: true,
    });
  });

  it("drops draft attachments when dispatching an override content", () => {
    const plan = planSendMessage({
      draft: "ignored",
      draftAttachments: [attachment()],
      contentOverride: "regenerate this",
      hasActiveTasks: false,
      attachmentFallbackText: "attachment",
    });

    expect(plan).toMatchObject({
      kind: "dispatch",
      content: "regenerate this",
      attachments: [],
      background: false,
    });
  });

  it("resolves task runtime context with session model override first", () => {
    const runtimeContext = resolveTaskRuntimeContext(
      state({
        workspace: {
          ...seedWorkspace,
          id: "workspace-current",
          modelOverride: {
            provider: "openai",
            model: "gpt-override",
            baseUrl: "https://api.example.test",
          },
        },
      }),
      "task-1",
      [profile("default")],
    );

    expect(runtimeContext.kind).toBe("ready");
    if (runtimeContext.kind !== "ready") return;
    expect(runtimeContext.profileName).toBe("default");
    expect(runtimeContext.selectedProfile?.name).toBe("default");
    expect(runtimeContext.binding?.model).toBeUndefined();
    expect(runtimeContext.effectiveBinding?.model).toBe("gpt-override");
  });

  it("plans independent child sessions for parallel chat runs", () => {
    const plans = planParallelChatRunSessions(parallelState(), ["task-alpha", "task-beta"]);

    expect(plans).toHaveLength(2);
    expect(plans[0]).toMatchObject({
      taskId: "task-alpha",
      agentId: "agent-alpha",
      agentName: "Alpha",
      profile: "alpha-profile",
      sessionId: "chatrun-task-alpha",
      parentSessionId: "workspace-parent",
      source: "parallel",
      label: "Child · Alpha · alpha-profile",
    });
    expect(plans[0].state.workspace).toMatchObject({
      id: "chatrun-task-alpha",
      defaultAgentId: "agent-alpha",
    });
    expect(plans[0].state.messages[0].workspaceId).toBe("chatrun-task-alpha");
    expect(plans[0].state.tasks).toEqual([
      expect.objectContaining({
        id: "task-alpha",
        workspaceId: "chatrun-task-alpha",
        status: "pending",
      }),
    ]);
  });

  it("detaches parallel child tasks from the main window state", () => {
    const next = detachParallelChatRunTasks(
      parallelState(),
      ["task-alpha", "task-beta"],
      "opened child windows",
    );

    expect(next.tasks).toEqual([]);
    expect(next.messages.at(-1)).toMatchObject({
      authorKind: "system",
      content: "opened child windows",
      replyToMessageId: "msg-1",
    });
  });

  it("completes a task with a fallback agent message when no stream replay exists", () => {
    const next = applyTaskStreamOutput(
      state(),
      "task-1",
      { content: "final answer", events: [] },
      { generating: "Generating..." },
      99,
    );

    expect(next.tasks[0]).toMatchObject({ id: "task-1", status: "completed" });
    expect(next.tasks[0].completedAt).toEqual(expect.any(Number));
    expect(next.messages.at(-1)).toMatchObject({
      authorKind: "agent",
      content: "final answer",
      replyToMessageId: "msg-1",
    });
  });

  it("replays stream events and replaces the placeholder on completion", () => {
    const next = applyTaskStreamOutput(
      state(),
      "task-1",
      {
        content: "final answer",
        events: [
          {
            taskId: "task-1",
            kind: "delta",
            delta: "",
            content: "Generating...",
            message: "",
          },
        ],
      },
      { generating: "Generating..." },
      123,
    );

    expect(next.tasks[0]).toMatchObject({ id: "task-1", status: "completed", completedAt: 123 });
    expect(next.messages.find((message) => message.id === "stream-task-1")).toMatchObject({
      content: "final answer",
    });
  });
});
