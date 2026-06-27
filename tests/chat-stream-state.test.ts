import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedWorkspace } from "../src/core/seed";
import {
  applyStreamEventSnapshot,
  isDuplicateProcessSnapshot,
  mergeToolEventContent,
  parseClarifyChoices,
} from "../src/renderer/chatStreamState";

function stateWithTask(): OrchestrationState {
  return {
    workspace: seedWorkspace,
    agents: seedAgents,
    bindings: [],
    messages: [],
    tasks: [
      {
        id: "task-1",
        workspaceId: seedWorkspace.id,
        agentId: "agent-hermes",
        triggerMessageId: "msg-user",
        instruction: "answer",
        status: "running",
        createdAt: 1,
      },
    ],
    logs: [],
  };
}

describe("chat stream state", () => {
  it("parses clarify choices defensively", () => {
    expect(parseClarifyChoices('[" A ", "", "B", 3, "C", "D"]')).toEqual(["A", "B", "3", "C"]);
    expect(parseClarifyChoices("not-json")).toEqual([]);
  });

  it("prevents tool event content from regressing to a shorter snapshot", () => {
    const existing = "read file\nsearch files\ncomplete";

    expect(mergeToolEventContent(existing, "read file")).toBe(existing);
    expect(mergeToolEventContent(existing, "read file\nsearch files\ncomplete\nsummarize")).toContain("summarize");
  });

  it("detects duplicate reasoning and answer snapshots", () => {
    expect(isDuplicateProcessSnapshot("hello world", "hello    world")).toBe(true);
    expect(isDuplicateProcessSnapshot("hello world and more", "hello world")).toBe(true);
    expect(isDuplicateProcessSnapshot("tool output", "final answer")).toBe(false);
  });

  it("replays reasoning before the streamed answer placeholder", () => {
    const replayed = applyStreamEventSnapshot(
      stateWithTask(),
      {
        taskId: "task-1",
        kind: "reasoning",
        delta: "thinking",
        content: "",
        message: "",
      },
      { generating: "Generating..." },
    );

    expect(replayed.messages.map((message) => message.id)).toEqual([
      "reasoning-task-1",
      "stream-task-1",
    ]);
    expect(replayed.messages[0].kind).toBe("reasoning");
    expect(replayed.messages[1].content).toBe("Generating...");
  });

  it("replays clarify cards with choices", () => {
    const replayed = applyStreamEventSnapshot(
      stateWithTask(),
      {
        taskId: "task-1",
        kind: "clarify",
        delta: "Pick one",
        content: '["A","B"]',
        message: "clarify-1",
      },
      { generating: "Generating..." },
    );

    expect(replayed.messages[0]).toMatchObject({
      id: "clarify-task-1-clarify-1",
      kind: "clarify",
      content: "Pick one",
      clarifyChoices: ["A", "B"],
    });
  });

  it("can mark tasks completed for live done events without changing replay defaults", () => {
    const replayed = applyStreamEventSnapshot(
      stateWithTask(),
      {
        taskId: "task-1",
        kind: "done",
        delta: "",
        content: "Final answer",
        message: "",
      },
      { generating: "Generating..." },
    );
    const live = applyStreamEventSnapshot(
      stateWithTask(),
      {
        taskId: "task-1",
        kind: "done",
        delta: "",
        content: "Final answer",
        message: "",
      },
      { generating: "Generating...", completeDoneTask: true },
    );

    expect(replayed.tasks[0].status).toBe("running");
    expect(live.tasks[0].status).toBe("completed");
    expect(live.messages[0].content).toBe("Final answer");
  });
});
