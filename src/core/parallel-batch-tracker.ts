interface ParallelBatch {
  pendingAgentIds: Set<string>;
  userIntervened: boolean;
}

export type BatchMarkResult = "last" | "last_user_intervened" | "pending" | "none";

export class ParallelBatchTracker {
  private readonly active = new Map<string, ParallelBatch>();

  start(workspaceId: string, agentIds: string[]): void {
    const uniqueIds = [...new Set(agentIds)];
    if (uniqueIds.length <= 1) return;

    const current = this.active.get(workspaceId);
    if (current) {
      uniqueIds.forEach((id) => current.pendingAgentIds.add(id));
      return;
    }

    this.active.set(workspaceId, {
      pendingAgentIds: new Set(uniqueIds),
      userIntervened: false,
    });
  }

  markUserIntervention(workspaceId: string): void {
    const batch = this.active.get(workspaceId);
    if (batch) batch.userIntervened = true;
  }

  markComplete(workspaceId: string, agentId: string): BatchMarkResult {
    const batch = this.active.get(workspaceId);
    if (!batch || !batch.pendingAgentIds.has(agentId)) return "none";

    batch.pendingAgentIds.delete(agentId);
    if (batch.pendingAgentIds.size > 0) return "pending";

    this.active.delete(workspaceId);
    return batch.userIntervened ? "last_user_intervened" : "last";
  }

  hasActive(workspaceId: string): boolean {
    return this.active.has(workspaceId);
  }

  clear(workspaceId: string): void {
    this.active.delete(workspaceId);
  }
}
