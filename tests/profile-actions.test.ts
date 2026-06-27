import { describe, expect, it } from "vitest";
import type { OrchestrationState } from "../src/core/orchestrator";
import { seedAgents, seedBindings, seedWorkspace } from "../src/core/seed";
import { updateAgentProfileBinding } from "../src/renderer/profileActions";

function makeState(): OrchestrationState {
  return {
    workspace: seedWorkspace,
    agents: seedAgents,
    bindings: seedBindings.map((binding) => ({ ...binding })),
    messages: [],
    tasks: [],
    logs: [],
  };
}

describe("profile actions", () => {
  it("updates only the selected agent profile binding", () => {
    const state: OrchestrationState = {
      ...makeState(),
      bindings: [
        { ...seedBindings[0], agentId: "agent-a", hermesProfile: "default" },
        { ...seedBindings[0], agentId: "agent-b", hermesProfile: "work" },
      ],
    };

    const next = updateAgentProfileBinding(state, "agent-a", "research");

    expect(next.bindings).toEqual([
      expect.objectContaining({ agentId: "agent-a", hermesProfile: "research" }),
      expect.objectContaining({ agentId: "agent-b", hermesProfile: "work" }),
    ]);
    expect(next).not.toBe(state);
    expect(next.bindings[1]).toBe(state.bindings[1]);
  });

  it("keeps bindings unchanged when the agent is not found", () => {
    const state = makeState();
    const next = updateAgentProfileBinding(state, "missing-agent", "research");

    expect(next.bindings).toEqual(state.bindings);
  });
});
