import {
  ensureHermesGateway,
  generateApiServerKey,
  getRemoteConnectionConfig,
  getRemoteConnectionStatus,
  inspectHermesInstall,
  probeHermesGateway,
  saveRemoteConnectionConfig,
  startSshTunnel,
  stopHermesGateway,
  stopSshTunnel,
  testRemoteConnection,
  type ApiServerKeyResult,
  type EnsureGatewayResult,
  type GatewayProbeResult,
  type HermesInstallStatus,
  type NetworkSettings,
  type RemoteConnectionConfig,
  type RemoteConnectionStatus,
} from "../runtime/hermes-runtime";

export type RemoteTransportSettings = Pick<
  NetworkSettings,
  "localChatTransport" | "remoteChatTransport" | "sshChatTransport"
>;

export interface RemoteConnectionSnapshot {
  config: RemoteConnectionConfig;
  status: RemoteConnectionStatus | null;
}

export function remoteTransportSettings(
  config: RemoteConnectionConfig,
): RemoteTransportSettings {
  return {
    localChatTransport: config.localChatTransport,
    remoteChatTransport: config.remoteChatTransport,
    sshChatTransport: config.sshChatTransport,
  };
}

export async function loadInstallStatus(): Promise<HermesInstallStatus> {
  return inspectHermesInstall();
}

export async function loadRemoteConfig(): Promise<RemoteConnectionConfig> {
  return getRemoteConnectionConfig();
}

export async function loadRemoteStatus(): Promise<RemoteConnectionStatus> {
  return getRemoteConnectionStatus();
}

export async function loadRemoteSnapshot(): Promise<RemoteConnectionSnapshot> {
  const [config, status] = await Promise.all([
    loadRemoteConfig(),
    loadRemoteStatus().catch(() => null),
  ]);
  return { config, status };
}

export async function saveRemoteConfigValue(
  config: RemoteConnectionConfig,
): Promise<RemoteConnectionConfig> {
  return saveRemoteConnectionConfig(config);
}

export async function testRemoteConfigValue(
  config: RemoteConnectionConfig,
): Promise<RemoteConnectionStatus> {
  return testRemoteConnection(config);
}

export async function connectSshTunnel(
  config: RemoteConnectionConfig,
): Promise<RemoteConnectionStatus> {
  return startSshTunnel(config);
}

export async function disconnectSshTunnel(): Promise<RemoteConnectionStatus> {
  return stopSshTunnel();
}

export async function probeGateway(profile: string): Promise<GatewayProbeResult> {
  return probeHermesGateway({ profile });
}

export async function startGatewayForProfile(
  profile: string,
  options: { replace?: boolean } = {},
): Promise<EnsureGatewayResult> {
  return ensureHermesGateway({ profile, replace: options.replace });
}

export async function stopGatewayForProfile(profile: string): Promise<EnsureGatewayResult> {
  return stopHermesGateway({ profile });
}

export async function createGatewayApiKey(profile: string): Promise<ApiServerKeyResult> {
  return generateApiServerKey({ profile });
}
