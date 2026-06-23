export type HandoffVerdict = "ok" | "hop_limit" | "cycle";

interface BudgetState {
  hops: number;
  lastPairKey?: string;
  pairRunHops: number;
}

export class CollaborationBudget {
  private readonly states = new Map<string, BudgetState>();

  constructor(
    private readonly maxHops = 100,
    private readonly cycleRepeatLimit = 3,
  ) {}

  reset(workspaceId: string): void {
    this.states.delete(workspaceId);
  }

  registerHandoff(workspaceId: string, sourceAgentId: string, targetAgentId: string): HandoffVerdict {
    const state = this.states.get(workspaceId) ?? { hops: 0, pairRunHops: 0 };
    this.states.set(workspaceId, state);

    if (this.maxHops > 0 && state.hops + 1 > this.maxHops) return "hop_limit";

    const pairKey =
      sourceAgentId < targetAgentId
        ? `${sourceAgentId}<->${targetAgentId}`
        : `${targetAgentId}<->${sourceAgentId}`;
    const pairRunHops = state.lastPairKey === pairKey ? state.pairRunHops + 1 : 1;

    if (this.cycleRepeatLimit > 0 && pairRunHops > this.cycleRepeatLimit * 2) {
      return "cycle";
    }

    state.hops += 1;
    state.lastPairKey = pairKey;
    state.pairRunHops = pairRunHops;
    return "ok";
  }
}
