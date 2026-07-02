import { describe, expect, it } from "vitest";
import {
  applyArtifactsFromToolEvents,
  classifyArtifactKind,
  parseWriteToolEvent,
  registerArtifactFromToolEvent,
  resolveArtifactPath,
} from "../src/core/artifacts";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";

function emptyState(): OrchestrationState {
  return {
    workspace: seedWorkspace,
    agents: seedAgents,
    bindings: seedBindings,
    messages: [],
    tasks: [],
    logs: [],
    artifacts: [],
  };
}

describe("artifacts", () => {
  it("parses completed write tool events", () => {
    const parsed = parseWriteToolEvent("completed · write: src/index.ts\n{\"path\":\"src/index.ts\"}");
    expect(parsed?.status).toBe("completed");
    expect(parsed?.toolName).toBe("write");
    expect(parsed?.pathHint).toBe("src/index.ts");
  });

  it("ignores read-only tools", () => {
    expect(parseWriteToolEvent("completed · read: src/index.ts")).toBeNull();
  });

  it("registers artifacts on completed write tools", () => {
    const next = registerArtifactFromToolEvent(emptyState(), {
      taskId: "task-1",
      callId: "call-1",
      content: "completed · write: CHANGELOG.md",
      workDir: "/tmp/todo-cli",
    });
    expect(next.artifacts).toHaveLength(1);
    expect(next.artifacts?.[0]?.path).toBe("/tmp/todo-cli/CHANGELOG.md");
    expect(next.artifacts?.[0]?.kind).toBe("doc");
  });

  it("merges duplicate paths within the same task", () => {
    const base = registerArtifactFromToolEvent(emptyState(), {
      taskId: "task-1",
      callId: "call-1",
      content: "completed · write: src/index.ts",
      workDir: "/tmp/todo-cli",
    });
    const next = registerArtifactFromToolEvent(base, {
      taskId: "task-1",
      callId: "call-2",
      content: "completed · write: src/index.ts",
      workDir: "/tmp/todo-cli",
    });
    expect(next.artifacts).toHaveLength(1);
  });

  it("classifies code and doc kinds", () => {
    expect(classifyArtifactKind("src/index.ts")).toBe("code");
    expect(classifyArtifactKind("CHANGELOG.md")).toBe("doc");
  });

  it("resolves relative paths against work dir", () => {
    expect(resolveArtifactPath("src/old.ts", "/Users/admin/hermes-acc/todo-cli")).toBe(
      "/Users/admin/hermes-acc/todo-cli/src/old.ts",
    );
  });

  it("applies artifacts from streamed tool events", () => {
    const next = applyArtifactsFromToolEvents(
      emptyState(),
      [
        {
          kind: "tool",
          taskId: "task-1",
          message: "abc",
          content: "completed · write: src/index.ts",
        },
      ],
      "/tmp/todo-cli",
    );
    expect(next.artifacts).toHaveLength(1);
  });
});
