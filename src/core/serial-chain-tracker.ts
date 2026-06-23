export interface SerialAssignment {
  agentId: string;
  instruction: string;
}

interface SerialChain {
  triggerMessageId: string;
  assignments: SerialAssignment[];
  index: number;
  currentTaskId: string | null;
  userIntervened: boolean;
}

export type SerialAdvanceResult =
  | { kind: "next"; agentId: string; instruction: string; triggerMessageId: string }
  | { kind: "last" }
  | { kind: "last_user_intervened" }
  | { kind: "none" };

export class SerialChainTracker {
  private readonly active = new Map<string, SerialChain>();

  start(params: {
    workspaceId: string;
    assignments: SerialAssignment[];
    triggerMessageId: string;
    firstTaskId: string;
  }): void {
    if (params.assignments.length <= 1) return;
    this.active.set(params.workspaceId, {
      triggerMessageId: params.triggerMessageId,
      assignments: params.assignments.map((assignment) => ({ ...assignment })),
      index: 0,
      currentTaskId: params.firstTaskId,
      userIntervened: false,
    });
  }

  markUserIntervention(workspaceId: string): void {
    const chain = this.active.get(workspaceId);
    if (chain) chain.userIntervened = true;
  }

  isCurrentTask(workspaceId: string, agentId: string, taskId: string): boolean {
    const chain = this.active.get(workspaceId);
    return !!chain && chain.assignments[chain.index]?.agentId === agentId && chain.currentTaskId === taskId;
  }

  advance(workspaceId: string, completedAgentId: string, completedTaskId: string): SerialAdvanceResult {
    const chain = this.active.get(workspaceId);
    if (!chain) return { kind: "none" };
    if (
      chain.assignments[chain.index]?.agentId !== completedAgentId ||
      chain.currentTaskId !== completedTaskId
    ) {
      return { kind: "none" };
    }

    chain.index += 1;
    if (chain.index >= chain.assignments.length) {
      this.active.delete(workspaceId);
      return chain.userIntervened ? { kind: "last_user_intervened" } : { kind: "last" };
    }

    if (chain.userIntervened) {
      this.active.delete(workspaceId);
      return { kind: "last_user_intervened" };
    }

    chain.currentTaskId = null;
    const next = chain.assignments[chain.index];
    return {
      kind: "next",
      agentId: next.agentId,
      instruction: next.instruction,
      triggerMessageId: chain.triggerMessageId,
    };
  }

  bindTask(workspaceId: string, agentId: string, taskId: string): boolean {
    const chain = this.active.get(workspaceId);
    if (!chain || chain.currentTaskId !== null || chain.assignments[chain.index]?.agentId !== agentId) {
      return false;
    }
    chain.currentTaskId = taskId;
    return true;
  }

  clear(workspaceId: string): void {
    this.active.delete(workspaceId);
  }
}
