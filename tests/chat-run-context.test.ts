import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";
import type { HermesTeamSessionSummary } from "../src/runtime/hermes-runtime";
import {
  applyChatRunInitialProfile,
  buildChatRunLaunchLabel,
  buildChatRunLaunchUrl,
  buildChatRunWindowLabel,
  buildChatRunWindowRequest,
  chatRunContextFromLocation,
  sessionForChatRun,
  shouldPersistGlobalState,
  shouldRestoreGlobalState,
  shouldSaveSessionSnapshot,
} from "../src/renderer/chatRunContext";

function state(): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-current" },
    agents: seedAgents.map((agent) => ({ ...agent, workspaceId: "workspace-current" })),
    bindings: [
      ...seedBindings.map((binding) => ({ ...binding })),
      {
        agentId: "agent-reviewer",
        hermesProfile: "review",
        toolsets: [],
        mcpServers: [],
        skills: [],
        memoryEnabled: false,
      },
    ],
    messages: [],
    tasks: [],
    logs: [],
  };
}

function session(
  id: string,
  overrides: Partial<HermesTeamSessionSummary> = {},
): HermesTeamSessionSummary {
  return {
    id,
    workspaceId: id,
    title: id,
    updatedAt: 1,
    messageCount: 0,
    taskCount: 0,
    state: state(),
    ...overrides,
  };
}

describe("chat run context", () => {
  it("builds child window requests for the Tauri window manager", () => {
    const request = buildChatRunWindowRequest({
      chatRunId: "run-1",
      profile: "research",
      sessionId: "session-1",
      parentSessionId: "parent-1",
      source: "planner",
    });

    expect(request).toEqual({
      windowLabel: "chat-run-run-1",
      chatRunId: "run-1",
      sessionId: "session-1",
      parentSessionId: "parent-1",
      source: "planner",
      url: "/?window=child&chatRunId=run-1&profile=research&sessionId=session-1&parentSessionId=parent-1&source=planner&label=Child+%C2%B7+planner+%C2%B7+research",
      title: "Hermes Team · Child · planner · research",
    });
  });

  it("normalizes child window labels separately from display labels", () => {
    expect(buildChatRunWindowLabel({ windowLabel: " Review Run 01 " })).toBe("chat-run-review-run-01");
    expect(buildChatRunWindowLabel({ chatRunId: "chat-run-session_42" })).toBe("chat-run-session_42");
    expect(buildChatRunWindowLabel({ profile: "Ops/Profile" })).toBe("chat-run-ops-profile");
    expect(buildChatRunWindowLabel({})).toBe("chat-run-child");
  });

  it("builds child launch URLs with stable query parameters", () => {
    const url = buildChatRunLaunchUrl({
      chatRunId: "run-1",
      profile: "research",
      sessionId: "session-1",
      parentSessionId: "parent-1",
      source: "planner",
    });

    expect(url).toBe(
      "/?window=child&chatRunId=run-1&profile=research&sessionId=session-1&parentSessionId=parent-1&source=planner&label=Child+%C2%B7+planner+%C2%B7+research",
    );
  });

  it("round-trips launch URLs through context parsing", () => {
    const context = chatRunContextFromLocation(
      buildChatRunLaunchUrl({
        chatRunId: "run-1",
        profile: "research",
        sessionId: "session-1",
        parentSessionId: "parent-1",
        source: "planner",
      }),
    );

    expect(context).toMatchObject({
      id: "run-1",
      kind: "child",
      persistence: "temporary",
      label: "Child · planner · research",
      initialProfile: "research",
      initialSessionId: "session-1",
      parentSessionId: "parent-1",
      source: "planner",
      restoreGlobalState: false,
      persistGlobalState: false,
    });
  });

  it("omits blank launch values and keeps explicit labels", () => {
    const url = buildChatRunLaunchUrl({
      kind: "child",
      profile: "  ",
      sessionId: "session-1",
      label: "  Focused review  ",
    });

    expect(url).toBe("/?window=child&sessionId=session-1&label=Focused+review");
  });

  it("builds readable default launch labels", () => {
    expect(buildChatRunLaunchLabel({ kind: "main", profile: "default" })).toBe("Main");
    expect(buildChatRunLaunchLabel({ profile: "ops" })).toBe("Child · ops");
    expect(buildChatRunLaunchLabel({ source: "planner", sessionId: "session-1" })).toBe(
      "Child · planner · session-1",
    );
  });

  it("defaults to a persistent main window context", () => {
    const context = chatRunContextFromLocation("tauri://localhost/");

    expect(context).toMatchObject({
      id: "main-default",
      kind: "main",
      persistence: "persistent",
      label: "Main",
      restoreGlobalState: true,
      persistGlobalState: true,
      allowSessionSnapshot: true,
    });
    expect(shouldRestoreGlobalState(context)).toBe(true);
    expect(shouldPersistGlobalState(context)).toBe(true);
    expect(shouldSaveSessionSnapshot(context)).toBe(true);
  });

  it("parses temporary child window query context", () => {
    const context = chatRunContextFromLocation(
      "tauri://localhost/?window=child&profile=research&session=session-1&parent=parent-1&source=planner&label=Research%20run",
    );

    expect(context).toMatchObject({
      id: "child-session-1",
      kind: "child",
      persistence: "temporary",
      label: "Research run",
      initialProfile: "research",
      initialSessionId: "session-1",
      parentSessionId: "parent-1",
      source: "planner",
      restoreGlobalState: false,
      persistGlobalState: false,
      allowSessionSnapshot: true,
    });
    expect(shouldRestoreGlobalState(context)).toBe(false);
    expect(shouldPersistGlobalState(context)).toBe(false);
    expect(shouldSaveSessionSnapshot(context)).toBe(true);
  });

  it("parses hash query parameters for routed child windows", () => {
    const context = chatRunContextFromLocation(
      "tauri://localhost/#/chat?chatRun=parallel&profile=ops&runId=run-42",
    );

    expect(context).toMatchObject({
      id: "run-42",
      kind: "child",
      initialProfile: "ops",
      initialSessionId: "run-42",
      label: "Child · ops",
      persistGlobalState: false,
    });
  });

  it("applies the initial profile only to the default chat binding", () => {
    const next = applyChatRunInitialProfile(state(), { initialProfile: "research" });

    expect(next.bindings.find((binding) => binding.agentId === "agent-hermes")).toMatchObject({
      hermesProfile: "research",
    });
    expect(next.bindings.find((binding) => binding.agentId === "agent-reviewer")).toMatchObject({
      hermesProfile: "review",
    });
  });

  it("finds an initial session by session id or workspace id", () => {
    const sessions = [
      session("session-a", { workspaceId: "workspace-a" }),
      session("session-b", { workspaceId: "workspace-b" }),
    ];

    expect(sessionForChatRun(sessions, { initialSessionId: "session-a" })?.id).toBe("session-a");
    expect(sessionForChatRun(sessions, { initialSessionId: "workspace-b" })?.id).toBe("session-b");
    expect(sessionForChatRun(sessions, { initialSessionId: "missing" })).toBeNull();
    expect(sessionForChatRun(sessions, {})).toBeNull();
  });
});
