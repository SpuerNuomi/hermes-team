import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import type { OrchestrationState } from "../core/orchestrator";
import type { ReasoningEffort } from "../core/reasoning";
import type { Agent, CapabilityBinding, DispatchTask, Message, MessageAttachment } from "../core/types";

export interface RuntimeMessage {
  role: "user" | "assistant";
  content: string;
}

export interface RuntimeAttachment {
  path?: string;
  name?: string;
  kind?: string;
  mime?: string;
  size?: number;
  text?: string;
  dataUrl?: string;
  originalSize?: number;
}

export interface SelectedPathInfo {
  path: string;
  name: string;
  isFile: boolean;
  isDir: boolean;
  sizeBytes?: number;
}

export interface DirectoryEntryInfo {
  name: string;
  path: string;
  isFile: boolean;
  isDir: boolean;
  sizeBytes?: number;
}

export interface FileReadResult {
  content: string;
  truncated: boolean;
}

export interface GatewayProbeResult {
  ok: boolean;
  baseUrl: string;
  profile: string;
  message: string;
  capabilities?: unknown;
}

export interface HermesProfileInfo {
  name: string;
  active: boolean;
  home: string;
  gatewayUrl: string;
  hasApiKey: boolean;
  isDefault: boolean;
  model: string;
  provider: string;
  hasEnv: boolean;
  hasSoul: boolean;
  skillCount: number;
  gatewayRunning: boolean;
}

export interface HermesInstallStatus {
  installed: boolean;
  command?: string;
  version?: string;
  hermesHome: string;
  activeProfile: string;
  configExists: boolean;
  envExists: boolean;
  apiServerKeyPresent: boolean;
  apiServerConfigured: boolean;
  gatewayRunning: boolean;
  gatewayHealth: string;
}

export interface ConfigHealthSummary {
  errors: number;
  warnings: number;
  infos: number;
}

export interface ConfigHealthIssue {
  code: string;
  severity: "error" | "warning" | "info" | string;
  message: string;
  detail?: string | null;
  locations: string[];
  autoFixable: boolean;
  fixDescription?: string | null;
  fixLocation?: string | null;
  context?: Record<string, string> | null;
}

export interface ConfigHealthReport {
  ranAt: number;
  profile: string;
  issues: ConfigHealthIssue[];
  summary: ConfigHealthSummary;
}

export interface ConfigHealthFixResult {
  ok: boolean;
  message: string;
}

export interface AppSettings {
  theme: string;
  roundedCorners: boolean;
  font: string;
}

export interface UpdateStatus {
  appVersion: string;
  hermesVersion?: string | null;
  autoUpgrade: boolean;
  lastCheckedAt: number;
  updateAvailable?: string | null;
  message: string;
  logPath: string;
}

export interface UpdateRunResult {
  ok: boolean;
  message: string;
  logPath: string;
  output: string;
}

export interface ToolsetInfo {
  key: string;
  label: string;
  description: string;
  group: string;
  risk: string;
  enabled: boolean;
}

export interface McpServerInfo {
  name: string;
  transport: string;
  enabled: boolean;
  detail: string;
  url?: string;
  command?: string;
  args: string[];
  env: string[];
}

export interface McpTestTool {
  name: string;
  description: string;
}

export interface McpOperationResult {
  success: boolean;
  error?: string | null;
  tools: McpTestTool[];
  output: string;
  background: boolean;
  action?: string | null;
}

export interface McpCatalogEntry {
  name: string;
  description: string;
  source: string;
  transport: string;
  authType: string;
  requiredEnv: string[];
  needsInstall: boolean;
  installed: boolean;
  enabled: boolean;
}

export interface McpCatalogResult {
  entries: McpCatalogEntry[];
  diagnostics: string[];
  error?: string | null;
}

export interface SaveMcpServerInput {
  profile?: string;
  name: string;
  transport: "http" | "stdio";
  url?: string;
  command?: string;
  args?: string;
  env?: string;
  auth?: string;
  enabled?: boolean;
}

export interface InstalledSkillInfo {
  name: string;
  dirName: string;
  category: string;
  description: string;
  path: string;
  source: string;
  installed: boolean;
}

export interface BundledSkillInfo {
  name: string;
  dirName: string;
  category: string;
  description: string;
  path: string;
  source: string;
  installed: boolean;
}

export interface InstallSkillInput {
  profile?: string;
  sourcePath: string;
  category?: string;
  name?: string;
}

export interface MemorySummary {
  memoryExists: boolean;
  userExists: boolean;
  memoryChars: number;
  userChars: number;
  memoryEntries: number;
  memoryPath: string;
  userPath: string;
}

export interface MemoryEntry {
  index: number;
  content: string;
}

export interface MemoryFileInfo {
  content: string;
  exists: boolean;
  lastModified?: number | null;
  entries?: MemoryEntry[];
  charCount: number;
  charLimit: number;
  path: string;
}

export interface MemoryStats {
  totalSessions: number;
  totalMessages: number;
}

export interface MemoryDetails {
  memory: MemoryFileInfo;
  user: MemoryFileInfo;
  stats: MemoryStats;
}

export interface MemoryActionResult {
  success: boolean;
  error?: string | null;
}

export interface MemoryContent {
  memory: string;
  user: string;
  memoryPath: string;
  userPath: string;
}

export interface PersonaContent {
  content: string;
  path: string;
  exists: boolean;
}

export interface SavedModel {
  id: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  apiMode?: string;
  contextLength?: number;
  createdAt: number;
}

export interface ActiveModelConfig {
  provider: string;
  model: string;
  baseUrl: string;
  contextLength?: number;
}

export interface AuxiliaryModelConfig {
  task: string;
  label: string;
  hint: string;
  provider: string;
  model: string;
  baseUrl: string;
  contextLength?: number;
}

export interface SaveModelInput {
  id?: string;
  name: string;
  provider: string;
  model: string;
  baseUrl?: string;
  apiMode?: string;
  contextLength?: number;
}

export interface ProviderKeyInfo {
  provider: string;
  label: string;
  envKey: string;
  present: boolean;
  masked: string;
}

export interface ProviderRegistryEntry {
  id: string;
  label: string;
  authType: string;
  baseUrl: string;
  envKey: string;
  keyPresent: boolean;
  credentialCount: number;
  discoverable: boolean;
  local: boolean;
  notes: string;
}

export interface OAuthLoginResult {
  ok: boolean;
  provider: string;
  message: string;
  output: string;
}

export interface CredentialPoolDisplayEntry {
  id: string;
  label: string;
  masked: string;
  authType: string;
  source: string;
  baseUrl: string;
}

export interface CredentialPoolGroup {
  provider: string;
  entries: CredentialPoolDisplayEntry[];
}

export interface DiscoveredModel {
  id: string;
  contextLength?: number;
}

export interface ProviderDiscoveryResult {
  ok: boolean;
  provider: string;
  baseUrl: string;
  envKey: string;
  keyPresent: boolean;
  status: string;
  message: string;
  cached: boolean;
  freeModels: string[];
  modelCount: number;
  models: DiscoveredModel[];
}

export interface RegistryLibraryModel {
  id: string;
  label: string;
  contextLength?: number;
  source: string;
  saved: boolean;
  free: boolean;
}

export interface RegistryLibraryProvider {
  provider: string;
  label: string;
  authType: string;
  baseUrl: string;
  discoverable: boolean;
  status: string;
  message: string;
  models: RegistryLibraryModel[];
}

export interface CronRepeat {
  times?: number | null;
  completed: number;
}

export interface CronJobInfo {
  id: string;
  name: string;
  schedule: string;
  prompt: string;
  state: "active" | "paused" | "completed";
  enabled: boolean;
  nextRunAt?: string | null;
  lastRunAt?: string | null;
  lastStatus?: string | null;
  lastError?: string | null;
  repeat?: CronRepeat | null;
  deliver: string[];
  skills: string[];
  script?: string | null;
  noAgent: boolean;
}

export interface CronJobActionResult {
  success: boolean;
  error?: string | null;
}

export interface CronJobRun {
  name: string;
  path: string;
  ranAt?: string | null;
  status?: string | null;
  mode?: string | null;
  content: string;
}

export interface MessagingEnvVarInfo {
  advanced: boolean;
  description: string;
  isPassword: boolean;
  isSet: boolean;
  key: string;
  prompt: string;
  redactedValue?: string | null;
  required: boolean;
  url?: string | null;
}

export interface MessagingToolsetInfo {
  description: string;
  enabled: boolean;
  key: string;
  label: string;
  risk: "normal" | "high" | string;
}

export interface MessagingPlatformInfo {
  configured: boolean;
  description: string;
  docsUrl: string;
  enabled: boolean;
  envVars: MessagingEnvVarInfo[];
  errorCode?: string | null;
  errorMessage?: string | null;
  gatewayRunning: boolean;
  id: string;
  name: string;
  state?: string | null;
  toolsets: MessagingToolsetInfo[];
  updatedAt?: string | null;
}

export interface MessagingPlatformsResponse {
  editable: boolean;
  message?: string | null;
  platforms: MessagingPlatformInfo[];
  source: "desktop" | "remote-api" | string;
}

export interface MessagingPlatformUpdate {
  clearEnv?: string[];
  enabled?: boolean;
  env?: Record<string, string>;
  toolsets?: Record<string, boolean>;
}

export interface MessagingPlatformTestResponse {
  message: string;
  ok: boolean;
  state?: string | null;
}

export interface RunHermesAgentInput {
  taskId?: string;
  baseUrl?: string;
  profile?: string;
  model?: string;
  agentName: string;
  systemPrompt: string;
  instruction: string;
  history: RuntimeMessage[];
  attachments: RuntimeAttachment[];
  contextFolder?: string;
}

export interface RunHermesAgentOutput {
  content: string;
  events?: RuntimeStreamEvent[];
}

export interface RuntimeStreamEvent {
  taskId: string;
  kind: "start" | "delta" | "reasoning" | "tool" | "clarify" | "done" | "error" | "usage";
  delta: string;
  content: string;
  message: string;
}

export interface HermesTeamSessionSummary {
  id: string;
  workspaceId: string;
  title: string;
  titleEdited?: boolean;
  /** Pinned sessions float to the top of the list and survive truncation. */
  pinned?: boolean;
  /** True once the context folder was set manually (pin/move), so auto-save keeps it. */
  folderEdited?: boolean;
  messageCount: number;
  taskCount: number;
  updatedAt: number;
  contextFolder?: string | null;
  state: OrchestrationState;
}

export interface HermesStateSessionSummary {
  id: string;
  title: string;
  startedAt: number;
  endedAt?: number | null;
  messageCount: number;
  model: string;
  preview: string;
  profile: string;
}

export interface HermesStateSearchResult {
  id: string;
  title: string;
  startedAt: number;
  messageCount: number;
  model: string;
  /** Highlighted excerpt (matches wrapped in «»), empty for title-only hits. */
  snippet: string;
  profile: string;
}

export interface HermesStateMessage {
  id: number;
  kind: "user" | "assistant" | "reasoning" | "tool" | string;
  role: string;
  content: string;
  timestamp: number;
  callId?: string | null;
  name?: string | null;
}

export interface HermesLogInfo {
  name: string;
  path: string;
  sizeBytes: number;
  modifiedAt: number;
}

export interface HermesLogContent {
  name: string;
  path: string;
  content: string;
  truncated: boolean;
}

export interface SshConnectionConfig {
  host: string;
  port: number;
  username: string;
  keyPath: string;
  remotePort: number;
  localPort: number;
}

export interface RemoteConnectionConfig {
  mode: "local" | "remote" | "ssh";
  remoteUrl: string;
  apiKey: string;
  localChatTransport: "auto" | "dashboard" | "legacy";
  remoteChatTransport: "auto" | "dashboard" | "legacy";
  sshChatTransport: "auto" | "dashboard" | "legacy";
  ssh: SshConnectionConfig;
}

export interface NetworkSettings {
  profile?: string | null;
  forceIpv4: boolean;
  proxy: string;
  localChatTransport: "auto" | "dashboard" | "legacy";
  remoteChatTransport: "auto" | "dashboard" | "legacy";
  sshChatTransport: "auto" | "dashboard" | "legacy";
}

export interface RemoteConnectionStatus {
  mode: string;
  baseUrl: string;
  sshTunnelActive: boolean;
  ok: boolean;
  message: string;
}

export interface EnsureGatewayResult {
  ok: boolean;
  profile: string;
  baseUrl: string;
  message: string;
  logPath?: string;
}

export interface ApiServerKeyResult {
  ok: boolean;
  profile: string;
  message: string;
}

export const TAURI_UNAVAILABLE_MESSAGE =
  "当前运行在浏览器预览模式，无法调用本机 Hermes/Tauri 命令。请使用 npm run tauri:dev 或打开 Hermes Team.app。";

export async function listHermesProfiles(): Promise<HermesProfileInfo[]> {
  ensureTauriRuntime();
  return invoke<HermesProfileInfo[]>("list_hermes_profiles");
}

export async function createHermesProfile(input: {
  name: string;
  cloneConfig: boolean;
}): Promise<HermesProfileInfo[]> {
  ensureTauriRuntime();
  return invoke<HermesProfileInfo[]>("create_hermes_profile", { input });
}

export async function deleteHermesProfile(input: {
  name: string;
}): Promise<HermesProfileInfo[]> {
  ensureTauriRuntime();
  return invoke<HermesProfileInfo[]>("delete_hermes_profile", { input });
}

export async function setActiveHermesProfile(input: {
  name: string;
}): Promise<HermesProfileInfo[]> {
  ensureTauriRuntime();
  return invoke<HermesProfileInfo[]>("set_active_hermes_profile", { input });
}

export async function inspectHermesInstall(): Promise<HermesInstallStatus> {
  ensureTauriRuntime();
  return invoke<HermesInstallStatus>("inspect_hermes_install");
}

export async function getConfigHealth(params: {
  profile?: string;
} = {}): Promise<ConfigHealthReport> {
  ensureTauriRuntime();
  return invoke<ConfigHealthReport>("get_config_health", {
    profile: params.profile,
  });
}

export async function rerunConfigHealth(params: {
  profile?: string;
} = {}): Promise<ConfigHealthReport> {
  ensureTauriRuntime();
  return invoke<ConfigHealthReport>("rerun_config_health", {
    profile: params.profile,
  });
}

export async function autofixConfigIssue(input: {
  profile?: string;
  code: string;
  context?: Record<string, string> | null;
}): Promise<ConfigHealthFixResult> {
  ensureTauriRuntime();
  return invoke<ConfigHealthFixResult>("autofix_config_issue", { input });
}

export async function getAppSettings(): Promise<AppSettings> {
  ensureTauriRuntime();
  return invoke<AppSettings>("get_app_settings");
}

export async function saveAppSettings(settings: AppSettings): Promise<AppSettings> {
  ensureTauriRuntime();
  return invoke<AppSettings>("save_app_settings", { settings });
}

export async function getUpdateStatus(): Promise<UpdateStatus> {
  ensureTauriRuntime();
  return invoke<UpdateStatus>("get_update_status");
}

export async function setAutoUpgradeEnabled(enabled: boolean): Promise<UpdateStatus> {
  ensureTauriRuntime();
  return invoke<UpdateStatus>("set_auto_upgrade_enabled", { enabled });
}

export async function checkForAppUpdates(): Promise<UpdateStatus> {
  ensureTauriRuntime();
  return invoke<UpdateStatus>("check_for_app_updates");
}

export async function runHermesUpdate(): Promise<UpdateRunResult> {
  ensureTauriRuntime();
  return invoke<UpdateRunResult>("run_hermes_update");
}

export async function listHermesToolsets(params: {
  profile?: string;
} = {}): Promise<ToolsetInfo[]> {
  ensureTauriRuntime();
  return invoke<ToolsetInfo[]>("list_hermes_toolsets", {
    profile: params.profile,
  });
}

export async function setHermesToolsetEnabled(input: {
  profile?: string;
  key: string;
  enabled: boolean;
}): Promise<ToolsetInfo[]> {
  ensureTauriRuntime();
  return invoke<ToolsetInfo[]>("set_hermes_toolset_enabled", { input });
}

export async function listHermesMcpServers(params: {
  profile?: string;
} = {}): Promise<McpServerInfo[]> {
  ensureTauriRuntime();
  return invoke<McpServerInfo[]>("list_hermes_mcp_servers", {
    profile: params.profile,
  });
}

export async function saveHermesMcpServer(input: SaveMcpServerInput): Promise<McpServerInfo[]> {
  ensureTauriRuntime();
  return invoke<McpServerInfo[]>("save_hermes_mcp_server", { input });
}

export async function removeHermesMcpServer(input: {
  profile?: string;
  name: string;
}): Promise<McpServerInfo[]> {
  ensureTauriRuntime();
  return invoke<McpServerInfo[]>("remove_hermes_mcp_server", { input });
}

export async function testHermesMcpServer(input: {
  profile?: string;
  name: string;
}): Promise<McpOperationResult> {
  ensureTauriRuntime();
  return invoke<McpOperationResult>("test_hermes_mcp_server", { input });
}

export async function listHermesMcpCatalog(params: {
  profile?: string;
} = {}): Promise<McpCatalogResult> {
  ensureTauriRuntime();
  return invoke<McpCatalogResult>("list_hermes_mcp_catalog", {
    profile: params.profile,
  });
}

export async function installHermesMcpCatalogEntry(input: {
  profile?: string;
  name: string;
}): Promise<McpOperationResult> {
  ensureTauriRuntime();
  return invoke<McpOperationResult>("install_hermes_mcp_catalog_entry", { input });
}

export async function listHermesSkills(params: {
  profile?: string;
} = {}): Promise<InstalledSkillInfo[]> {
  ensureTauriRuntime();
  return invoke<InstalledSkillInfo[]>("list_hermes_skills", {
    profile: params.profile,
  });
}

export async function listHermesBundledSkills(params: {
  profile?: string;
} = {}): Promise<BundledSkillInfo[]> {
  ensureTauriRuntime();
  return invoke<BundledSkillInfo[]>("list_hermes_bundled_skills", {
    profile: params.profile,
  });
}

export async function readHermesSkillContent(path: string): Promise<string> {
  ensureTauriRuntime();
  return invoke<string>("read_hermes_skill_content", { input: { path } });
}

export async function searchHermesSkills(params: {
  profile?: string;
  query?: string;
} = {}): Promise<InstalledSkillInfo[]> {
  ensureTauriRuntime();
  return invoke<InstalledSkillInfo[]>("search_hermes_skills", { input: params });
}

export async function installHermesSkill(input: InstallSkillInput): Promise<InstalledSkillInfo[]> {
  ensureTauriRuntime();
  return invoke<InstalledSkillInfo[]>("install_hermes_skill", { input });
}

export async function removeHermesSkill(input: {
  profile?: string;
  category: string;
  name: string;
}): Promise<InstalledSkillInfo[]> {
  ensureTauriRuntime();
  return invoke<InstalledSkillInfo[]>("remove_hermes_skill", { input });
}

export async function readHermesMemorySummary(params: {
  profile?: string;
} = {}): Promise<MemorySummary> {
  ensureTauriRuntime();
  return invoke<MemorySummary>("read_hermes_memory_summary", {
    profile: params.profile,
  });
}

export async function readHermesMemoryDetails(params: {
  profile?: string;
} = {}): Promise<MemoryDetails> {
  ensureTauriRuntime();
  return invoke<MemoryDetails>("read_hermes_memory_details", {
    profile: params.profile,
  });
}

export async function readHermesMemoryContent(params: {
  profile?: string;
} = {}): Promise<MemoryContent> {
  ensureTauriRuntime();
  return invoke<MemoryContent>("read_hermes_memory_content", {
    profile: params.profile,
  });
}

export async function writeHermesMemoryContent(input: {
  profile?: string;
  kind: "memory" | "user";
  content: string;
}): Promise<MemoryContent> {
  ensureTauriRuntime();
  return invoke<MemoryContent>("write_hermes_memory_content", { input });
}

export async function readHermesPersona(params: {
  profile?: string;
} = {}): Promise<PersonaContent> {
  ensureTauriRuntime();
  return invoke<PersonaContent>("read_hermes_persona", {
    profile: params.profile,
  });
}

export async function writeHermesPersona(input: {
  profile?: string;
  content: string;
}): Promise<PersonaContent> {
  ensureTauriRuntime();
  return invoke<PersonaContent>("write_hermes_persona", { input });
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunk) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunk));
  }
  return btoa(binary);
}

export async function transcribeHermesAudio(
  audio: Uint8Array,
  mimeType: string,
  profile?: string,
): Promise<string> {
  ensureTauriRuntime();
  return invoke<string>("transcribe_hermes_audio", {
    audioBase64: bytesToBase64(audio),
    mimeType,
    profile,
  });
}

export async function addHermesMemoryEntry(input: {
  profile?: string;
  content: string;
}): Promise<MemoryActionResult> {
  ensureTauriRuntime();
  return invoke<MemoryActionResult>("add_hermes_memory_entry", { input });
}

export async function updateHermesMemoryEntry(input: {
  profile?: string;
  index: number;
  content: string;
}): Promise<MemoryActionResult> {
  ensureTauriRuntime();
  return invoke<MemoryActionResult>("update_hermes_memory_entry", { input });
}

export async function removeHermesMemoryEntry(input: {
  profile?: string;
  index: number;
}): Promise<MemoryActionResult> {
  ensureTauriRuntime();
  return invoke<MemoryActionResult>("remove_hermes_memory_entry", { input });
}

export async function getHermesModelConfig(params: {
  profile?: string;
} = {}): Promise<ActiveModelConfig> {
  ensureTauriRuntime();
  return invoke<ActiveModelConfig>("get_hermes_model_config", {
    profile: params.profile,
  });
}

export async function getHermesReasoningEffort(params: {
  profile?: string;
} = {}): Promise<ReasoningEffort> {
  ensureTauriRuntime();
  return invoke<ReasoningEffort>("get_hermes_reasoning_effort", {
    profile: params.profile,
  });
}

export async function setHermesReasoningEffort(input: {
  profile?: string;
  value: ReasoningEffort;
}): Promise<ReasoningEffort> {
  ensureTauriRuntime();
  return invoke<ReasoningEffort>("set_hermes_reasoning_effort", { input });
}

export async function getHermesFastMode(params: {
  profile?: string;
} = {}): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("get_hermes_fast_mode", { profile: params.profile });
}

export async function setHermesFastMode(input: {
  profile?: string;
  enabled: boolean;
}): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("set_hermes_fast_mode", { input });
}

export async function listHermesModels(): Promise<SavedModel[]> {
  ensureTauriRuntime();
  return invoke<SavedModel[]>("list_hermes_models");
}

export async function saveHermesModel(input: SaveModelInput): Promise<SavedModel> {
  ensureTauriRuntime();
  return invoke<SavedModel>("save_hermes_model", { input });
}

export async function removeHermesModel(id: string): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("remove_hermes_model", { id });
}

export async function activateHermesModel(input: {
  profile?: string;
  provider: string;
  model: string;
  baseUrl?: string;
  contextLength?: number;
}): Promise<ActiveModelConfig> {
  ensureTauriRuntime();
  return invoke<ActiveModelConfig>("activate_hermes_model", { input });
}

export async function listAuxiliaryModelConfigs(params: {
  profile?: string;
} = {}): Promise<AuxiliaryModelConfig[]> {
  ensureTauriRuntime();
  return invoke<AuxiliaryModelConfig[]>("list_auxiliary_model_configs", {
    profile: params.profile,
  });
}

export async function saveAuxiliaryModelConfig(input: {
  profile?: string;
  task: string;
  provider: string;
  model: string;
  baseUrl?: string;
  contextLength?: number;
}): Promise<AuxiliaryModelConfig[]> {
  ensureTauriRuntime();
  return invoke<AuxiliaryModelConfig[]>("save_auxiliary_model_config", { input });
}

export async function listProviderKeys(params: {
  profile?: string;
} = {}): Promise<ProviderKeyInfo[]> {
  ensureTauriRuntime();
  return invoke<ProviderKeyInfo[]>("list_provider_keys", {
    profile: params.profile,
  });
}

export async function listProviderRegistry(params: {
  profile?: string;
} = {}): Promise<ProviderRegistryEntry[]> {
  ensureTauriRuntime();
  return invoke<ProviderRegistryEntry[]>("list_provider_registry", {
    profile: params.profile,
  });
}

export async function listRegistryModelLibrary(params: {
  profile?: string;
} = {}): Promise<RegistryLibraryProvider[]> {
  ensureTauriRuntime();
  return invoke<RegistryLibraryProvider[]>("list_registry_model_library", {
    profile: params.profile,
  });
}

export async function runOAuthProviderLogin(input: {
  profile?: string;
  provider: string;
}): Promise<OAuthLoginResult> {
  ensureTauriRuntime();
  return invoke<OAuthLoginResult>("run_oauth_provider_login", { input });
}

export async function saveProviderKey(input: {
  profile?: string;
  envKey: string;
  value: string;
}): Promise<ProviderKeyInfo> {
  ensureTauriRuntime();
  return invoke<ProviderKeyInfo>("save_provider_key", { input });
}

export async function listCredentialPool(params: {
  profile?: string;
} = {}): Promise<CredentialPoolGroup[]> {
  ensureTauriRuntime();
  return invoke<CredentialPoolGroup[]>("list_credential_pool", {
    profile: params.profile,
  });
}

export async function addCredentialPoolEntry(input: {
  profile?: string;
  provider: string;
  apiKey: string;
  label?: string;
}): Promise<CredentialPoolGroup[]> {
  ensureTauriRuntime();
  return invoke<CredentialPoolGroup[]>("add_credential_pool_entry", { input });
}

export async function removeCredentialPoolEntry(input: {
  profile?: string;
  provider: string;
  id: string;
}): Promise<CredentialPoolGroup[]> {
  ensureTauriRuntime();
  return invoke<CredentialPoolGroup[]>("remove_credential_pool_entry", { input });
}

export async function discoverProviderModels(input: {
  profile?: string;
  provider: string;
  baseUrl?: string;
  envKey?: string;
}): Promise<ProviderDiscoveryResult> {
  ensureTauriRuntime();
  return invoke<ProviderDiscoveryResult>("discover_provider_models", { input });
}

export async function listHermesCronJobs(params: {
  includeDisabled?: boolean;
  profile?: string;
} = {}): Promise<CronJobInfo[]> {
  ensureTauriRuntime();
  return invoke<CronJobInfo[]>("list_hermes_cron_jobs", {
    includeDisabled: params.includeDisabled,
    profile: params.profile,
  });
}

export async function createHermesCronJob(input: {
  profile?: string;
  schedule: string;
  prompt?: string;
  name?: string;
  deliver?: string;
  repeat?: number;
  skills?: string[];
  script?: string;
  noAgent?: boolean;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("create_hermes_cron_job", { input });
}

export async function editHermesCronJob(input: {
  profile?: string;
  jobId: string;
  schedule?: string;
  prompt?: string;
  name?: string;
  deliver?: string;
  repeat?: number;
  skills?: string[];
  /** Empty string clears the script; omit to leave unchanged. */
  script?: string;
  /** true enables no-agent mode, false reverts to agent, omit to leave unchanged. */
  noAgent?: boolean;
  /** true clears the repeat cap so the job runs forever. */
  clearRepeat?: boolean;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("edit_hermes_cron_job", { input });
}

export async function removeHermesCronJob(input: {
  profile?: string;
  jobId: string;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("remove_hermes_cron_job", { input });
}

export async function pauseHermesCronJob(input: {
  profile?: string;
  jobId: string;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("pause_hermes_cron_job", { input });
}

export async function resumeHermesCronJob(input: {
  profile?: string;
  jobId: string;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("resume_hermes_cron_job", { input });
}

export async function triggerHermesCronJob(input: {
  profile?: string;
  jobId: string;
}): Promise<CronJobActionResult> {
  ensureTauriRuntime();
  return invoke<CronJobActionResult>("trigger_hermes_cron_job", { input });
}

export async function listHermesCronJobRuns(params: {
  jobId: string;
  profile?: string;
  limit?: number;
}): Promise<CronJobRun[]> {
  ensureTauriRuntime();
  return invoke<CronJobRun[]>("list_hermes_cron_job_runs", {
    jobId: params.jobId,
    profile: params.profile,
    limit: params.limit,
  });
}

export async function listHermesCronScripts(params: {
  profile?: string;
} = {}): Promise<string[]> {
  ensureTauriRuntime();
  return invoke<string[]>("list_hermes_cron_scripts", {
    profile: params.profile,
  });
}

export async function listMessagingPlatforms(params: {
  profile?: string;
} = {}): Promise<MessagingPlatformsResponse> {
  ensureTauriRuntime();
  return invoke<MessagingPlatformsResponse>("list_messaging_platforms", {
    profile: params.profile,
  });
}

export async function updateMessagingPlatform(input: {
  profile?: string;
  platform: string;
  update: MessagingPlatformUpdate;
}): Promise<MessagingPlatformsResponse> {
  ensureTauriRuntime();
  return invoke<MessagingPlatformsResponse>("update_messaging_platform", {
    platform: input.platform,
    update: input.update,
    profile: input.profile,
  });
}

export async function testMessagingPlatform(input: {
  profile?: string;
  platform: string;
}): Promise<MessagingPlatformTestResponse> {
  ensureTauriRuntime();
  return invoke<MessagingPlatformTestResponse>("test_messaging_platform", {
    platform: input.platform,
    profile: input.profile,
  });
}

export async function probeHermesGateway(params: {
  baseUrl?: string;
  profile?: string;
} = {}): Promise<GatewayProbeResult> {
  ensureTauriRuntime();
  return invoke<GatewayProbeResult>("probe_hermes_gateway", {
    baseUrl: params.baseUrl,
    profile: params.profile,
  });
}

export async function ensureHermesGateway(params: {
  profile?: string;
  replace?: boolean;
} = {}): Promise<EnsureGatewayResult> {
  ensureTauriRuntime();
  return invoke<EnsureGatewayResult>("ensure_hermes_gateway", {
    profile: params.profile,
    replace: params.replace,
  });
}

export async function stopHermesGateway(params: {
  profile?: string;
} = {}): Promise<EnsureGatewayResult> {
  ensureTauriRuntime();
  return invoke<EnsureGatewayResult>("stop_hermes_gateway", {
    profile: params.profile,
  });
}

export async function generateApiServerKey(params: {
  profile?: string;
} = {}): Promise<ApiServerKeyResult> {
  ensureTauriRuntime();
  return invoke<ApiServerKeyResult>("generate_api_server_key", {
    profile: params.profile,
  });
}

export async function loadHermesTeamState(): Promise<OrchestrationState | null> {
  ensureTauriRuntime();
  return invoke<OrchestrationState | null>("load_hermes_team_state");
}

export async function saveHermesTeamState(state: OrchestrationState): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("save_hermes_team_state", { state });
}

export async function loadHermesTeamSessions(): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("load_hermes_team_sessions");
}

export async function saveHermesTeamSession(session: HermesTeamSessionSummary): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("save_hermes_team_session", { session });
}

export async function updateHermesTeamSessionTitle(
  sessionId: string,
  title: string,
): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("update_hermes_team_session_title", { sessionId, title });
}

export async function deleteHermesTeamSession(sessionId: string): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("delete_hermes_team_session", { sessionId });
}

export async function deleteHermesTeamSessions(
  sessionIds: string[],
): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("delete_hermes_team_sessions", { sessionIds });
}

export async function setHermesTeamSessionPinned(
  sessionId: string,
  pinned: boolean,
): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("set_hermes_team_session_pinned", { sessionId, pinned });
}

export async function setHermesTeamSessionFolder(
  sessionId: string,
  folder: string | null,
): Promise<HermesTeamSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesTeamSessionSummary[]>("set_hermes_team_session_folder", { sessionId, folder });
}

export async function openExternalUrl(url: string): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("open_external_url", { url });
}

export async function listHermesStateSessions(params: {
  profile?: string;
} = {}): Promise<HermesStateSessionSummary[]> {
  ensureTauriRuntime();
  return invoke<HermesStateSessionSummary[]>("list_hermes_state_sessions", {
    profile: params.profile,
  });
}

export async function searchHermesStateSessions(params: {
  query: string;
  profile?: string;
  limit?: number;
}): Promise<HermesStateSearchResult[]> {
  ensureTauriRuntime();
  return invoke<HermesStateSearchResult[]>("search_hermes_state_sessions", {
    query: params.query,
    profile: params.profile,
    limit: params.limit,
  });
}

export async function loadHermesStateSession(params: {
  profile?: string;
  sessionId: string;
}): Promise<HermesStateMessage[]> {
  ensureTauriRuntime();
  return invoke<HermesStateMessage[]>("load_hermes_state_session", params);
}

export async function listHermesLogs(): Promise<HermesLogInfo[]> {
  ensureTauriRuntime();
  return invoke<HermesLogInfo[]>("list_hermes_logs");
}

export async function readHermesLog(path: string, maxBytes = 96 * 1024): Promise<HermesLogContent> {
  ensureTauriRuntime();
  return invoke<HermesLogContent>("read_hermes_log", { path, maxBytes });
}

export async function createHermesBackupFile(): Promise<string> {
  ensureTauriRuntime();
  return invoke<string>("create_hermes_backup_file");
}

export async function createHermesDebugDump(): Promise<string> {
  ensureTauriRuntime();
  return invoke<string>("create_hermes_debug_dump");
}

export interface HermesRestoreResult {
  targetPath: string;
  restored: number;
  skipped: number;
  warnings: string[];
  ok: boolean;
}

export interface RestoreHermesBackupInput {
  path?: string;
  content?: string;
  overwrite?: boolean;
}

export async function restoreHermesBackupFile(input: RestoreHermesBackupInput): Promise<HermesRestoreResult> {
  ensureTauriRuntime();
  return invoke<HermesRestoreResult>("restore_hermes_backup_file", { input });
}

export async function getRemoteConnectionConfig(): Promise<RemoteConnectionConfig> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionConfig>("get_remote_connection_config");
}

export async function saveRemoteConnectionConfig(config: RemoteConnectionConfig): Promise<RemoteConnectionConfig> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionConfig>("save_remote_connection_config", { config });
}

export async function getNetworkSettings(params: {
  profile?: string;
} = {}): Promise<NetworkSettings> {
  ensureTauriRuntime();
  return invoke<NetworkSettings>("get_network_settings", {
    profile: params.profile,
  });
}

export async function saveNetworkSettings(settings: NetworkSettings): Promise<NetworkSettings> {
  ensureTauriRuntime();
  return invoke<NetworkSettings>("save_network_settings", { settings });
}

export async function getRemoteConnectionStatus(): Promise<RemoteConnectionStatus> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionStatus>("get_remote_connection_status");
}

export async function testRemoteConnection(config: RemoteConnectionConfig): Promise<RemoteConnectionStatus> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionStatus>("test_remote_connection", { config });
}

export async function startSshTunnel(config: RemoteConnectionConfig): Promise<RemoteConnectionStatus> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionStatus>("start_ssh_tunnel", { config });
}

export async function stopSshTunnel(): Promise<RemoteConnectionStatus> {
  ensureTauriRuntime();
  return invoke<RemoteConnectionStatus>("stop_ssh_tunnel");
}

export async function cancelHermesTask(taskId: string): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("cancel_hermes_task", { taskId });
}

export async function listenHermesAgentStream(
  handler: (event: RuntimeStreamEvent) => void,
): Promise<() => void> {
  ensureTauriRuntime();
  return listen<RuntimeStreamEvent>("hermes-agent-stream", (event) => {
    handler(event.payload);
  });
}

export async function selectAttachmentFiles(): Promise<SelectedPathInfo[]> {
  ensureTauriRuntime();
  return invoke<SelectedPathInfo[]>("select_attachment_files");
}

export async function stageAttachmentFile(input: {
  sessionId?: string;
  filename: string;
  base64Bytes: string;
}): Promise<SelectedPathInfo> {
  ensureTauriRuntime();
  return invoke<SelectedPathInfo>("stage_attachment_file", { input });
}

export async function selectContextFolder(): Promise<SelectedPathInfo | null> {
  ensureTauriRuntime();
  return invoke<SelectedPathInfo | null>("select_context_folder");
}

export async function readDirectory(path: string): Promise<DirectoryEntryInfo[]> {
  ensureTauriRuntime();
  return invoke<DirectoryEntryInfo[]>("read_directory", { path });
}

export async function readFile(path: string, maxBytes = 102_400): Promise<FileReadResult> {
  ensureTauriRuntime();
  return invoke<FileReadResult>("read_file", { path, maxBytes });
}

export async function readImageFile(path: string): Promise<string> {
  ensureTauriRuntime();
  return invoke<string>("read_image_file", { path });
}

export async function openFileInEditor(path: string): Promise<boolean> {
  ensureTauriRuntime();
  return invoke<boolean>("open_file_in_editor", { path });
}

export async function runHermesTask(params: {
  task: DispatchTask;
  agent: Agent;
  binding?: CapabilityBinding;
  messages: Message[];
  baseUrl?: string;
}): Promise<string> {
  ensureTauriRuntime();
  const history: RuntimeMessage[] = params.messages
    .filter((message) => message.authorKind === "user" || message.authorKind === "agent")
    .slice(-12)
    .map((message) => ({
      role: message.authorKind === "agent" ? "assistant" : "user",
      content: `${message.authorName}: ${message.content}`,
    }));

  const output = await invoke<RunHermesAgentOutput>("run_hermes_agent", {
    input: {
      baseUrl: params.baseUrl,
      taskId: params.task.id,
      profile: params.binding?.hermesProfile ?? "default",
      model: params.binding?.model,
      agentName: params.agent.name,
      systemPrompt: buildSystemPrompt(params.agent, params.binding),
      instruction: buildInstructionWithAttachments(params.task.instruction, params.messages, params.task.triggerMessageId),
      history,
      attachments: attachmentsForTask(params.messages, params.task.triggerMessageId),
      contextFolder: params.binding?.workDir,
    } satisfies RunHermesAgentInput,
  });

  if (!output.content.trim()) {
    throw new Error("Hermes 返回了空内容。");
  }
  return output.content;
}

export async function runHermesTaskStream(params: {
  task: DispatchTask;
  agent: Agent;
  binding?: CapabilityBinding;
  messages: Message[];
  baseUrl?: string;
}): Promise<RunHermesAgentOutput> {
  ensureTauriRuntime();
  const history = historyForMessages(params.messages);
  const output = await invoke<RunHermesAgentOutput>("run_hermes_agent_stream", {
    input: {
      baseUrl: params.baseUrl,
      taskId: params.task.id,
      profile: params.binding?.hermesProfile ?? "default",
      model: params.binding?.model,
      agentName: params.agent.name,
      systemPrompt: buildSystemPrompt(params.agent, params.binding),
      instruction: buildInstructionWithAttachments(params.task.instruction, params.messages, params.task.triggerMessageId),
      history,
      attachments: attachmentsForTask(params.messages, params.task.triggerMessageId),
      contextFolder: params.binding?.workDir,
    } satisfies RunHermesAgentInput,
  });

  if (!output.content.trim()) {
    throw new Error("Hermes 返回了空内容。");
  }
  return output;
}

export function buildSessionSummary(state: OrchestrationState): HermesTeamSessionSummary {
  const firstUserMessage = state.messages.find((message) => message.authorKind === "user");
  const defaultAgentId = state.workspace.defaultAgentId ?? state.agents[0]?.id;
  const contextFolder =
    state.bindings.find((binding) => binding.agentId === defaultAgentId)?.workDir?.trim() || null;
  return {
    id: state.workspace.id,
    workspaceId: state.workspace.id,
    title: firstUserMessage?.content.slice(0, 80) || state.workspace.name,
    messageCount: state.messages.length,
    taskCount: state.tasks.length,
    updatedAt: Date.now(),
    contextFolder,
    state,
  };
}

export function isTauriRuntimeAvailable(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

function ensureTauriRuntime(): void {
  if (!isTauriRuntimeAvailable()) {
    throw new Error(TAURI_UNAVAILABLE_MESSAGE);
  }
}

function buildSystemPrompt(agent: Agent, binding?: CapabilityBinding): string {
  const capabilityLines = binding
    ? [
        `Hermes Profile: ${binding.hermesProfile}`,
        `Toolsets: ${binding.toolsets.join(", ") || "none"}`,
        `MCP Servers: ${binding.mcpServers.join(", ") || "none"}`,
        `Skills: ${binding.skills.join(", ") || "none"}`,
        `Memory: ${binding.memoryEnabled ? "enabled" : "disabled"}`,
      ]
    : ["Hermes capability binding is not configured."];

  return [
    `你是 Hermes Team 中的 Agent：${agent.name}。`,
    `角色：${agent.role}。`,
    agent.prompt,
    "",
    "当前能力绑定：",
    ...capabilityLines,
    "",
    "只回答你被分配的任务。不要伪造工具结果；如果需要工具但当前运行时未提供，请明确说明缺口。",
  ].join("\n");
}

function historyForMessages(messages: Message[]): RuntimeMessage[] {
  return messages
    .filter((message) => {
      if (message.authorKind !== "user" && message.authorKind !== "agent") return false;
      if (message.authorKind === "user" && message.content.trim().startsWith("💭")) return false;
      return true;
    })
    .slice(-12)
    .map((message) => ({
      role: message.authorKind === "agent" ? "assistant" : "user",
      content: `${message.authorName}: ${message.content}`,
    }));
}

function attachmentsForTask(messages: Message[], triggerMessageId: string): RuntimeAttachment[] {
  return messages
    .find((message) => message.id === triggerMessageId)
    ?.attachments?.map((attachment) => ({
      path: attachment.path,
      name: attachment.name,
      kind: attachment.kind,
      mime: attachment.mime,
      size: attachment.size,
      text: attachment.text,
      dataUrl: attachment.dataUrl,
      originalSize: attachment.originalSize,
    })) ?? [];
}

function buildInstructionWithAttachments(instruction: string, messages: Message[], triggerMessageId: string): string {
  const attachments = attachmentsForTask(messages, triggerMessageId);
  if (attachments.length === 0) return instruction;
  return [
    instruction,
    "",
    "用户随消息附加了以下本地文件。请只基于 Hermes Runtime 实际读取到的附件内容回答；如果附件不可读，请说明具体缺口。",
    ...attachments.map((attachment) =>
      `- ${attachment.name ?? "attachment"} (${attachment.kind ?? "path-ref"}): ${attachment.path ?? attachment.mime ?? "inline"}`,
    ),
  ].join("\n");
}
