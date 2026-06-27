import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedWorkspace } from "../src/core/seed";
import type { HermesTeamSessionSummary } from "../src/runtime/hermes-runtime";
import {
  normalizeSessionFolder,
  optimisticMoveSessionFolder,
  optimisticPinSession,
  optimisticRemoveSessions,
  optimisticRenameSession,
  sessionSnapshotForSave,
  sessionProfileName,
  shouldPersistSessionSnapshot,
} from "../src/renderer/sessionActions";

function makeState(id: string, content?: string): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id },
    agents: [],
    bindings: [],
    messages: content
      ? [
          {
            id: "msg-1",
            workspaceId: id,
            authorKind: "user",
            authorName: "You",
            content,
            createdAt: 1,
          },
        ]
      : [],
    tasks: [],
    logs: [],
  };
}

function makeSession(id: string, overrides: Partial<HermesTeamSessionSummary> = {}): HermesTeamSessionSummary {
  const state = makeState(id);
  return {
    id,
    workspaceId: id,
    title: id,
    updatedAt: 1,
    messageCount: 0,
    taskCount: 0,
    state,
    ...overrides,
  };
}

describe("session actions", () => {
  it("chooses the current chat profile before the active profile", () => {
    expect(sessionProfileName("work", "default")).toBe("work");
    expect(sessionProfileName("", "default")).toBe("default");
    expect(sessionProfileName(null, null)).toBe("default");
  });

  it("applies optimistic title edits without touching other sessions", () => {
    const sessions = [makeSession("a"), makeSession("b")];
    const next = optimisticRenameSession(sessions, "b", "Renamed");

    expect(next[0]).toEqual(sessions[0]);
    expect(next[1]).toMatchObject({ title: "Renamed", titleEdited: true });
  });

  it("removes sessions optimistically by id set", () => {
    const next = optimisticRemoveSessions(
      [makeSession("a"), makeSession("b"), makeSession("c")],
      new Set(["a", "c"]),
    );

    expect(next.map((session) => session.id)).toEqual(["b"]);
  });

  it("updates pinned state optimistically", () => {
    const next = optimisticPinSession([makeSession("a", { pinned: false })], "a", true);

    expect(next[0].pinned).toBe(true);
  });

  it("normalizes and applies session folders", () => {
    expect(normalizeSessionFolder(" /tmp/project ")).toBe("/tmp/project");
    expect(normalizeSessionFolder("   ")).toBeNull();

    const next = optimisticMoveSessionFolder([makeSession("a")], "a", "/tmp/project");

    expect(next[0]).toMatchObject({
      contextFolder: "/tmp/project",
      folderEdited: true,
    });
  });

  it("only persists session snapshots once a conversation has messages", () => {
    expect(shouldPersistSessionSnapshot(makeState("empty"))).toBe(false);
    expect(shouldPersistSessionSnapshot(makeState("active", "hello"))).toBe(true);
  });

  it("preserves user-controlled session fields during auto-save snapshot creation", () => {
    const state = makeState("a", "new automatic title");
    const snapshot = sessionSnapshotForSave(state, [
      makeSession("a", {
        title: "Pinned title",
        titleEdited: true,
        pinned: true,
        folderEdited: true,
        contextFolder: "/manual/folder",
      }),
    ]);

    expect(snapshot).toMatchObject({
      id: "a",
      title: "Pinned title",
      titleEdited: true,
      pinned: true,
      folderEdited: true,
      contextFolder: "/manual/folder",
      messageCount: 1,
    });
  });
});
