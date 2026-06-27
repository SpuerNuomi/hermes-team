import type {
  GatewayProbeResult,
  HermesProfileInfo,
  RemoteConnectionStatus,
} from "../runtime/hermes-runtime";

export type RuntimeStatusState = "checking" | "ready" | "unavailable";

export interface RuntimeStatusView {
  state: RuntimeStatusState;
  message: string;
}

export function sanitizeProfileName(raw: string): string {
  return raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
}

export function activeProfileName(profiles: HermesProfileInfo[]): string {
  return profiles.find((profile) => profile.active)?.name ?? profiles[0]?.name ?? "default";
}

export function targetProfileName(
  profileName: string | undefined,
  profiles: HermesProfileInfo[],
): string {
  return profileName ?? activeProfileName(profiles);
}

export function profileOptionsFor(
  profiles: HermesProfileInfo[],
  currentProfile: string,
): string[] {
  const names = new Set(profiles.map((profile) => profile.name));
  names.add(currentProfile);
  return Array.from(names).sort((left, right) => {
    if (left === "default") return -1;
    if (right === "default") return 1;
    return left.localeCompare(right);
  });
}

export function runtimeStatusFromGateway(
  result: Pick<GatewayProbeResult, "ok" | "profile" | "baseUrl" | "message">,
): RuntimeStatusView {
  return {
    state: result.ok ? "ready" : "unavailable",
    message: `${result.profile} · ${result.baseUrl} · ${result.message}`,
  };
}

export function runtimeStatusFromRemote(
  status: Pick<RemoteConnectionStatus, "ok" | "mode" | "baseUrl" | "message">,
): RuntimeStatusView {
  return {
    state: status.ok ? "ready" : "unavailable",
    message: `${status.mode} · ${status.baseUrl} · ${status.message}`,
  };
}

export function shouldFallbackToDefaultProfile(
  profile: Pick<HermesProfileInfo, "active" | "name">,
  currentChatProfile: string | null | undefined,
): boolean {
  return profile.active || currentChatProfile === profile.name;
}
