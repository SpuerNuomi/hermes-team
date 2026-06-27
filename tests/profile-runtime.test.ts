import { describe, expect, it } from "vitest";
import type { HermesProfileInfo } from "../src/runtime/hermes-runtime";
import {
  activeProfileName,
  profileOptionsFor,
  runtimeStatusFromGateway,
  runtimeStatusFromRemote,
  sanitizeProfileName,
  shouldFallbackToDefaultProfile,
  targetProfileName,
} from "../src/renderer/profileRuntime";

function profile(name: string, active = false, isDefault = false): HermesProfileInfo {
  return {
    name,
    active,
    home: `/profiles/${name}`,
    gatewayUrl: "http://127.0.0.1:8642",
    hasApiKey: true,
    isDefault,
    model: "model",
    provider: "provider",
    hasEnv: true,
    hasSoul: false,
    skillCount: 0,
    gatewayRunning: false,
  };
}

describe("profile runtime helpers", () => {
  it("sanitizes profile names for persisted profile ids", () => {
    expect(sanitizeProfileName(" Work Profile!* ")).toBe("workprofile");
    expect(sanitizeProfileName("team_01-prod")).toBe("team_01-prod");
  });

  it("selects active, first, then default profile names", () => {
    expect(activeProfileName([profile("a"), profile("b", true)])).toBe("b");
    expect(activeProfileName([profile("a"), profile("b")])).toBe("a");
    expect(activeProfileName([])).toBe("default");
    expect(targetProfileName("manual", [profile("a", true)])).toBe("manual");
  });

  it("sorts profile options with default first and includes the current value", () => {
    expect(profileOptionsFor([profile("z"), profile("default", false, true)], "a")).toEqual([
      "default",
      "a",
      "z",
    ]);
  });

  it("maps gateway and remote status into runtime status view models", () => {
    expect(
      runtimeStatusFromGateway({
        ok: true,
        profile: "default",
        baseUrl: "http://127.0.0.1:8642",
        message: "ready",
      }),
    ).toEqual({
      state: "ready",
      message: "default · http://127.0.0.1:8642 · ready",
    });

    expect(
      runtimeStatusFromRemote({
        ok: false,
        mode: "remote",
        baseUrl: "https://example.test",
        message: "offline",
      }),
    ).toEqual({
      state: "unavailable",
      message: "remote · https://example.test · offline",
    });
  });

  it("detects when deleting a profile should fall back to default", () => {
    expect(shouldFallbackToDefaultProfile(profile("work", true), null)).toBe(true);
    expect(shouldFallbackToDefaultProfile(profile("work"), "work")).toBe(true);
    expect(shouldFallbackToDefaultProfile(profile("work"), "other")).toBe(false);
  });
});
