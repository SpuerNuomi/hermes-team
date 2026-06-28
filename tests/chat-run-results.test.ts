import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedBindings, seedWorkspace } from "../src/core/seed";
import type { DispatchTask, Message } from "../src/core/types";
import type { HermesTeamSessionSummary } from "../src/runtime/hermes-runtime";
import {
  buildChatRunMergeMarkdown,
  buildChatRunResultBatches,
} from "../src/renderer/chatRunResults";

function parentState(): OrchestrationState {
  return {
    workspace: { ...seedWorkspace, id: "workspace-parent" },
    agents: [
      {
        id: "agent-alpha",
        workspaceId: "workspace-parent",
        name: "Alpha",
        role: "Research",
        prompt: "",
        enabled: true,
        color: "#56d364",
      },
      {
        id: "agent-beta",
        workspaceId: "workspace-parent",
        name: "Beta",
        role: "Review",
        prompt: "",
        enabled: true,
        color: "#79c0ff",
      },
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
        content: "Compare the options",
        createdAt: 1,
      },
    ],
    tasks: [],
    logs: [
      {
        id: "log-1",
        createdAt: 2,
        triggerMessageId: "msg-1",
        status: "success",
        decision: {
          type: "dispatch",
          mode: "parallel",
          reason: "compare in parallel",
          assignments: [
            { agentId: "agent-alpha", instruction: "research option A" },
            { agentId: "agent-beta", instruction: "review option B" },
          ],
        },
      },
    ],
  };
}

function task(agentId: string, status: DispatchTask["status"]): DispatchTask {
  return {
    id: `task-${agentId}`,
    workspaceId: `chatrun-task-${agentId}`,
    agentId,
    triggerMessageId: "msg-1",
    instruction: "work",
    status,
    createdAt: 3,
    completedAt: status === "completed" ? 4 : undefined,
  };
}

function childSession(agentId: string, status: DispatchTask["status"], output: string): HermesTeamSessionSummary {
  const childTask = task(agentId, status);
  const messages: Message[] = [
    {
      id: "msg-1",
      workspaceId: childTask.workspaceId,
      authorKind: "user",
      authorName: "You",
      content: "Compare the options",
      createdAt: 1,
    },
  ];
  if (output) {
    messages.push({
      id: `stream-${childTask.id}`,
      workspaceId: childTask.workspaceId,
      authorKind: "agent",
      authorId: agentId,
      authorName: agentId,
      content: output,
      createdAt: 4,
      replyToMessageId: "msg-1",
    });
  }
  return {
    id: childTask.workspaceId,
    workspaceId: childTask.workspaceId,
    title: `Child ${agentId}`,
    updatedAt: 5,
    messageCount: messages.length,
    taskCount: 1,
    state: {
      workspace: { ...seedWorkspace, id: childTask.workspaceId },
      agents: parentState().agents.map((agent) => ({ ...agent, workspaceId: childTask.workspaceId })),
      bindings: parentState().bindings.map((binding) => ({ ...binding })),
      messages,
      tasks: [childTask],
      logs: [],
    },
  };
}

describe("chat run results", () => {
  it("projects parallel child sessions into comparable result rows", () => {
    const [batch] = buildChatRunResultBatches(parentState(), [
      childSession("agent-alpha", "completed", "Alpha result"),
      childSession("agent-beta", "running", ""),
    ]);

    expect(batch).toMatchObject({
      id: "log-1",
      prompt: "Compare the options",
      status: "running",
      readyToMerge: false,
      summary: {
        total: 2,
        completed: 1,
        running: 1,
        unfinished: 1,
      },
    });
    expect(batch.rows.map((row) => [row.agentName, row.profile, row.status, row.preview])).toEqual([
      ["Alpha", "alpha-profile", "completed", "Alpha result"],
      ["Beta", "beta-profile", "running", ""],
    ]);
  });

  it("builds merge markdown from terminal child results", () => {
    const [batch] = buildChatRunResultBatches(parentState(), [
      childSession("agent-alpha", "completed", "Alpha result"),
      childSession("agent-beta", "completed", "Beta result"),
    ]);

    expect(batch.readyToMerge).toBe(true);
    expect(
      buildChatRunMergeMarkdown(batch, {
        title: "Merged ChatRun result",
        prompt: "Prompt",
        status: "Status",
        noResult: "No result",
        agent: "Agent",
      }),
    ).toContain("Alpha result");
  });
});
