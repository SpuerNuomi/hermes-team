export type ReasoningEffort = "auto" | "minimal" | "low" | "medium" | "high" | "xhigh";

export const DEFAULT_REASONING_EFFORT: ReasoningEffort = "auto";

export interface ReasoningEffortOption {
  value: ReasoningEffort;
  label: string;
  description: string;
}

export const REASONING_EFFORT_OPTIONS: ReasoningEffortOption[] = [
  {
    value: "auto",
    label: "Auto",
    description: "Use the model or provider default.",
  },
  {
    value: "minimal",
    label: "Minimal",
    description: "Fastest responses with the least reasoning.",
  },
  {
    value: "low",
    label: "Low",
    description: "Fast answers with lighter reasoning.",
  },
  {
    value: "medium",
    label: "Medium",
    description: "Balanced reasoning for most prompts.",
  },
  {
    value: "high",
    label: "High",
    description: "Deeper reasoning for complex work.",
  },
  {
    value: "xhigh",
    label: "XHigh",
    description: "Maximum reasoning depth when supported.",
  },
];

export function normalizeReasoningEffort(value: unknown): ReasoningEffort {
  return value === "auto" ||
    value === "minimal" ||
    value === "low" ||
    value === "medium" ||
    value === "high" ||
    value === "xhigh"
    ? value
    : DEFAULT_REASONING_EFFORT;
}
