import { describe, expect, it } from "vitest";
import type { RemoteConnectionConfig } from "../src/runtime/hermes-runtime";
import { remoteTransportSettings } from "../src/renderer/gatewayActions";

function remoteConfig(overrides: Partial<RemoteConnectionConfig> = {}): RemoteConnectionConfig {
  return {
    mode: "local",
    remoteUrl: "http://127.0.0.1:8642",
    apiKey: "",
    localChatTransport: "auto",
    remoteChatTransport: "dashboard",
    sshChatTransport: "legacy",
    ssh: {
      host: "",
      port: 22,
      username: "",
      keyPath: "",
      remotePort: 8642,
      localPort: 18642,
    },
    ...overrides,
  };
}

describe("gateway actions", () => {
  it("extracts transport settings from a remote connection config", () => {
    expect(remoteTransportSettings(remoteConfig())).toEqual({
      localChatTransport: "auto",
      remoteChatTransport: "dashboard",
      sshChatTransport: "legacy",
    });
  });
});
