import type { OrchestrationState } from "../core/orchestrator";
import type { HermesProfileInfo } from "../runtime/hermes-runtime";
import type { TranslateFn } from "./appTypes";

export function configSeverityLabel(severity: string, t: TranslateFn): string {
  switch (severity) {
    case "error":
      return t("app.severity.error");
    case "warning":
      return t("app.severity.warning");
    case "info":
      return t("app.severity.info");
    default:
      return severity;
  }
}

export function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export function decisionLabel(type: string, t: TranslateFn): string {
  switch (type) {
    case "dispatch":
      return t("app.dispatch.dispatched");
    case "ask_user":
      return t("app.dispatch.askUser");
    case "blocked":
      return t("app.dispatch.blocked");
    default:
      return t("app.dispatch.noAction");
  }
}

export function decisionDetail(decision: OrchestrationState["logs"][number]["decision"], t: TranslateFn): string {
  if (decision.type === "dispatch") {
    return t("app.dispatch.detail", {
      mode: decision.mode,
      count: decision.assignments.length,
      reason: decision.reason,
    });
  }
  if (decision.type === "ask_user") return decision.question;
  return decision.reason;
}

export function taskSummary(state: OrchestrationState, t: TranslateFn): string {
  if (state.tasks.length === 0) return "";
  const running = state.tasks.filter((task) => task.status === "running").length;
  const pending = state.tasks.filter((task) => task.status === "pending").length;
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const failed = state.tasks.filter((task) => task.status === "failed").length;
  if (running > 0) return t("app.taskSummary.running", { count: running });
  if (pending > 0) return t("app.taskSummary.pending", { count: pending });
  if (failed > 0) return t("app.taskSummary.failed", { count: failed });
  return t("app.taskSummary.completed", { count: completed });
}

export function profileStatusClass(
  profile: HermesProfileInfo | undefined,
  discoveryReady: boolean,
): string {
  if (!discoveryReady) return "profile-status muted";
  if (!profile) return "profile-status warning";
  if (!profile.hasApiKey) return "profile-status warning";
  return "profile-status ok";
}

export function profileStatusText(
  profile: HermesProfileInfo | undefined,
  discoveryReady: boolean,
  t: TranslateFn,
): string {
  if (!discoveryReady) return t("app.profileStatus.waiting");
  if (!profile) return t("app.profileStatus.notFound");
  if (!profile.hasApiKey) return t("app.profileStatus.noKey", { url: profile.gatewayUrl });
  return t("app.profileStatus.hasKey", { url: profile.gatewayUrl });
}

