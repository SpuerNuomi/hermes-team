export type HandoffClassification =
  | { kind: "none"; targetNames: string[] }
  | { kind: "single"; targetNames: [string] }
  | { kind: "multiple"; targetNames: string[] };

export function classifyAssistantHandoff(params: {
  mentionNames: string[];
  selfAgentId?: string;
  agentIdByName: Map<string, string>;
}): HandoffClassification {
  const targetNames = [...new Set(params.mentionNames)].filter((name) => {
    const agentId = params.agentIdByName.get(name);
    return !!agentId && agentId !== params.selfAgentId;
  });

  if (targetNames.length === 0) return { kind: "none", targetNames };
  if (targetNames.length === 1) return { kind: "single", targetNames: [targetNames[0]] };
  return { kind: "multiple", targetNames };
}
