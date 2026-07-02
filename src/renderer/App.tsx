import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  Building2,
  CheckCircle2,
  ChevronDown,
  CircleDot,
  Clock,
  Compass,
  FlaskConical,
  GitBranch,
  FolderPlus,
  FileCode2,
  ExternalLink,
  History,
  LayoutGrid,
  Users,
  MoreHorizontal,
  Pause,
  Pencil,
  Play,
  Repeat,
  ScrollText,
  X,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
  Plus,
  Power,
  Plug,
  RefreshCw,
  Save,
  ShieldCheck,
  Stethoscope,
  Upload,
  Search,
  Settings,
  StopCircle,
  TerminalSquare,
  Trash2,
  WandSparkles,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { classifyAssistantHandoff } from "../core/handoff";
import {
  applyArtifactsFromToolEvents,
  archiveArtifact,
  parseWriteToolEvent,
  resolveArtifactPath,
  updateArtifactChange,
} from "../core/artifacts";
import { parseMentions } from "../core/mention-parser";
import {
  appendSystemMessage,
  appendTask,
  cancelTaskWithSystemMessage,
  failTaskWithSystemMessage,
  handleUserMessage,
  markTaskRunning,
  type OrchestrationState,
} from "../core/orchestrator";
import { ParallelBatchTracker } from "../core/parallel-batch-tracker";
import { SerialChainTracker } from "../core/serial-chain-tracker";
import { seedAgents, seedBindings, seedMessages, seedWorkspace } from "../core/seed";
import { useI18n, type Language } from "../i18n";
import type { Message, MessageAttachment, SessionModelOverride, WorkMode, WorkspaceMode } from "../core/types";
import { looksDestructiveInstruction, normalizeWorkMode } from "../core/workMode";
import {
  basename,
  configSeverityLabel,
  decisionDetail,
  decisionLabel,
  profileStatusClass,
  profileStatusText,
  taskSummary,
} from "./appDisplay";
import {
  ONBOARDING_STORAGE_KEY,
  defaultAppSettings,
  defaultNetworkSettings,
  defaultRemoteConnectionConfig,
  emptyMcpForm,
  emptyModelForm,
  emptyPoolForm,
  emptyProfileForm,
  emptySkillInstallForm,
  fontOptions,
  themeOptions,
} from "./appDefaults";
import { processDroppedOrPastedFiles } from "./attachmentProcessing";
import { formatDateTime, formatFileSize, formatTime } from "./appFormatting";
import type {
  ActiveView,
  InspectorPanel,
  McpForm,
  MessagingEnvDrafts,
  ModelForm,
  PoolForm,
  ProfileForm,
  ProviderKeyDrafts,
  QueuedChatMessage,
  RuntimeEvent,
  SettingsPanel,
  SkillInstallForm,
} from "./appTypes";
import { buildLabel } from "./buildInfo";
import {
  appendRuntimeEvent,
  parseTokenUsageEvent,
  streamRuntimeEvent,
  type RuntimeEventInput,
  type TokenUsage,
} from "./chatStreamEvents";
import { applyStreamEventSnapshot } from "./chatStreamState";
import {
  applyChatRunInitialProfile,
  buildChatRunWindowRequest,
  chatRunContextFromLocation,
  sessionForChatRun,
  shouldPersistGlobalState,
  shouldRestoreGlobalState,
  shouldSaveSessionSnapshot,
} from "./chatRunContext";
import {
  chatRunClosedDedupKey,
  chatRunClosedSessionLookupId,
  isChatRunClosedForWorkspace,
  summarizeChatRunSession,
} from "./chatRunLifecycle";
import { runLocalReplyCommand } from "./chatInput/localCommands";
import {
  applyTaskStreamOutput,
  detachParallelChatRunTasks,
  executeTaskRuntimeStream,
  planParallelChatRunSessions,
  planSendMessage,
  resolveTaskRuntimeContext,
  type ParallelChatRunSessionPlan,
  type SendMessagePlan,
} from "./chatRuntimeController";
import { SLASH_COMMANDS } from "./chatInput/slashCommands";
import { ChatView } from "./ChatView";
import { ArtifactPanel } from "./ArtifactPanel";
import { DestructiveConfirmModal } from "./DestructiveConfirmModal";
import { DiscoverView, type DiscoverKind } from "./DiscoverView";
import { KanbanView } from "./KanbanView";
import { MultiAgentView } from "./MultiAgentView";
import { OfficeView } from "./OfficeView";
import { MessagingPlatformCard } from "./MessagingPlatformCard";
import { OnboardingFlow, type OnboardingConfigureInput } from "./OnboardingFlow";
import ProfileAvatar from "./ProfileAvatar";
import ProfileDetailModal from "./ProfileDetailModal";
import UpdateDialog from "./UpdateDialog";
import { SessionsView } from "./SessionsView";
import { SidebarRecentSessions } from "./SidebarRecentSessions";
import { WebPreviewPanel } from "./WebPreviewPanel";
import { formatInspectInjection } from "./webPreviewInspector";
import { useFastMode } from "./useFastMode";
import { useReasoningEffort } from "./useReasoningEffort";
import {
  CRON_DELIVER_OPTIONS,
  CRON_FREQ_OPTIONS,
  CRON_WEEKDAYS,
  clampInt,
  cronFormFromJob,
  cronRunStatusKind,
  cronStateMeta,
  describeCronSchedule,
  emptyCronJobForm,
  formatCronDate,
  formatCronRelative,
  formatCronRunTime,
  nextCronRun,
  serializeCronSchedule,
  type CronFrequency,
  type CronJobForm,
} from "./cronForm";
import { isConnectionRefused, runtimeErrorMessage } from "./runtimeErrors";
import { ContextUsageStat, SessionTimer, StatusRow, TransportSelector } from "./statusWidgets";
import {
  activeProfileName as deriveActiveProfileName,
  profileOptionsFor,
  runtimeStatusFromGateway,
  runtimeStatusFromRemote,
  sanitizeProfileName,
  shouldFallbackToDefaultProfile,
  targetProfileName,
} from "./profileRuntime";
import {
  connectSshTunnel,
  createGatewayApiKey,
  disconnectSshTunnel,
  loadInstallStatus,
  loadRemoteConfig,
  loadRemoteSnapshot,
  loadRemoteStatus,
  probeGateway,
  remoteTransportSettings,
  saveRemoteConfigValue,
  startGatewayForProfile,
  stopGatewayForProfile,
  testRemoteConfigValue,
} from "./gatewayActions";
import {
  activateStoredProfile,
  createStoredProfile,
  deleteStoredProfile,
  loadProfiles,
  updateAgentProfileBinding,
} from "./profileActions";
import {
  hasActiveSessionTasks,
  isScratchSession,
  normalizeLoadedState,
  sameSessionModelOverride,
} from "./sessionState";
import {
  planNewSession,
  planSessionDeletion,
  planSessionRestore,
  type SessionStateTransition,
} from "./sessionLifecycle";
import {
  deleteStoredSession,
  deleteStoredSessions,
  loadDesktopSessionList,
  loadImportedSessionTransition,
  loadLocalSessionList,
  normalizeSessionFolder,
  optimisticMoveSessionFolder,
  optimisticPinSession,
  optimisticRemoveSessions,
  optimisticRenameSession,
  renameStoredSession,
  saveSessionSnapshot,
  saveWorkspaceState,
  searchDesktopSessionList,
  sessionProfileName,
  setStoredSessionFolder,
  setStoredSessionPinned,
  shouldPersistSessionSnapshot,
} from "./sessionActions";
import {
  addHermesMemoryEntry,
  addCredentialPoolEntry,
  activateHermesModel,
  autofixConfigIssue,
  cancelHermesTask,
  checkForAppUpdates,
  createHermesCronJob,
  editHermesCronJob,
  listHermesCronJobRuns,
  listHermesCronScripts,
  discoverProviderModels,
  createHermesBackupFile,
  createHermesDebugDump,
  restoreHermesBackupFile,
  getAppSettings,
  getConfigHealth,
  getHermesModelConfig,
  getNetworkSettings,
  getUpdateStatus,
  installHermesSkill,
  installHermesMcpCatalogEntry,
  fetchHermesRegistry,
  fetchHermesRegistryDetail,
  installHermesRegistryAgent,
  installHermesRegistryWorkflow,
  listHermesInstalledWorkflows,
  isTauriRuntimeAvailable,
  listAuxiliaryModelConfigs,
  listCredentialPool,
  listHermesBundledSkills,
  listHermesCronJobs,
  listHermesLogs,
  listHermesMcpCatalog,
  listHermesMcpServers,
  listHermesModels,
  listHermesSkills,
  listHermesToolsets,
  listMessagingPlatforms,
  listProviderKeys,
  listProviderRegistry,
  listRegistryModelLibrary,
  listenChatRunWindowClosed,
  listenHermesAgentStream,
  openChatRunWindow,
  openExternalUrl,
  loadHermesTeamState,
  readHermesMemorySummary,
  readHermesMemoryDetails,
  readHermesLog,
  readHermesMemoryContent,
  listHermesMemoryProviders,
  activateHermesMemoryProvider,
  deactivateHermesMemoryProvider,
  setHermesMemoryProviderEnv,
  readHermesPersona,
  writeHermesPersona,
  readHermesSkillContent,
  removeCredentialPoolEntry,
  removeHermesMemoryEntry,
  removeHermesCronJob,
  removeHermesMcpServer,
  removeHermesSkill,
  pauseHermesCronJob,
  runHermesUpdate,
  saveAppSettings,
  saveAuxiliaryModelConfig,
  saveHermesMcpServer,
  saveHermesModel,
  saveNetworkSettings,
  saveProviderKey,
  selectAttachmentFiles,
  selectContextFolder,
  removeHermesModel,
  runHermesDoctor,
  searchHermesSkills,
  setAutoUpgradeEnabled,
  setAutoCheckEnabled,
  setUpdateReleaseRepo,
  setHermesToolsetEnabled,
  resumeHermesCronJob,
  runOAuthProviderLogin,
  testHermesMcpServer,
  testMessagingPlatform,
  triggerHermesCronJob,
  updateMessagingPlatform,
  updateHermesMemoryEntry,
  writeHermesMemoryContent,
  TAURI_UNAVAILABLE_MESSAGE,
  type ActiveModelConfig,
  artifactChangeStats,
  type AppSettings,
  type AuxiliaryModelConfig,
  type BundledSkillInfo,
  type ConfigHealthIssue,
  type ConfigHealthReport,
  type CronJobActionResult,
  type CronJobInfo,
  type CronJobRun,
  type CredentialPoolGroup,
  type HermesDoctorReport,
  type HermesInstallStatus,
  type HermesLogContent,
  type HermesLogInfo,
  type HermesProfileInfo,
  type HermesRestoreResult,
  type RestoreHermesBackupInput,
  type HermesTeamSessionSummary,
  type HermesStateSessionSummary,
  type HermesStateSearchResult,
  type InstalledSkillInfo,
  type McpCatalogEntry,
  type RegistryItem,
  type McpOperationResult,
  type McpServerInfo,
  type MemoryContent,
  type PersonaContent,
  type MemoryDetails,
  type MemorySummary,
  type MemoryProvidersResult,
  type MemoryProviderInfo,
  type MessagingPlatformInfo,
  type MessagingPlatformsResponse,
  type NetworkSettings,
  type ProviderDiscoveryResult,
  type ProviderKeyInfo,
  type ProviderRegistryEntry,
  type RegistryLibraryModel,
  type RegistryLibraryProvider,
  type RemoteConnectionConfig,
  type RemoteConnectionStatus,
  type ChatRunWindowClosedEvent,
  type RuntimeStreamEvent,
  type SavedModel,
  type ToolsetInfo,
  type UpdateStatus,
} from "../runtime/hermes-runtime";

export function App() {
  const { t, language, setLanguage, options: languageOptions } = useI18n();
  const chatRunContext = useMemo(
    () => chatRunContextFromLocation(typeof window === "undefined" ? undefined : window.location.href),
    [],
  );
  const [state, setState] = useState<OrchestrationState>(() =>
    applyChatRunInitialProfile(
      {
        workspace: seedWorkspace,
        agents: seedAgents,
        bindings: seedBindings,
        messages: seedMessages,
        tasks: [],
        logs: [],
      },
      chatRunContext,
    ),
  );
  const [mode, setModeState] = useState<WorkspaceMode>(seedWorkspace.mode);
  const [activeView, setActiveView] = useState<ActiveView>("team");
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<SettingsPanel>("overview");
  const [activeInspectorPanel, setActiveInspectorPanel] = useState<InspectorPanel>("agents");
  const [draft, setDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [destructivePrompt, setDestructivePrompt] = useState<{
    content: string;
    attachments: MessageAttachment[];
    background: boolean;
  } | null>(null);
  const [worktreeVisible, setWorktreeVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [labsExpanded, setLabsExpanded] = useState(false);
  const [webPreviewUrl, setWebPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState(() => t("app.notice.ready"));
  const [sessions, setSessions] = useState<HermesTeamSessionSummary[]>([]);
  const [desktopSessions, setDesktopSessions] = useState<HermesStateSessionSummary[]>([]);
  const [desktopSessionsBusy, setDesktopSessionsBusy] = useState(false);
  const [hermesLogs, setHermesLogs] = useState<HermesLogInfo[]>([]);
  const [selectedLogPath, setSelectedLogPath] = useState("");
  const [logContent, setLogContent] = useState<HermesLogContent | null>(null);
  const [runtimeEvents, setRuntimeEvents] = useState<RuntimeEvent[]>([]);
  const [bundleBusy, setBundleBusy] = useState(false);
  const [restoreBusy, setRestoreBusy] = useState(false);
  const [lastBundlePath, setLastBundlePath] = useState("");
  const [restoreBackupPath, setRestoreBackupPath] = useState("");
  const [restoreBackupContent, setRestoreBackupContent] = useState("");
  const [runtimeStatus, setRuntimeStatus] = useState<{
    state: "checking" | "ready" | "unavailable";
    message: string;
  }>({ state: "checking", message: t("app.notice.probingGateway") });
  const [remoteConfig, setRemoteConfig] = useState<RemoteConnectionConfig>(defaultRemoteConnectionConfig);
  const [remoteStatus, setRemoteStatus] = useState<RemoteConnectionStatus | null>(null);
  const [profiles, setProfiles] = useState<HermesProfileInfo[]>([]);
  const [installStatus, setInstallStatus] = useState<HermesInstallStatus | null>(null);
  const [showOnboarding, setShowOnboarding] = useState(false);
  const [onboardingBusy, setOnboardingBusy] = useState(false);
  const onboardingAutoCheckedRef = useRef(false);
  const [configHealth, setConfigHealth] = useState<ConfigHealthReport | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>(defaultNetworkSettings);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateOutput, setUpdateOutput] = useState("");
  const [updateDialogOpen, setUpdateDialogOpen] = useState(false);
  const [releaseRepoDraft, setReleaseRepoDraft] = useState("");
  const startupUpdateCheckedRef = useRef(false);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpCatalog, setMcpCatalog] = useState<McpCatalogEntry[]>([]);
  const [mcpCatalogDiagnostics, setMcpCatalogDiagnostics] = useState<string[]>([]);
  const [mcpCatalogError, setMcpCatalogError] = useState("");
  const [mcpCatalogQuery, setMcpCatalogQuery] = useState("");
  const [mcpTestResult, setMcpTestResult] = useState<{ name: string; result: McpOperationResult } | null>(null);
  const [skills, setSkills] = useState<InstalledSkillInfo[]>([]);
  const [bundledSkills, setBundledSkills] = useState<BundledSkillInfo[]>([]);
  const [registryAgents, setRegistryAgents] = useState<RegistryItem[]>([]);
  const [registryWorkflows, setRegistryWorkflows] = useState<RegistryItem[]>([]);
  const [registryError, setRegistryError] = useState("");
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryLoaded, setRegistryLoaded] = useState(false);
  const [installedWorkflowIds, setInstalledWorkflowIds] = useState<string[]>([]);
  const [registryBusyId, setRegistryBusyId] = useState<string | null>(null);
  const [memorySummary, setMemorySummary] = useState<MemorySummary | null>(null);
  const [memoryDetails, setMemoryDetails] = useState<MemoryDetails | null>(null);
  const [memoryContent, setMemoryContent] = useState<MemoryContent | null>(null);
  const [memoryDraft, setMemoryDraft] = useState({ memory: "", user: "" });
  const [personaContent, setPersonaContent] = useState<PersonaContent | null>(null);
  const [personaDraft, setPersonaDraft] = useState("");
  const [newMemoryEntry, setNewMemoryEntry] = useState("");
  const [editingMemoryIndex, setEditingMemoryIndex] = useState<number | null>(null);
  const [editingMemoryDraft, setEditingMemoryDraft] = useState("");
  const [memoryProviders, setMemoryProviders] = useState<MemoryProvidersResult | null>(null);
  const [memoryProviderEnvDraft, setMemoryProviderEnvDraft] = useState<Record<string, string>>({});
  const [memoryProviderBusy, setMemoryProviderBusy] = useState<string | null>(null);
  const [skillQuery, setSkillQuery] = useState("");
  const [skillCatalogQuery, setSkillCatalogQuery] = useState("");
  const [skillDetail, setSkillDetail] = useState<InstalledSkillInfo | BundledSkillInfo | null>(null);
  const [skillDetailContent, setSkillDetailContent] = useState("");
  const [skillInstallForm, setSkillInstallForm] = useState<SkillInstallForm>(emptySkillInstallForm);
  const [models, setModels] = useState<SavedModel[]>([]);
  const [activeModel, setActiveModel] = useState<ActiveModelConfig | null>(null);
  const [tokenUsage, setTokenUsage] = useState<TokenUsage | null>(null);
  const [sessionStartedAt, setSessionStartedAt] = useState<number>(() => Date.now());
  const [auxiliaryModels, setAuxiliaryModels] = useState<AuxiliaryModelConfig[]>([]);
  const [registryLibrary, setRegistryLibrary] = useState<RegistryLibraryProvider[]>([]);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyInfo[]>([]);
  const [providerRegistry, setProviderRegistry] = useState<ProviderRegistryEntry[]>([]);
  const [providerKeyDrafts, setProviderKeyDrafts] = useState<ProviderKeyDrafts>({});
  const [credentialPool, setCredentialPool] = useState<CredentialPoolGroup[]>([]);
  const [poolForm, setPoolForm] = useState<PoolForm>(emptyPoolForm);
  const [profileForm, setProfileForm] = useState<ProfileForm>(emptyProfileForm);
  const [detailProfileName, setDetailProfileName] = useState<string | null>(null);
  const [mcpForm, setMcpForm] = useState<McpForm>(emptyMcpForm);
  const [cronJobs, setCronJobs] = useState<CronJobInfo[]>([]);
  const [cronForm, setCronForm] = useState<CronJobForm>(emptyCronJobForm);
  const [messagingResponse, setMessagingResponse] = useState<MessagingPlatformsResponse | null>(null);
  const [messagingEnvDrafts, setMessagingEnvDrafts] = useState<MessagingEnvDrafts>({});
  const [messagingSearch, setMessagingSearch] = useState("");
  const [messagingFilter, setMessagingFilter] = useState<"all" | "enabled" | "configured" | "unconfigured">("all");
  const [messagingExpanded, setMessagingExpanded] = useState<Record<string, boolean>>({});
  const messagingPlatformsView = useMemo(() => {
    const platforms = messagingResponse?.platforms ?? [];
    const query = messagingSearch.trim().toLowerCase();
    return platforms.filter((platform) => {
      if (messagingFilter === "enabled" && !platform.enabled) return false;
      if (messagingFilter === "configured" && !platform.configured) return false;
      if (messagingFilter === "unconfigured" && platform.configured) return false;
      if (!query) return true;
      return (
        platform.name.toLowerCase().includes(query) ||
        platform.id.toLowerCase().includes(query) ||
        platform.description.toLowerCase().includes(query)
      );
    });
  }, [messagingResponse, messagingSearch, messagingFilter]);
  const isMessagingCardOpen = (platform: MessagingPlatformInfo) =>
    messagingExpanded[platform.id] ?? (platform.enabled || (!platform.configured && platform.envVars.some((field) => field.required)));
  const [providerDiscovery, setProviderDiscovery] = useState<ProviderDiscoveryResult | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [auxiliaryBusyTask, setAuxiliaryBusyTask] = useState<string | null>(null);
  const [registryBusy, setRegistryBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [oauthBusyProvider, setOauthBusyProvider] = useState<string | null>(null);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const [mcpBusyServer, setMcpBusyServer] = useState<string | null>(null);
  const [mcpCatalogBusyName, setMcpCatalogBusyName] = useState<string | null>(null);
  const [skillBusy, setSkillBusy] = useState(false);
  const [cronBusy, setCronBusy] = useState(false);
  const [cronOperatingId, setCronOperatingId] = useState<string | null>(null);
  const [cronEditId, setCronEditId] = useState<string | null>(null);
  const [cronSkillDraft, setCronSkillDraft] = useState("");
  const [cronScripts, setCronScripts] = useState<string[]>([]);
  const [cronMenuJobId, setCronMenuJobId] = useState<string | null>(null);
  const [cronRunsJob, setCronRunsJob] = useState<CronJobInfo | null>(null);
  const [cronRuns, setCronRuns] = useState<CronJobRun[]>([]);
  const [cronRunsBusy, setCronRunsBusy] = useState(false);
  const [cronRunsError, setCronRunsError] = useState<string | null>(null);
  const [cronExpandedRun, setCronExpandedRun] = useState<string | null>(null);
  const cronNameInputRef = useRef<HTMLInputElement>(null);
  const cronSchedulePreview = useMemo(() => serializeCronSchedule(cronForm, t), [cronForm, t]);
  const cronNextRun = useMemo(
    () => (cronSchedulePreview.value ? nextCronRun(cronSchedulePreview.value) : null),
    [cronSchedulePreview.value],
  );
  const [messagingBusy, setMessagingBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [configHealthBusy, setConfigHealthBusy] = useState(false);
  const [configFixingCode, setConfigFixingCode] = useState<string | null>(null);
  const [doctorReport, setDoctorReport] = useState<HermesDoctorReport | null>(null);
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [settingsBusy, setSettingsBusy] = useState(false);
  const [networkBusy, setNetworkBusy] = useState(false);
  const [updateBusy, setUpdateBusy] = useState(false);
  const [profileBusy, setProfileBusy] = useState(false);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const stateRef = useRef(state);
  const sessionsRef = useRef<HermesTeamSessionSummary[]>([]);
  const closedChatRunWindowKeysRef = useRef<Set<string>>(new Set());
  const cancelledTaskIdsRef = useRef<Set<string>>(new Set());
  const childAutoRunTaskIdsRef = useRef<Set<string>>(new Set());
  const parallelTrackerRef = useRef(new ParallelBatchTracker());
  const serialTrackerRef = useRef(new SerialChainTracker());
  const streamEventHandlerRef = useRef<(event: RuntimeStreamEvent) => void>(() => undefined);
  const pendingStreamEventsRef = useRef<Map<string, RuntimeStreamEvent>>(new Map());
  const streamFlushFrameRef = useRef<number | null>(null);
  const restoreBackupInputRef = useRef<HTMLInputElement | null>(null);

  const agents = state.agents;
  const messages = state.messages;
  const bindings = state.bindings;
  const agentNames = useMemo(() => agents.map((agent) => agent.name), [agents]);
  const agentIdByName = useMemo(
    () => new Map(agents.map((agent) => [agent.name, agent.id])),
    [agents],
  );
  const profileByName = useMemo(
    () => new Map(profiles.map((profile) => [profile.name, profile])),
    [profiles],
  );
  const toolsetGroups = useMemo(() => {
    const groups = new Map<string, ToolsetInfo[]>();
    for (const toolset of toolsets) {
      const group = toolset.group || "Other";
      groups.set(group, [...(groups.get(group) ?? []), toolset]);
    }
    return Array.from(groups.entries()).map(([group, items]) => ({ group, items }));
  }, [toolsets]);
  const filteredMcpCatalog = useMemo(() => {
    const query = mcpCatalogQuery.trim().toLowerCase();
    if (!query) return mcpCatalog;
    return mcpCatalog.filter((entry) =>
      [entry.name, entry.description, entry.source, entry.transport, entry.authType, entry.requiredEnv.join(" ")]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [mcpCatalog, mcpCatalogQuery]);
  const filteredBundledSkills = useMemo(() => {
    const query = skillCatalogQuery.trim().toLowerCase();
    if (!query) return bundledSkills;
    return bundledSkills.filter((skill) =>
      [skill.name, skill.dirName, skill.category, skill.description]
        .join(" ")
        .toLowerCase()
        .includes(query),
    );
  }, [bundledSkills, skillCatalogQuery]);
  const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
    { id: "overview", label: t("settings.panels.overview") },
    { id: "appearance", label: t("settings.panels.appearance") },
    { id: "privacy", label: t("settings.panels.privacy") },
    { id: "network", label: t("settings.panels.network") },
    { id: "profiles", label: t("settings.panels.profiles") },
    { id: "providers", label: t("settings.panels.providers") },
    { id: "models", label: t("settings.panels.models") },
    { id: "gateway", label: t("settings.panels.gateway") },
    { id: "messaging", label: t("settings.panels.messaging") },
    { id: "schedules", label: t("settings.panels.schedules") },
    { id: "capabilities", label: t("settings.panels.capabilities") },
    { id: "skills", label: t("settings.panels.skills") },
    { id: "memory", label: t("settings.panels.memory") },
    { id: "update", label: t("settings.panels.update") },
    { id: "logs", label: t("settings.panels.logs") },
  ];
  const inspectorPanels: Array<{ id: InspectorPanel; label: string }> = [
    { id: "agents", label: "Agents" },
    { id: "dispatch", label: "Dispatch" },
    { id: "sessions", label: "Sessions" },
    { id: "runtime", label: "Runtime" },
    { id: "logs", label: "Logs" },
  ];
  const settingsCardClass = (panel: SettingsPanel, extra = "") =>
    `settings-card ${extra} ${activeSettingsPanel === panel ? "" : "settings-card-hidden"}`.trim();
  const inspectorSectionClass = (panel: InspectorPanel) =>
    `inspector-section ${activeInspectorPanel === panel ? "" : "inspector-section-hidden"}`.trim();

  function addRuntimeEvent(event: RuntimeEventInput) {
    setRuntimeEvents((current) => appendRuntimeEvent(current, event));
  }

  function ensureTaskAnswerMessage(current: OrchestrationState, taskId: string, content = t("app.generating")) {
    const task = current.tasks.find((item) => item.id === taskId);
    if (!task || task.status === "cancelled") return current;
    const agent = current.agents.find((item) => item.id === task.agentId);
    const messageId = `stream-${taskId}`;
    const existing = current.messages.find((message) => message.id === messageId);
    const nextMessage = {
      id: messageId,
      workspaceId: task.workspaceId,
      authorKind: "agent" as const,
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: existing?.content && existing.content !== t("app.generating") ? existing.content : content,
      createdAt: existing?.createdAt ?? Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    return {
      ...current,
      messages: existing
        ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
        : [...current.messages, nextMessage],
    };
  }

  function streamEventKey(event: RuntimeStreamEvent): string {
    return `${event.taskId}:${event.kind}:${event.message || ""}`;
  }

  function resolveSessionWorkDir(current: OrchestrationState): string | null {
    const defaultAgentId = current.workspace.defaultAgentId ?? current.agents[0]?.id;
    const binding =
      current.bindings.find((item) => item.agentId === defaultAgentId) ?? current.bindings[0];
    return binding?.workDir?.trim() || null;
  }

  function queueArtifactStatRefresh(
    nextState: OrchestrationState,
    events: RuntimeStreamEvent[],
    workDir: string | null,
  ) {
    if (!isTauriRuntimeAvailable()) return;
    for (const event of events) {
      if (event.kind !== "tool") continue;
      const parsed = parseWriteToolEvent(event.content);
      if (!parsed || parsed.status !== "completed" || !parsed.pathHint) continue;
      const path = resolveArtifactPath(parsed.pathHint, workDir);
      const artifact = nextState.artifacts?.find(
        (item) => item.taskId === event.taskId && item.path === path && item.status === "active",
      );
      if (!artifact) continue;
      void artifactChangeStats(path, workDir)
        .then((stats) => {
          setState((current) =>
            updateArtifactChange(current, artifact.id, { added: stats.added, removed: stats.removed }),
          );
        })
        .catch(() => undefined);
    }
  }

  function flushPendingStreamEvents() {
    if (streamFlushFrameRef.current != null) {
      window.cancelAnimationFrame(streamFlushFrameRef.current);
      streamFlushFrameRef.current = null;
    }
    const pending = pendingStreamEventsRef.current;
    if (pending.size === 0) return;
    const events = Array.from(pending.values());
    pending.clear();
    setState((current) => {
      const workDir = resolveSessionWorkDir(current);
      const next = applyArtifactsFromToolEvents(
        events.reduce(
          (acc, event) =>
            applyStreamEventSnapshot(acc, event, {
              generating: t("app.generating"),
              unknownAgentName: t("app.unknownAgent"),
              completeDoneTask: true,
            }),
          current,
        ),
        events,
        workDir,
      );
      queueArtifactStatRefresh(next, events, workDir);
      return next;
    });
  }

  function scheduleStreamFlush() {
    if (streamFlushFrameRef.current != null) return;
    streamFlushFrameRef.current = window.requestAnimationFrame(() => {
      streamFlushFrameRef.current = null;
      flushPendingStreamEvents();
    });
  }

  function handleStreamEvent(event: RuntimeStreamEvent) {
    if (event.kind === "start") {
      flushPendingStreamEvents();
      const runtimeEvent = streamRuntimeEvent(event, {
        started: t("app.stream.started"),
        failed: t("app.stream.failed"),
        completed: t("app.stream.completed"),
      });
      if (runtimeEvent) addRuntimeEvent(runtimeEvent);
      return;
    }
    if (event.kind === "usage") {
      flushPendingStreamEvents();
      const usage = parseTokenUsageEvent(event);
      if (usage) setTokenUsage(usage);
      return;
    }
    if (event.kind === "error") {
      flushPendingStreamEvents();
      const message = event.message || t("app.stream.failed");
      const runtimeEvent = streamRuntimeEvent(event, {
        started: t("app.stream.started"),
        failed: t("app.stream.failed"),
        completed: t("app.stream.completed"),
      });
      if (runtimeEvent) addRuntimeEvent(runtimeEvent);
      setState((current) => {
        const task = current.tasks.find((item) => item.id === event.taskId);
        if (!task || task.status === "failed" || task.status === "cancelled") return current;
        return failTaskWithSystemMessage({
          state: current,
          taskId: event.taskId,
          error: message,
        });
      });
      return;
    }
    if (event.kind === "delta" || event.kind === "reasoning" || event.kind === "tool") {
      pendingStreamEventsRef.current.set(streamEventKey(event), event);
      scheduleStreamFlush();
      return;
    }
    flushPendingStreamEvents();
    setState((current) =>
      applyStreamEventSnapshot(current, event, {
        generating: t("app.generating"),
        unknownAgentName: t("app.unknownAgent"),
        completeDoneTask: true,
      }),
    );
    if (event.kind === "done") {
      const runtimeEvent = streamRuntimeEvent(event, {
        started: t("app.stream.started"),
        failed: t("app.stream.failed"),
        completed: t("app.stream.completed"),
      });
      if (runtimeEvent) addRuntimeEvent(runtimeEvent);
    }
  }

  streamEventHandlerRef.current = handleStreamEvent;

  const applyAppSettings = (settings: AppSettings) => {
    const fontStack = fontOptions.find((item) => item.id === settings.font)?.stack ?? fontOptions[0].stack;
    document.documentElement.dataset.theme = settings.theme;
    document.documentElement.dataset.rounded = settings.roundedCorners ? "true" : "false";
    document.documentElement.style.setProperty("--font-sans", fontStack);
  };

  const refreshAppSettings = async () => {
    if (!isTauriRuntimeAvailable()) {
      applyAppSettings(defaultAppSettings);
      return defaultAppSettings;
    }
    try {
      const settings = await getAppSettings();
      setAppSettings(settings);
      applyAppSettings(settings);
      return settings;
    } catch (error) {
      setNotice(t("appearance.readFailed", { error: runtimeErrorMessage(error) }));
      return null;
    }
  };

  const updateAppSettings = async (patch: Partial<AppSettings>) => {
    const next = { ...appSettings, ...patch };
    setAppSettings(next);
    applyAppSettings(next);
    if (!isTauriRuntimeAvailable()) return;
    setSettingsBusy(true);
    try {
      const saved = await saveAppSettings(next);
      setAppSettings(saved);
      applyAppSettings(saved);
      setNotice(t("appearance.saved"));
    } catch (error) {
      setNotice(t("appearance.saveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSettingsBusy(false);
    }
  };

  const refreshNetworkSettings = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setNetworkSettings(defaultNetworkSettings);
      return null;
    }
    const targetProfile = currentProfileName(profileName);
    setNetworkBusy(true);
    try {
      const settings = await getNetworkSettings({ profile: targetProfile });
      setNetworkSettings(settings);
      return settings;
    } catch (error) {
      setNotice(t("app.notice.networkReadFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setNetworkBusy(false);
    }
  };

  const updateNetworkSettings = async (patch: Partial<NetworkSettings>) => {
    const targetProfile = currentProfileName(networkSettings.profile ?? undefined);
    const next = {
      ...networkSettings,
      ...patch,
      profile: targetProfile,
    };
    setNetworkSettings(next);
    if (!isTauriRuntimeAvailable()) return;
    setNetworkBusy(true);
    try {
      const saved = await saveNetworkSettings(next);
      setNetworkSettings(saved);
      setRemoteConfig((current) => ({
        ...current,
        localChatTransport: saved.localChatTransport,
        remoteChatTransport: saved.remoteChatTransport,
        sshChatTransport: saved.sshChatTransport,
      }));
      setNotice(t("app.notice.networkSaved"));
    } catch (error) {
      setNotice(t("app.notice.networkSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setNetworkBusy(false);
    }
  };

  const refreshUpdateStatus = async () => {
    if (!isTauriRuntimeAvailable()) {
      setUpdateStatus(null);
      return null;
    }
    setUpdateBusy(true);
    try {
      const status = await getUpdateStatus();
      setUpdateStatus(status);
      setReleaseRepoDraft(status.releaseRepo);
      return status;
    } catch (error) {
      setNotice(t("app.notice.updateStatusReadFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setUpdateBusy(false);
    }
  };

  const checkUpdatesNow = async (openDialog = true) => {
    setUpdateBusy(true);
    try {
      const status = await checkForAppUpdates();
      setUpdateStatus(status);
      setReleaseRepoDraft(status.releaseRepo);
      setNotice(status.message);
      if (openDialog) setUpdateDialogOpen(true);
      return status;
    } catch (error) {
      setNotice(t("app.notice.checkUpdateFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setUpdateBusy(false);
    }
  };

  const toggleAutoUpgrade = async (enabled: boolean) => {
    if (!updateStatus) return;
    setUpdateStatus({ ...updateStatus, autoUpgrade: enabled });
    if (!isTauriRuntimeAvailable()) return;
    setUpdateBusy(true);
    try {
      const status = await setAutoUpgradeEnabled(enabled);
      setUpdateStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.updatePrefSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setUpdateBusy(false);
    }
  };

  const toggleAutoCheck = async (enabled: boolean) => {
    if (!updateStatus) return;
    setUpdateStatus({ ...updateStatus, autoCheck: enabled });
    if (!isTauriRuntimeAvailable()) return;
    setUpdateBusy(true);
    try {
      const status = await setAutoCheckEnabled(enabled);
      setUpdateStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.startupCheckPrefSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setUpdateBusy(false);
    }
  };

  const saveReleaseRepo = async () => {
    const repo = releaseRepoDraft.trim();
    if (!repo || repo === updateStatus?.releaseRepo) return;
    if (!isTauriRuntimeAvailable()) return;
    setUpdateBusy(true);
    try {
      const status = await setUpdateReleaseRepo(repo);
      setUpdateStatus(status);
      setReleaseRepoDraft(status.releaseRepo);
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.releaseRepoSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setUpdateBusy(false);
    }
  };

  const openReleaseLink = (url: string) => {
    void openExternalUrl(url).catch((error) =>
      setNotice(t("app.notice.openDownloadFailed", { error: runtimeErrorMessage(error) })),
    );
  };

  const runHermesUpdateNow = async () => {
    setUpdateBusy(true);
    setUpdateOutput("");
    try {
      const result = await runHermesUpdate();
      setUpdateOutput(result.output);
      setNotice(result.message);
      await refreshInstallStatus();
      await refreshUpdateStatus();
    } catch (error) {
      setNotice(t("app.notice.hermesUpdateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setUpdateBusy(false);
    }
  };

  const currentProfileName = (profileName?: string) =>
    profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;

  const refreshConfigHealth = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setConfigHealth(null);
      return null;
    }
    const targetProfile = currentProfileName(profileName);
    setConfigHealthBusy(true);
    try {
      const report = await getConfigHealth({ profile: targetProfile });
      setConfigHealth(report);
      return report;
    } catch (error) {
      setConfigHealth(null);
      setNotice(t("app.notice.configHealthFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setConfigHealthBusy(false);
    }
  };

  const runDoctorDiagnostics = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setNotice(t("app.notice.notTauriDiagnose"));
      return null;
    }
    const targetProfile = currentProfileName(profileName);
    setDoctorBusy(true);
    try {
      const report = await runHermesDoctor({ profile: targetProfile });
      setDoctorReport(report);
      setNotice(report.summary);
      return report;
    } catch (error) {
      setNotice(t("app.notice.diagnoseFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setDoctorBusy(false);
    }
  };

  const refreshInstallStatus = async () => {
    if (!isTauriRuntimeAvailable()) {
      setInstallStatus(null);
      setConfigHealth(null);
      return null;
    }
    setInstallBusy(true);
    try {
      const status = await loadInstallStatus();
      setInstallStatus(status);
      void refreshConfigHealth(status.activeProfile);
      return status;
    } catch (error) {
      setInstallStatus(null);
      setNotice(t("app.notice.installCheckFailed", { error: runtimeErrorMessage(error) }));
      return null;
    } finally {
      setInstallBusy(false);
    }
  };

  const refreshHermesCapabilities = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setToolsets([]);
      setMcpServers([]);
      setMcpCatalog([]);
      setMcpCatalogDiagnostics([]);
      setMcpCatalogError("");
      setMcpTestResult(null);
      setSkills([]);
      setBundledSkills([]);
      setMemorySummary(null);
      setMemoryDetails(null);
      setMemoryContent(null);
      setMemoryDraft({ memory: "", user: "" });
      setPersonaContent(null);
      setPersonaDraft("");
      setNewMemoryEntry("");
      setEditingMemoryIndex(null);
      setEditingMemoryDraft("");
      setMemoryProviders(null);
      setMemoryProviderEnvDraft({});
      setMemoryProviderBusy(null);
      setModels([]);
      setActiveModel(null);
      setAuxiliaryModels([]);
      setRegistryLibrary([]);
      setProviderKeys([]);
      setProviderRegistry([]);
      setCredentialPool([]);
      return;
    }
    const targetProfile = currentProfileName(profileName);
    try {
      const [
        nextToolsets,
        nextMcpServers,
        nextMcpCatalog,
        nextSkills,
        nextBundledSkills,
        nextMemory,
        nextMemoryDetails,
        nextMemoryContent,
        nextMemoryProviders,
        nextPersona,
        nextModels,
        nextActiveModel,
        nextAuxiliaryModels,
        nextRegistryLibrary,
        nextProviderKeys,
        nextProviderRegistry,
        nextCredentialPool,
      ] = await Promise.all([
        listHermesToolsets({ profile: targetProfile }),
        listHermesMcpServers({ profile: targetProfile }),
        listHermesMcpCatalog({ profile: targetProfile }),
        listHermesSkills({ profile: targetProfile }),
        listHermesBundledSkills({ profile: targetProfile }),
        readHermesMemorySummary({ profile: targetProfile }),
        readHermesMemoryDetails({ profile: targetProfile }),
        readHermesMemoryContent({ profile: targetProfile }),
        listHermesMemoryProviders({ profile: targetProfile }),
        readHermesPersona({ profile: targetProfile }),
        listHermesModels(),
        getHermesModelConfig({ profile: targetProfile }),
        listAuxiliaryModelConfigs({ profile: targetProfile }),
        listRegistryModelLibrary({ profile: targetProfile }),
        listProviderKeys({ profile: targetProfile }),
        listProviderRegistry({ profile: targetProfile }),
        listCredentialPool({ profile: targetProfile }),
      ]);
      setToolsets(nextToolsets);
      setMcpServers(nextMcpServers);
      setMcpCatalog(nextMcpCatalog.entries);
      setMcpCatalogDiagnostics(nextMcpCatalog.diagnostics);
      setMcpCatalogError(nextMcpCatalog.error ?? "");
      setSkills(nextSkills);
      setBundledSkills(nextBundledSkills);
      setMemorySummary(nextMemory);
      setMemoryDetails(nextMemoryDetails);
      setMemoryContent(nextMemoryContent);
      setMemoryDraft({
        memory: nextMemoryContent.memory,
        user: nextMemoryContent.user,
      });
      setMemoryProviders(nextMemoryProviders);
      setPersonaContent(nextPersona);
      setPersonaDraft(nextPersona.content);
      setModels(nextModels);
      setActiveModel(nextActiveModel);
      setAuxiliaryModels(nextAuxiliaryModels);
      setRegistryLibrary(nextRegistryLibrary);
      setProviderKeys(nextProviderKeys);
      setProviderRegistry(nextProviderRegistry);
      setCredentialPool(nextCredentialPool);
    } catch (error) {
      setNotice(t("app.notice.capabilitiesReadFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const refreshCronJobs = async (profileName?: string, options?: { silent?: boolean }) => {
    if (!isTauriRuntimeAvailable()) {
      setCronJobs([]);
      return;
    }
    const silent = options?.silent ?? false;
    const targetProfile = profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;
    if (!silent) setCronBusy(true);
    try {
      const jobs = await listHermesCronJobs({
        includeDisabled: true,
        profile: targetProfile,
      });
      setCronJobs(jobs);
    } catch (error) {
      // Auto-refresh polling stays quiet so it never spams the notice bar.
      if (!silent) setNotice(t("app.notice.schedulesReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      if (!silent) setCronBusy(false);
    }
  };

  const refreshCronScripts = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setCronScripts([]);
      return;
    }
    const targetProfile = profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;
    try {
      const scripts = await listHermesCronScripts({ profile: targetProfile });
      setCronScripts(scripts);
    } catch {
      setCronScripts([]);
    }
  };

  const openCronRuns = async (job: CronJobInfo) => {
    setCronMenuJobId(null);
    setCronRunsJob(job);
    setCronRuns([]);
    setCronExpandedRun(null);
    setCronRunsError(null);
    setCronRunsBusy(true);
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    try {
      const runs = await listHermesCronJobRuns({ jobId: job.id, profile: targetProfile, limit: 50 });
      setCronRuns(runs);
      if (runs.length === 1) setCronExpandedRun(runs[0].name);
    } catch (error) {
      setCronRunsError(runtimeErrorMessage(error));
    } finally {
      setCronRunsBusy(false);
    }
  };

  const closeCronRuns = () => {
    setCronRunsJob(null);
    setCronRuns([]);
    setCronExpandedRun(null);
    setCronRunsError(null);
  };

  const startCronEdit = (job: CronJobInfo) => {
    setCronEditId(job.id);
    setCronForm(cronFormFromJob(job));
    setCronSkillDraft("");
    cronNameInputRef.current?.focus();
  };

  const cancelCronEdit = () => {
    setCronEditId(null);
    setCronForm(emptyCronJobForm);
    setCronSkillDraft("");
  };

  const submitCronForm = async () => {
    const { value: schedule, error: scheduleError } = serializeCronSchedule(cronForm, t);
    const prompt = cronForm.prompt.trim();
    const script = cronForm.script.trim();
    const noAgent = cronForm.noAgent;
    if (scheduleError || !schedule) {
      setNotice(t("app.notice.scheduleInvalid", { error: scheduleError ?? t("app.notice.checkScheduleSettings") }));
      return;
    }
    if (noAgent && !script) {
      setNotice(t("app.notice.scriptTaskNeedsScript"));
      return;
    }
    if (!noAgent && !prompt) {
      setNotice(t("app.notice.promptEmpty"));
      return;
    }
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const deliver = cronForm.deliverTargets.join(",") || "local";
    const repeatRaw = cronForm.repeatTimes.trim();
    let repeat: number | undefined;
    if (repeatRaw) {
      const parsed = Number(repeatRaw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setNotice(t("app.notice.repeatInvalid"));
        return;
      }
      repeat = parsed;
    }
    const editing = cronEditId;
    // When editing, an emptied repeat field on a job that previously had a cap
    // means "switch back to run forever" — send the explicit clear channel.
    const editingJob = editing ? cronJobs.find((job) => job.id === editing) : undefined;
    const clearRepeat = Boolean(editing && !repeatRaw && editingJob?.repeat?.times != null);
    setCronBusy(true);
    try {
      const result = editing
        ? await editHermesCronJob({
            profile: targetProfile,
            jobId: editing,
            schedule,
            prompt: noAgent ? prompt || undefined : prompt,
            name: cronForm.name.trim() || undefined,
            deliver,
            repeat,
            clearRepeat: clearRepeat || undefined,
            skills: cronForm.skills,
            // Empty string clears a previously attached script.
            script,
            noAgent,
          })
        : await createHermesCronJob({
            profile: targetProfile,
            schedule,
            prompt: prompt || undefined,
            name: cronForm.name.trim() || undefined,
            deliver,
            repeat,
            skills: cronForm.skills.length ? cronForm.skills : undefined,
            script: script || undefined,
            noAgent: noAgent || undefined,
          });
      handleCronActionResult(result, editing ? t("app.notice.scheduleUpdated") : t("app.notice.scheduleCreated"));
      if (result.success) {
        setCronEditId(null);
        setCronForm(emptyCronJobForm);
        setCronSkillDraft("");
        await refreshCronJobs(targetProfile);
      }
    } catch (error) {
      setNotice(t("app.notice.scheduleOpFailed", { action: editing ? t("common.update") : t("common.create"), error: runtimeErrorMessage(error) }));
    } finally {
      setCronBusy(false);
    }
  };

  const runCronJobOperation = async (
    job: CronJobInfo,
    operation: "pause" | "resume" | "remove" | "trigger",
  ) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const confirmed = operation === "remove" ? window.confirm(t("app.notice.confirmDeleteSchedule", { name: job.name })) : true;
    if (!confirmed) return;
    setCronBusy(true);
    setCronOperatingId(job.id);
    try {
      const input = { profile: targetProfile, jobId: job.id };
      const result =
        operation === "pause"
          ? await pauseHermesCronJob(input)
          : operation === "resume"
            ? await resumeHermesCronJob(input)
            : operation === "trigger"
              ? await triggerHermesCronJob(input)
              : await removeHermesCronJob(input);
      const successMessage =
        operation === "pause"
          ? t("app.notice.schedulePaused")
          : operation === "resume"
            ? t("app.notice.scheduleResumed")
            : operation === "trigger"
              ? t("app.notice.scheduleTriggered")
              : t("app.notice.scheduleRemoved");
      handleCronActionResult(result, successMessage);
      if (result.success) await refreshCronJobs(targetProfile);
    } catch (error) {
      setNotice(t("app.notice.scheduleActionFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCronBusy(false);
      setCronOperatingId(null);
    }
  };

  const handleCronActionResult = (result: CronJobActionResult, successMessage: string) => {
    setNotice(result.success ? successMessage : t("app.notice.scheduleActionFailedInline", { error: result.error ?? t("common.unknownError") }));
  };

  const refreshMessagingPlatforms = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setMessagingResponse(null);
      setMessagingEnvDrafts({});
      return;
    }
    const targetProfile = profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;
    setMessagingBusy(true);
    try {
      const response = await listMessagingPlatforms({ profile: targetProfile });
      setMessagingResponse(response);
      setMessagingEnvDrafts((current) => {
        const next = { ...current };
        for (const platform of response.platforms) {
          next[platform.id] = next[platform.id] ?? {};
        }
        return next;
      });
    } catch (error) {
      setNotice(t("app.notice.messagingPlatformsReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMessagingBusy(false);
    }
  };

  const saveMessagingPlatformEnv = async (platform: MessagingPlatformInfo) => {
    const draft = messagingEnvDrafts[platform.id] ?? {};
    const env = Object.fromEntries(
      Object.entries(draft)
        .map(([key, value]) => [key, value.trim()])
        .filter(([, value]) => value.length > 0),
    );
    if (Object.keys(env).length === 0) {
      setNotice(t("app.notice.noNewMessagingEnv"));
      return;
    }
    await applyMessagingPlatformUpdate(platform.id, { env }, t("app.notice.messagingConfigSaved", { name: platform.name }), () => {
      setMessagingEnvDrafts((current) => ({ ...current, [platform.id]: {} }));
    });
  };

  const clearMessagingEnv = async (platform: MessagingPlatformInfo, key: string) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { clearEnv: [key] },
      t("app.notice.messagingEnvCleared", { name: platform.name, key }),
    );
  };

  const toggleMessagingPlatform = async (platform: MessagingPlatformInfo) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { enabled: !platform.enabled },
      platform.enabled
        ? t("app.notice.messagingDisabled", { name: platform.name })
        : t("app.notice.messagingEnabled", { name: platform.name }),
    );
  };

  const toggleMessagingToolset = async (platform: MessagingPlatformInfo, toolsetKey: string, enabled: boolean) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { toolsets: { [toolsetKey]: enabled } },
      t("app.notice.messagingToolsetUpdated", { name: platform.name }),
    );
  };

  const applyMessagingPlatformUpdate = async (
    platform: string,
    update: Parameters<typeof updateMessagingPlatform>[0]["update"],
    successMessage: string,
    afterSuccess?: () => void,
  ) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMessagingBusy(true);
    try {
      const response = await updateMessagingPlatform({
        profile: targetProfile,
        platform,
        update,
      });
      setMessagingResponse(response);
      afterSuccess?.();
      setNotice(successMessage);
    } catch (error) {
      setNotice(t("app.notice.messagingPlatformUpdateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMessagingBusy(false);
    }
  };

  const runMessagingPlatformTest = async (platform: MessagingPlatformInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMessagingBusy(true);
    try {
      const result = await testMessagingPlatform({ profile: targetProfile, platform: platform.id });
      setNotice(result.message);
    } catch (error) {
      setNotice(t("app.notice.messagingTestFailed", { name: platform.name, error: runtimeErrorMessage(error) }));
    } finally {
      setMessagingBusy(false);
    }
  };

  const refreshHermesLogs = async (preferredPath?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setHermesLogs([]);
      setSelectedLogPath("");
      setLogContent(null);
      return;
    }
    setLogBusy(true);
    try {
      const logs = await listHermesLogs();
      setHermesLogs(logs);
      const nextPath = preferredPath || selectedLogPath || logs[0]?.path || "";
      setSelectedLogPath(nextPath);
      if (nextPath) {
        setLogContent(await readHermesLog(nextPath));
      } else {
        setLogContent(null);
      }
    } catch (error) {
      setNotice(t("app.notice.hermesLogsReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setLogBusy(false);
    }
  };

  const openHermesLog = async (path: string) => {
    setSelectedLogPath(path);
    if (!path || !isTauriRuntimeAvailable()) {
      setLogContent(null);
      return;
    }
    setLogBusy(true);
    try {
      setLogContent(await readHermesLog(path));
    } catch (error) {
      setNotice(t("app.notice.logReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setLogBusy(false);
    }
  };

  const exportHermesBundle = async (kind: "backup" | "debug") => {
    if (!isTauriRuntimeAvailable()) {
      setNotice(t("app.notice.noTauriForExport"));
      return;
    }
    setBundleBusy(true);
    setNotice(t("app.notice.generatingFile", { type: kind === "backup" ? t("app.notice.backup") : t("app.notice.diagnosis") }));
    try {
      const nextPath =
        kind === "backup" ? await createHermesBackupFile() : await createHermesDebugDump();
      setLastBundlePath(nextPath);
      setNotice(t("app.notice.fileGenerated", { path: nextPath }));
    } catch (error) {
      setNotice(t("app.notice.fileGenFailed", { type: kind === "backup" ? t("app.notice.backup") : t("app.notice.diagnosis"), error: runtimeErrorMessage(error) }));
    } finally {
      setBundleBusy(false);
    }
  };

  const restoreHermesBackup = async () => {
    if (!isTauriRuntimeAvailable()) {
      setNotice(t("app.notice.noTauriForRestore"));
      return;
    }
    const path = restoreBackupPath.trim();
    const hasUploadedContent = restoreBackupContent.trim().length > 0;
    if (!path && !hasUploadedContent) {
      setNotice(t("app.notice.inputBackupPath"));
      return;
    }
    const confirmed = window.confirm(t("app.notice.confirmRestore"));
    if (!confirmed) {
      setNotice(t("app.notice.restoreCancelled"));
      return;
    }
    setRestoreBusy(true);
    setNotice(t("app.notice.restoringBackup"));
    try {
      const payload: RestoreHermesBackupInput = {
        overwrite: true,
      };
      if (hasUploadedContent) {
        payload.content = restoreBackupContent;
      } else {
        payload.path = path;
      }
      const result: HermesRestoreResult = await restoreHermesBackupFile(payload);
      setNotice(
        t("app.notice.backupRestored", {
          path: result.targetPath,
          restored: result.restored,
          skipped: result.skipped,
        }),
      );
      if (result.warnings.length > 0) {
        setNotice((previous) =>
          `${previous}\n${result.warnings.map((item) => `- ${item}`).join("\n")}`,
        );
      }
      setRestoreBackupPath("");
      setRestoreBackupContent("");
      if (restoreBackupInputRef.current) {
        restoreBackupInputRef.current.value = "";
      }
      void refreshRuntime();
      void refreshHermesCapabilities();
      void refreshConfigHealth();
      void refreshHermesLogs();
    } catch (error) {
      setNotice(t("app.notice.restoreBackupFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRestoreBusy(false);
    }
  };

  const pickHermesBackupFile = () => {
    restoreBackupInputRef.current?.click();
  };

  const canRestoreBackup = restoreBackupContent.trim().length > 0 || restoreBackupPath.trim().length > 0;
  const restoreSourceHint = restoreBackupContent.trim().length > 0
    ? t("app.notice.restoreSourceUpload")
    : restoreBackupPath.trim()
      ? t("app.notice.restoreSourcePath", { path: restoreBackupPath.trim() })
      : "";

  const onRestoreBackupFileChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }
    file
      .text()
      .then((content) => {
        setRestoreBackupPath(file.name);
        setRestoreBackupContent(content);
        setNotice(t("app.notice.backupFileSelected", { name: file.name }));
      })
      .catch((error) => {
        setNotice(t("app.notice.backupFileReadFailed", { error: runtimeErrorMessage(error) }));
      })
      .finally(() => {
        event.target.value = "";
      });
  };

  const refreshRuntime = (options: { autoStart?: boolean } = {}) => {
    const autoStart = options.autoStart ?? true;
    if (!isTauriRuntimeAvailable()) {
      setProfiles([]);
      setInstallStatus(null);
      setRuntimeStatus({
        state: "unavailable",
        message: TAURI_UNAVAILABLE_MESSAGE,
      });
      return Promise.resolve();
    }
    setRuntimeStatus({ state: "checking", message: t("app.notice.probingGateway") });
    return loadRemoteConfig()
      .then(async (connection) => {
        setRemoteConfig(connection);
        if (connection.mode !== "local") {
          const status = await testRemoteConfigValue(connection);
          setRemoteStatus(status);
          setRuntimeStatus(runtimeStatusFromRemote(status));
          return null;
        }
        return Promise.all([loadProfiles(), loadInstallStatus().catch(() => null)])
      .then(([items, install]) => {
        setProfiles(items);
        setInstallStatus(install);
        const profileName = deriveActiveProfileName(items);
        return probeGateway(profileName).catch(async (error: unknown) => {
          if (!isConnectionRefused(error)) throw error;
          if (!autoStart) throw error;
          setRuntimeStatus({
            state: "checking",
            message: t("app.notice.gatewayAutoStart", { profile: profileName }),
          });
          const started = await startGatewayForProfile(profileName);
          if (!started.ok) {
            throw new Error(
              started.logPath
                ? t("app.notice.withLog", { message: started.message, logPath: started.logPath })
                : started.message,
            );
          }
          return probeGateway(profileName);
        });
        });
      })
      .then((result) => {
        if (!result) return;
        setRuntimeStatus(runtimeStatusFromGateway(result));
        void refreshHermesCapabilities(result.profile);
        void refreshConfigHealth(result.profile);
      })
      .catch((error: unknown) => {
        setProfiles([]);
        setRuntimeStatus({
          state: "unavailable",
          message: runtimeErrorMessage(error),
        });
      });
  };

  useEffect(() => {
    if (chatRunContext.kind === "child") {
      document.title = `Hermes Team · ${chatRunContext.label}`;
    }
  }, [chatRunContext.kind, chatRunContext.label]);

  useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntimeAvailable()) {
      applyAppSettings(defaultAppSettings);
      setStateReady(true);
      setRuntimeStatus({
        state: "unavailable",
        message: TAURI_UNAVAILABLE_MESSAGE,
      });
      setNotice(t("app.notice.browserPreview"));
      return () => {
        cancelled = true;
      };
    }
    const restoreWorkspace = shouldRestoreGlobalState(chatRunContext)
      ? loadHermesTeamState()
          .then((saved) => {
            if (!cancelled && saved) {
              const restored = applyChatRunInitialProfile(normalizeLoadedState(saved), chatRunContext);
              setState(restored);
              setModeState(restored.workspace.mode);
              setNotice(t("app.notice.restoredLastChat"));
            }
          })
      : Promise.resolve();

    restoreWorkspace
      .catch(() => {
        setNotice(t("app.notice.ready"));
      })
      .finally(() => {
        if (cancelled) return;
        setStateReady(true);
        void refreshAppSettings();
        void refreshNetworkSettings();
        void refreshUpdateStatus().then((status) => {
          if (startupUpdateCheckedRef.current) return;
          if (!status?.autoCheck) return;
          startupUpdateCheckedRef.current = true;
          void checkUpdatesNow(false).then((checked) => {
            if (checked?.updateAvailable) setUpdateDialogOpen(true);
          });
        });
        void refreshRemoteConnection();
        void loadLocalSessionList()
          .then((items) => {
            if (cancelled) return;
            setSessions(items);
            const session = sessionForChatRun(items, chatRunContext);
            if (!session?.state?.workspace) return;
            const restored = applyChatRunInitialProfile(normalizeLoadedState(session.state), chatRunContext);
            setState(restored);
            setModeState(restored.workspace.mode);
            setNotice(t("app.notice.sessionRestored", { title: session.title }));
          })
          .catch(() => undefined);
        void refreshDesktopSessions();
        void refreshRuntime();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!stateReady) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      if (shouldPersistGlobalState(chatRunContext)) {
        void saveWorkspaceState(state).catch(() => undefined);
      }
      if (shouldSaveSessionSnapshot(chatRunContext) && shouldPersistSessionSnapshot(state)) {
        void saveSessionSnapshot(state, sessionsRef.current)
          .then((items) => setSessions(items))
          .catch(() => undefined);
      }
    }, 250);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [chatRunContext, state, stateReady]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenHermesAgentStream((event) => {
      if (!disposed) streamEventHandlerRef.current(event);
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
      if (streamFlushFrameRef.current != null) {
        window.cancelAnimationFrame(streamFlushFrameRef.current);
        streamFlushFrameRef.current = null;
      }
      pendingStreamEventsRef.current.clear();
    };
  }, []);

  const applySessionTransition = (
    transition: SessionStateTransition,
    options: { resetUsage?: boolean; resetStartedAt?: boolean } = {},
  ) => {
    parallelTrackerRef.current.clear(transition.previousWorkspaceId);
    serialTrackerRef.current.clear(transition.previousWorkspaceId);
    cancelledTaskIdsRef.current.clear();

    setModeState(transition.nextState.workspace.mode);
    setState(transition.nextState);
    setDraft("");
    setDraftAttachments([]);
    setRuntimeEvents([]);
    if (options.resetUsage) setTokenUsage(null);
    if (options.resetStartedAt) setSessionStartedAt(Date.now());
    setActiveView("team");
  };

  const createNewSession = async () => {
    const plan = planNewSession(state, mode);
    if (plan.kind === "blocked-active-tasks") {
      setActiveView("team");
      setActiveInspectorPanel("dispatch");
      setNotice(t("app.notice.activeTasksNewSession"));
      return;
    }

    if (plan.kind === "scratch") {
      setActiveView("team");
      setDraft("");
      setDraftAttachments([]);
      setNotice(t("app.notice.alreadyBlankSession"));
      return;
    }

    applySessionTransition(plan, { resetUsage: true, resetStartedAt: true });
    setNotice(t("app.notice.openedNewSession"));

    if (!isTauriRuntimeAvailable()) {
      return;
    }

    if (shouldPersistGlobalState(chatRunContext)) {
      void saveWorkspaceState(plan.nextState).catch(() => undefined);
    }
  };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "n") {
        event.preventDefault();
        void createNewSession();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [state, mode]);

  const restoreSession = async (session: HermesTeamSessionSummary) => {
    const plan = planSessionRestore(state, session);
    if (plan.kind === "missing-state") {
      setNotice(t("app.notice.sessionNoState"));
      return;
    }

    applySessionTransition(plan);
    setNotice(t("app.notice.sessionRestored", { title: session.title }));
  };

  const refreshLocalSessions = async () => {
    if (!isTauriRuntimeAvailable()) return;
    try {
      const items = await loadLocalSessionList();
      setSessions(items);
      setNotice(t("app.notice.localSessionsRefreshed"));
    } catch (error) {
      setNotice(t("app.notice.localSessionsRefreshFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const refreshDesktopSessions = async () => {
    if (!isTauriRuntimeAvailable()) return;
    setDesktopSessionsBusy(true);
    try {
      const targetProfile = sessionProfileName(currentChatProfile, installStatus?.activeProfile);
      const items = await loadDesktopSessionList(targetProfile);
      setDesktopSessions(items);
    } catch (error) {
      setNotice(t("app.notice.stateDbReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setDesktopSessionsBusy(false);
    }
  };

  const searchDesktopSessions = async (
    query: string,
  ): Promise<HermesStateSearchResult[]> => {
    if (!isTauriRuntimeAvailable()) return [];
    const trimmed = query.trim();
    if (!trimmed) return [];
    const targetProfile = sessionProfileName(currentChatProfile, installStatus?.activeProfile);
    return searchDesktopSessionList(trimmed, targetProfile);
  };

  const importDesktopSession = async (session: HermesStateSessionSummary) => {
    if (hasActiveSessionTasks(state)) {
      setNotice(t("app.notice.activeTasksImport"));
      return;
    }
    setDesktopSessionsBusy(true);
    try {
      const transition = await loadImportedSessionTransition({
        currentState: state,
        session,
        workspaceMode: mode,
        t,
      });
      applySessionTransition(transition);
      setNotice(t("app.notice.sessionImported", { title: session.title }));
      if (isTauriRuntimeAvailable()) {
        if (shouldPersistGlobalState(chatRunContext)) {
          void saveWorkspaceState(transition.nextState).catch(() => undefined);
        }
        if (shouldSaveSessionSnapshot(chatRunContext)) {
          void saveSessionSnapshot(transition.nextState)
            .then((items) => setSessions(items))
            .catch(() => undefined);
        }
      }
    } catch (error) {
      setNotice(t("app.notice.sessionImportFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setDesktopSessionsBusy(false);
    }
  };

  const renameSession = async (sessionId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setNotice(t("app.notice.sessionTitleEmpty"));
      return;
    }
    const previous = sessionsRef.current;
    setSessions((current) => optimisticRenameSession(current, sessionId, trimmed));
    try {
      const next = await renameStoredSession(sessionId, trimmed);
      setSessions(next);
      setNotice(t("app.notice.sessionTitleUpdated"));
    } catch (error) {
      setSessions(previous);
      setNotice(t("app.notice.sessionRenameFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const deleteSession = async (sessionId: string) => {
    const plan = planSessionDeletion(state, [sessionId], mode);
    if (plan.kind === "empty") return;
    if (plan.kind === "blocked-active-tasks") {
      setNotice(t("app.notice.activeTasksDelete"));
      return;
    }
    const previous = sessionsRef.current;
    setSessions((current) => optimisticRemoveSessions(current, plan.removedIds));
    try {
      const next = await deleteStoredSession(plan.ids[0]);
      setSessions(next);
      if (plan.kind === "delete-and-reset") {
        applySessionTransition(plan);
        if (shouldPersistGlobalState(chatRunContext)) {
          void saveWorkspaceState(plan.nextState).catch(() => undefined);
        }
      }
      setNotice(t("app.notice.sessionDeleted"));
    } catch (error) {
      setSessions(previous);
      setNotice(t("app.notice.sessionDeleteFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const bulkDeleteSessions = async (sessionIds: string[]) => {
    const plan = planSessionDeletion(state, sessionIds, mode);
    if (plan.kind === "empty") return;
    if (plan.kind === "blocked-active-tasks") {
      setNotice(t("app.notice.activeTasksDelete"));
      return;
    }
    const previous = sessionsRef.current;
    setSessions((current) => optimisticRemoveSessions(current, plan.removedIds));
    try {
      const next = await deleteStoredSessions(plan.ids);
      setSessions(next);
      if (plan.kind === "delete-and-reset") {
        applySessionTransition(plan);
        if (shouldPersistGlobalState(chatRunContext)) {
          void saveWorkspaceState(plan.nextState).catch(() => undefined);
        }
      }
      setNotice(t("app.notice.sessionsBulkDeleted", { count: plan.ids.length }));
    } catch (error) {
      setSessions(previous);
      setNotice(t("app.notice.sessionsBulkDeleteFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const togglePinSession = async (sessionId: string) => {
    const current = sessionsRef.current.find((session) => session.id === sessionId);
    if (!current) return;
    const nextPinned = !current.pinned;
    const previous = sessionsRef.current;
    setSessions((items) => optimisticPinSession(items, sessionId, nextPinned));
    try {
      const next = await setStoredSessionPinned(sessionId, nextPinned);
      setSessions(next);
      setNotice(nextPinned ? t("app.notice.sessionPinned") : t("app.notice.sessionUnpinned"));
    } catch (error) {
      setSessions(previous);
      setNotice(t("app.notice.pinUpdateFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const moveSessionToFolder = async (sessionId: string, folder: string | null) => {
    const normalized = normalizeSessionFolder(folder);
    const current = sessionsRef.current.find((session) => session.id === sessionId);
    if (current && (current.contextFolder ?? null) === normalized) return;
    const previous = sessionsRef.current;
    setSessions((items) => optimisticMoveSessionFolder(items, sessionId, normalized));
    try {
      const next = await setStoredSessionFolder(sessionId, normalized);
      setSessions(next);
      setNotice(
        normalized
          ? t("app.notice.sessionMovedTo", { folder: basename(normalized) })
          : t("app.notice.sessionMovedOut"),
      );
    } catch (error) {
      setSessions(previous);
      setNotice(t("app.notice.sessionMoveFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const pickFolderForSession = async (sessionId: string) => {
    try {
      const selected = await selectContextFolder();
      if (!selected) return;
      await moveSessionToFolder(sessionId, selected.path);
    } catch (error) {
      setNotice(t("app.notice.pickFolderFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const updateAgentProfile = (agentId: string, hermesProfile: string) => {
    setState((current) => updateAgentProfileBinding(current, agentId, hermesProfile));
  };

  const refreshProfiles = async () => {
    if (!isTauriRuntimeAvailable()) {
      setProfiles([]);
      return;
    }
    try {
      const next = await loadProfiles();
      setProfiles(next);
    } catch (error) {
      setNotice(t("app.notice.profilesRefreshFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const createProfileFromForm = async () => {
    const name = sanitizeProfileName(profileForm.name);
    if (!name) {
      setNotice(t("app.notice.profileNameEmpty"));
      return;
    }
    setProfileBusy(true);
    try {
      const next = await createStoredProfile({
        name,
        cloneConfig: profileForm.cloneConfig,
      });
      setProfiles(next);
      setProfileForm(emptyProfileForm);
      setNotice(t("app.notice.profileCreated", { name }));
    } catch (error) {
      setNotice(t("app.notice.profileCreateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProfileBusy(false);
    }
  };

  const activateProfile = async (profileName: string, openChat = false) => {
    setProfileBusy(true);
    try {
      const next = await activateStoredProfile(profileName);
      setProfiles(next);
      if (chatAgent) {
        updateAgentProfile(chatAgent.id, profileName);
      }
      await refreshRuntime({ autoStart: true });
      await refreshHermesCapabilities(profileName);
      await refreshConfigHealth(profileName);
      await refreshNetworkSettings(profileName);
      await refreshMessagingPlatforms(profileName);
      await refreshCronJobs(profileName);
      await refreshCronScripts(profileName);
      setNotice(t("app.notice.profileSwitched", { profile: profileName }));
      if (openChat) {
        setActiveView("team");
      }
    } catch (error) {
      setNotice(t("app.notice.profileSwitchFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProfileBusy(false);
    }
  };

  const deleteProfileByName = async (profile: HermesProfileInfo, skipConfirm = false) => {
    if (profile.isDefault) {
      setNotice(t("app.notice.cannotDeleteDefault"));
      return;
    }
    if (!skipConfirm) {
      const confirmed = window.confirm(t("app.notice.confirmDeleteProfile", { name: profile.name }));
      if (!confirmed) return;
    }
    setProfileBusy(true);
    try {
      const next = await deleteStoredProfile(profile.name);
      setProfiles(next);
      if (shouldFallbackToDefaultProfile(profile, currentChatProfile)) {
        if (chatAgent) updateAgentProfile(chatAgent.id, "default");
        await activateProfile("default");
      }
      setNotice(t("app.notice.profileDeleted", { name: profile.name }));
    } catch (error) {
      setNotice(t("app.notice.profileDeleteFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProfileBusy(false);
    }
  };

  const refreshRemoteConnection = async () => {
    if (!isTauriRuntimeAvailable()) return;
    try {
      const { config, status } = await loadRemoteSnapshot();
      setRemoteConfig(config);
      setRemoteStatus(status);
    } catch (error) {
      setNotice(t("app.notice.remoteConfigReadFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const saveRemoteConfig = async () => {
    setRemoteBusy(true);
    try {
      const saved = await saveRemoteConfigValue(remoteConfig);
      setRemoteConfig(saved);
      setNetworkSettings((current) => ({
        ...current,
        ...remoteTransportSettings(saved),
      }));
      const status = await loadRemoteStatus().catch(() => null);
      setRemoteStatus(status);
      setNotice(t("app.notice.remoteConfigSaved"));
      await refreshRuntime({ autoStart: saved.mode === "local" });
    } catch (error) {
      setNotice(t("app.notice.remoteConfigSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRemoteBusy(false);
    }
  };

  const testRemoteConfig = async () => {
    setRemoteBusy(true);
    try {
      const status = await testRemoteConfigValue(remoteConfig);
      setRemoteStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.remoteTestFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRemoteBusy(false);
    }
  };

  const connectSsh = async () => {
    setRemoteBusy(true);
    try {
      const status = await connectSshTunnel(remoteConfig);
      setRemoteStatus(status);
      setRemoteConfig((current) => ({ ...current, mode: "ssh" }));
      setRuntimeStatus(runtimeStatusFromRemote(status));
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.sshStartFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRemoteBusy(false);
    }
  };

  const disconnectSsh = async () => {
    setRemoteBusy(true);
    try {
      const status = await disconnectSshTunnel();
      setRemoteStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(t("app.notice.sshStopFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRemoteBusy(false);
    }
  };

  const startGateway = async (profileName?: string) => {
    const targetProfile = targetProfileName(profileName, profiles);
    setGatewayBusy(true);
    setRuntimeStatus({
      state: "checking",
      message: t("app.notice.gatewayStarting", { profile: targetProfile }),
    });
    try {
      const result = await startGatewayForProfile(targetProfile);
      setRuntimeStatus(runtimeStatusFromGateway(result));
      setNotice(
        result.ok
          ? t("app.notice.gatewayReady")
          : result.logPath
          ? t("app.notice.gatewayIncompleteLog", { logPath: result.logPath })
          : t("app.notice.gatewayIncomplete"),
      );
      await refreshRuntime();
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setRuntimeStatus({ state: "unavailable", message });
      setNotice(t("app.notice.gatewayStartFailed"));
      return false;
    } finally {
      setGatewayBusy(false);
    }
  };

  const stopGateway = async (profileName?: string) => {
    const targetProfile = targetProfileName(profileName, profiles);
    setGatewayBusy(true);
    setRuntimeStatus({
      state: "checking",
      message: t("app.notice.gatewayStopping", { profile: targetProfile }),
    });
    try {
      const result = await stopGatewayForProfile(targetProfile);
      setRuntimeStatus({
        state: result.ok ? "unavailable" : "ready",
        message: `${result.profile} · ${result.baseUrl} · ${result.message}`,
      });
      setNotice(result.message);
      await refreshRuntime({ autoStart: false });
      await refreshInstallStatus();
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setRuntimeStatus({ state: "unavailable", message });
      setNotice(t("app.notice.gatewayStopFailed"));
      return false;
    } finally {
      setGatewayBusy(false);
    }
  };

  const createApiKey = async (profileName?: string) => {
    const targetProfile = targetProfileName(profileName, profiles);
    setKeyBusy(true);
    setNotice(t("app.notice.apiKeyGenerating", { profile: targetProfile }));
    try {
      const result = await createGatewayApiKey(targetProfile);
      setNotice(result.message);
      if (result.ok) {
        setRuntimeStatus({
          state: "checking",
          message: t("app.notice.gatewayRestartForKey", { profile: targetProfile }),
        });
        await startGatewayForProfile(targetProfile, { replace: true });
      }
      await refreshRuntime();
      await refreshInstallStatus();
      await refreshHermesCapabilities(targetProfile);
      await refreshConfigHealth(targetProfile);
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setNotice(t("app.notice.apiKeyGenFailed", { error: message }));
      return false;
    } finally {
      setKeyBusy(false);
    }
  };

  const finishOnboarding = () => {
    try {
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, "done");
    } catch {
      // localStorage may be unavailable; the in-memory flag still closes it.
    }
    setShowOnboarding(false);
  };

  const startOnboarding = () => {
    onboardingAutoCheckedRef.current = true;
    setShowOnboarding(true);
  };

  // Auto-open the guided flow on first launch when the environment isn't ready
  // yet (no install, or no API server key/config). Runs once per session after
  // the first install probe resolves; honours a persisted "completed" flag.
  useEffect(() => {
    if (onboardingAutoCheckedRef.current) return;
    if (!isTauriRuntimeAvailable()) return;
    if (installStatus === null) return;
    onboardingAutoCheckedRef.current = true;
    let completed = false;
    try {
      completed = window.localStorage.getItem(ONBOARDING_STORAGE_KEY) === "done";
    } catch {
      completed = false;
    }
    const ready =
      installStatus.installed &&
      installStatus.apiServerKeyPresent &&
      installStatus.apiServerConfigured;
    if (!completed && !ready) {
      setShowOnboarding(true);
    }
  }, [installStatus]);

  const onboardingConnectRemote = async (
    url: string,
    key: string,
  ): Promise<RemoteConnectionStatus> => {
    const config: RemoteConnectionConfig = {
      ...remoteConfig,
      mode: "remote",
      remoteUrl: url,
      apiKey: key,
    };
    setOnboardingBusy(true);
    try {
      const status = await testRemoteConfigValue(config);
      if (status.ok) {
        await saveRemoteConfigValue(config);
        setRemoteConfig(config);
        setRemoteStatus(status);
        await refreshInstallStatus();
      }
      return status;
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onboardingConnectSsh = async (input: {
    host: string;
    port: number;
    username: string;
    keyPath: string;
    remotePort: number;
  }): Promise<RemoteConnectionStatus> => {
    const config: RemoteConnectionConfig = {
      ...remoteConfig,
      mode: "ssh",
      ssh: {
        ...remoteConfig.ssh,
        host: input.host,
        port: input.port,
        username: input.username,
        keyPath: input.keyPath,
        remotePort: input.remotePort,
      },
    };
    setOnboardingBusy(true);
    try {
      const status = await connectSshTunnel(config);
      if (status.ok) {
        await saveRemoteConfigValue(config);
        setRemoteConfig(config);
        setRemoteStatus(status);
        await refreshInstallStatus();
      }
      return status;
    } finally {
      setOnboardingBusy(false);
    }
  };

  const onboardingConfigureModel = async (input: OnboardingConfigureInput) => {
    const targetProfile =
      installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setOnboardingBusy(true);
    try {
      if (input.apiKey && input.envKey) {
        await saveProviderKey({ profile: targetProfile, envKey: input.envKey, value: input.apiKey });
      }
      await saveHermesModel({
        name: `${input.label} · ${input.model}`,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl || undefined,
        contextLength: input.contextLength,
      });
      const activated = await activateHermesModel({
        profile: targetProfile,
        provider: input.provider,
        model: input.model,
        baseUrl: input.baseUrl || undefined,
        contextLength: input.contextLength,
      });
      setActiveModel(activated);
      if (!installStatus?.apiServerKeyPresent) {
        await createGatewayApiKey(targetProfile).catch(() => undefined);
      }
      let gatewayOk = true;
      let gatewayMessage = "";
      try {
        const gateway = await startGatewayForProfile(targetProfile, { replace: true });
        gatewayOk = gateway.ok;
        gatewayMessage = gateway.message;
      } catch (error) {
        gatewayOk = false;
        gatewayMessage = runtimeErrorMessage(error);
      }
      await refreshRuntime({ autoStart: false });
      await refreshInstallStatus();
      await refreshHermesCapabilities(targetProfile);
      await refreshConfigHealth(targetProfile);
      // Don't let the wizard claim success if the Gateway never started — surface
      // the failure so SetupStep stays put and shows the error.
      if (!gatewayOk) {
        throw new Error(gatewayMessage || t("app.notice.gatewayStartRetry"));
      }
    } finally {
      setOnboardingBusy(false);
    }
  };

  const fixConfigIssue = async (issue: ConfigHealthIssue) => {
    const targetProfile = currentProfileName(configHealth?.profile) ?? "default";
    setConfigFixingCode(issue.code);
    try {
      const result = await autofixConfigIssue({
        profile: targetProfile,
        code: issue.code,
        context: issue.context ?? undefined,
      });
      setNotice(result.message);
      await refreshInstallStatus();
      await refreshHermesCapabilities(targetProfile);
      await refreshConfigHealth(targetProfile);
    } catch (error) {
      setNotice(t("app.notice.fixConfigFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setConfigFixingCode(null);
    }
  };

  const editModel = (model: SavedModel) => {
    setModelForm({
      id: model.id,
      name: model.name,
      provider: model.provider,
      model: model.model,
      baseUrl: model.baseUrl,
      contextLength: model.contextLength ? String(model.contextLength) : "",
    });
  };

  const resetModelForm = () => {
    setModelForm(emptyModelForm);
  };

  const saveModelFromForm = async () => {
    const contextLength = Number.parseInt(modelForm.contextLength.trim(), 10);
    setModelBusy(true);
    try {
      const saved = await saveHermesModel({
        id: modelForm.id,
        name: modelForm.name,
        provider: modelForm.provider,
        model: modelForm.model,
        baseUrl: modelForm.baseUrl,
        contextLength: Number.isFinite(contextLength) && contextLength > 0 ? contextLength : undefined,
      });
      setNotice(t("app.notice.modelSaved", { name: saved.name }));
      resetModelForm();
      await refreshHermesCapabilities(installStatus?.activeProfile);
      await refreshConfigHealth(installStatus?.activeProfile);
    } catch (error) {
      setNotice(t("app.notice.modelSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setModelBusy(false);
    }
  };

  const deleteModel = async (model: SavedModel) => {
    setModelBusy(true);
    try {
      const removed = await removeHermesModel(model.id);
      setNotice(
        removed
          ? t("app.notice.modelDeleted", { name: model.name })
          : t("app.notice.modelNotFound", { name: model.name }),
      );
      await refreshHermesCapabilities(installStatus?.activeProfile);
      await refreshConfigHealth(installStatus?.activeProfile);
    } catch (error) {
      setNotice(t("app.notice.modelDeleteFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setModelBusy(false);
    }
  };

  const activateModel = async (model: SavedModel) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setModelBusy(true);
    try {
      const activated = await activateHermesModel({
        profile: targetProfile,
        provider: model.provider,
        model: model.model,
        baseUrl: model.baseUrl,
        contextLength: model.contextLength,
      });
      setActiveModel(activated);
      setNotice(t("app.notice.modelActivated", { name: model.name, profile: targetProfile }));
      if (runtimeStatus.state === "ready") {
        await startGatewayForProfile(targetProfile, { replace: true });
        await refreshRuntime({ autoStart: false });
      } else {
        await refreshHermesCapabilities(targetProfile);
      }
      await refreshConfigHealth(targetProfile);
    } catch (error) {
      setNotice(t("app.notice.modelActivateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setModelBusy(false);
    }
  };

  const selectChatProfile = (profileName: string) => {
    const agent = state.agents[0];
    if (!agent) return;
    updateAgentProfile(agent.id, profileName);
    setNotice(t("app.notice.chatProfileSwitched", { profile: profileName }));
    void refreshHermesCapabilities(profileName);
    void refreshConfigHealth(profileName);
  };

  // In-chat model picker. The choice is scoped to the current conversation
  // only: it never rewrites config.yaml (the global default stays put), so
  // sessions without an override fall back to the global active model. The
  // override rides along with the session snapshot (autosaved by session id) and
  // is restored when the session is reopened. Picking the model that already
  // matches the global default clears the override instead of pinning it.
  const selectSessionModel = (model: SavedModel) => {
    const matchesGlobal =
      activeModel?.provider === model.provider && activeModel?.model === model.model;
    setState((current) => {
      const nextOverride: SessionModelOverride | undefined = matchesGlobal
        ? undefined
        : {
            provider: model.provider,
            model: model.model,
            baseUrl: model.baseUrl ?? "",
            contextLength: model.contextLength,
          };
      if (sameSessionModelOverride(current.workspace.modelOverride, nextOverride)) {
        return current;
      }
      return {
        ...current,
        workspace: { ...current.workspace, modelOverride: nextOverride },
      };
    });
    setNotice(
      matchesGlobal
        ? t("app.notice.sessionModelRestored", { name: model.name })
        : t("app.notice.sessionModelSwitched", { name: model.name }),
    );
  };

  const saveProviderKeyDraft = async (envKey: string) => {
    const value = providerKeyDrafts[envKey]?.trim() ?? "";
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setProviderBusy(true);
    try {
      const saved = await saveProviderKey({
        profile: targetProfile,
        envKey,
        value,
      });
      setProviderKeys((current) =>
        current.map((item) => (item.envKey === saved.envKey ? saved : item)),
      );
      setProviderKeyDrafts((current) => ({ ...current, [envKey]: "" }));
      setNotice(t("app.notice.providerKeySaved", { label: saved.label, profile: targetProfile }));
      if (runtimeStatus.state === "ready") {
        await startGatewayForProfile(targetProfile, { replace: true });
        await refreshRuntime({ autoStart: false });
      }
      await refreshConfigHealth(targetProfile);
    } catch (error) {
      setNotice(t("app.notice.providerKeySaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProviderBusy(false);
    }
  };

  const addPoolEntry = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setProviderBusy(true);
    try {
      const nextPool = await addCredentialPoolEntry({
        profile: targetProfile,
        provider: poolForm.provider,
        apiKey: poolForm.apiKey,
        label: poolForm.label,
      });
      setCredentialPool(nextPool);
      setPoolForm(emptyPoolForm);
      setNotice(t("app.notice.poolAdded", { profile: targetProfile }));
    } catch (error) {
      setNotice(t("app.notice.poolAddFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProviderBusy(false);
    }
  };

  const removePoolEntry = async (provider: string, id: string) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setProviderBusy(true);
    try {
      const nextPool = await removeCredentialPoolEntry({
        profile: targetProfile,
        provider,
        id,
      });
      setCredentialPool(nextPool);
      setNotice(t("app.notice.poolRemoved"));
    } catch (error) {
      setNotice(t("app.notice.poolRemoveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setProviderBusy(false);
    }
  };

  const loginOAuthProvider = async (provider: ProviderRegistryEntry) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((item) => item.active)?.name ?? "default";
    setOauthBusyProvider(provider.id);
    setProviderDiscovery(null);
    try {
      const result = await runOAuthProviderLogin({
        profile: targetProfile,
        provider: provider.id,
      });
      setNotice(result.message);
      await refreshHermesCapabilities(targetProfile);
      const discovered = await discoverProviderModels({
        profile: targetProfile,
        provider: provider.id,
      });
      setProviderDiscovery(discovered);
    } catch (error) {
      setNotice(t("app.notice.oauthLoginFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setOauthBusyProvider(null);
    }
  };

  const diagnoseProvider = async (model?: SavedModel) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const provider = model?.provider ?? activeModel?.provider ?? "";
    const baseUrl = model?.baseUrl ?? activeModel?.baseUrl ?? "";
    if (!provider) {
      setNotice(t("app.notice.noProviderToDiagnose"));
      return;
    }
    setDiscoveryBusy(true);
    try {
      const result = await discoverProviderModels({
        profile: targetProfile,
        provider,
        baseUrl,
      });
      setProviderDiscovery(result);
      setNotice(result.message);
    } catch (error) {
      setNotice(t("app.notice.providerDiagnoseFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setDiscoveryBusy(false);
    }
  };

  const useDiscoveredModel = (modelId: string, contextLength?: number) => {
    const provider = providerDiscovery?.provider ?? modelForm.provider;
    const baseUrl = providerDiscovery?.baseUrl ?? modelForm.baseUrl;
    setModelForm((current) => ({
      ...current,
      name: current.name || modelId,
      provider,
      model: modelId,
      baseUrl,
      contextLength: contextLength ? String(contextLength) : current.contextLength,
    }));
  };

  const updateAuxiliaryModelDraft = (
    task: string,
    patch: Partial<Pick<AuxiliaryModelConfig, "provider" | "model" | "baseUrl" | "contextLength">>,
  ) => {
    setAuxiliaryModels((current) =>
      current.map((item) => (item.task === task ? { ...item, ...patch } : item)),
    );
  };

  const saveAuxiliaryModel = async (item: AuxiliaryModelConfig) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setAuxiliaryBusyTask(item.task);
    try {
      const next = await saveAuxiliaryModelConfig({
        profile: targetProfile,
        task: item.task,
        provider: item.provider || "auto",
        model: item.model,
        baseUrl: item.baseUrl,
        contextLength: item.contextLength,
      });
      setAuxiliaryModels(next);
      setNotice(t("app.notice.auxModelSaved", { label: item.label, profile: targetProfile }));
      await refreshConfigHealth(targetProfile);
    } catch (error) {
      setNotice(t("app.notice.auxModelSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setAuxiliaryBusyTask(null);
    }
  };

  const resetAuxiliaryDraftToAuto = (task: string) => {
    updateAuxiliaryModelDraft(task, {
      provider: "auto",
      model: "",
      baseUrl: "",
      contextLength: undefined,
    });
  };

  const refreshRegistryLibrary = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setRegistryBusy(true);
    try {
      const next = await listRegistryModelLibrary({ profile: targetProfile });
      setRegistryLibrary(next);
      setNotice(t("app.notice.modelLibraryRefreshed"));
    } catch (error) {
      setNotice(t("app.notice.modelLibraryRefreshFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setRegistryBusy(false);
    }
  };

  const pickRegistryModel = (provider: RegistryLibraryProvider, model: RegistryLibraryModel) => {
    setModelForm((current) => ({
      ...current,
      name: current.name || model.label || model.id,
      provider: provider.provider,
      model: model.id,
      baseUrl: provider.baseUrl,
      contextLength: model.contextLength ? String(model.contextLength) : current.contextLength,
    }));
    setNotice(t("app.notice.modelFilled", { label: provider.label, model: model.id }));
  };

  const toggleToolset = async (toolset: ToolsetInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await setHermesToolsetEnabled({
        profile: targetProfile,
        key: toolset.key,
        enabled: !toolset.enabled,
      });
      setToolsets(next);
      setNotice(
        toolset.enabled
          ? t("app.notice.toolsetDisabled", { label: toolset.label })
          : t("app.notice.toolsetEnabled", { label: toolset.label }),
      );
    } catch (error) {
      setNotice(t("app.notice.toolsetUpdateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const editMcpServer = (server: McpServerInfo) => {
    setMcpForm({
      name: server.name,
      transport: server.transport === "stdio" ? "stdio" : "http",
      url: server.url ?? "",
      command: server.command ?? "",
      args: server.args.join("\n"),
      env: server.env.map((key) => `${key}=`).join("\n"),
      auth: "",
      enabled: server.enabled,
    });
  };

  const saveMcpFromForm = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await saveHermesMcpServer({
        profile: targetProfile,
        ...mcpForm,
      });
      setMcpServers(next);
      setMcpForm(emptyMcpForm);
      setNotice(t("app.notice.mcpSaved", { name: mcpForm.name }));
    } catch (error) {
      setNotice(t("app.notice.mcpSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const deleteMcpServer = async (server: McpServerInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await removeHermesMcpServer({
        profile: targetProfile,
        name: server.name,
      });
      setMcpServers(next);
      setNotice(t("app.notice.mcpDeleted", { name: server.name }));
    } catch (error) {
      setNotice(t("app.notice.mcpDeleteFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const refreshMcpCatalog = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await listHermesMcpCatalog({ profile: targetProfile });
      setMcpCatalog(next.entries);
      setMcpCatalogDiagnostics(next.diagnostics);
      setMcpCatalogError(next.error ?? "");
      setNotice(
        next.error
          ? t("app.notice.mcpCatalogRefreshFailedInline", { error: next.error })
          : t("app.notice.mcpCatalogRefreshed"),
      );
    } catch (error) {
      setNotice(t("app.notice.mcpCatalogRefreshFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const testMcpServer = async (server: McpServerInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMcpBusyServer(server.name);
    try {
      const result = await testHermesMcpServer({
        profile: targetProfile,
        name: server.name,
      });
      setMcpTestResult({ name: server.name, result });
      setNotice(
        result.success
          ? t("app.notice.mcpTestDone", { name: server.name })
          : t("app.notice.mcpTestFailedInline", { name: server.name, error: result.error ?? result.output }),
      );
    } catch (error) {
      setNotice(t("app.notice.mcpTestFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMcpBusyServer(null);
    }
  };

  const installMcpCatalogEntry = async (entry: McpCatalogEntry) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMcpCatalogBusyName(entry.name);
    try {
      const result = await installHermesMcpCatalogEntry({
        profile: targetProfile,
        name: entry.name,
      });
      setMcpTestResult({ name: entry.name, result });
      if (result.success) {
        const [nextServers, nextCatalog] = await Promise.all([
          listHermesMcpServers({ profile: targetProfile }),
          listHermesMcpCatalog({ profile: targetProfile }),
        ]);
        setMcpServers(nextServers);
        setMcpCatalog(nextCatalog.entries);
        setMcpCatalogDiagnostics(nextCatalog.diagnostics);
        setMcpCatalogError(nextCatalog.error ?? "");
        setNotice(t("app.notice.mcpInstalled", { name: entry.name }));
      } else {
        setNotice(t("app.notice.mcpInstallFailedInline", { error: result.error ?? result.output }));
      }
    } catch (error) {
      setNotice(t("app.notice.mcpInstallFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMcpCatalogBusyName(null);
    }
  };

  const activeProfileName = () =>
    installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";

  const refreshRegistry = async (announce = false) => {
    const targetProfile = activeProfileName();
    setRegistryLoading(true);
    try {
      const [catalog, workflows] = await Promise.all([
        fetchHermesRegistry(),
        listHermesInstalledWorkflows({ profile: targetProfile }),
      ]);
      setRegistryAgents(catalog.agents);
      setRegistryWorkflows(catalog.workflows);
      setRegistryError(catalog.error ?? "");
      setInstalledWorkflowIds(workflows);
      setRegistryLoaded(true);
      if (announce) {
        setNotice(catalog.error ? `注册表刷新失败：${catalog.error}` : "应用市场注册表已刷新。");
      }
    } catch (error) {
      setRegistryError(runtimeErrorMessage(error));
      if (announce) setNotice(`刷新注册表失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRegistryLoading(false);
    }
  };

  const installRegistryAgent = async (item: RegistryItem) => {
    setRegistryBusyId(`agent:${item.id}`);
    try {
      const next = await installHermesRegistryAgent({
        id: item.id,
        path: item.path ?? undefined,
        entry: item.entry ?? undefined,
      });
      setProfiles(next);
      setNotice(`智能体已安装为 Profile「${item.id}」，可在「设置 · Profiles」中切换使用。`);
    } catch (error) {
      setNotice(`安装智能体失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRegistryBusyId(null);
    }
  };

  const installRegistryWorkflow = async (item: RegistryItem) => {
    const targetProfile = activeProfileName();
    if (!item.path) {
      setNotice("该工作流缺少注册表路径，无法导入。");
      return;
    }
    setRegistryBusyId(`workflow:${item.id}`);
    try {
      const installed = await installHermesRegistryWorkflow({
        profile: targetProfile,
        id: item.id,
        path: item.path,
      });
      setInstalledWorkflowIds(installed);
      setNotice(`工作流定义已导入到当前 Profile：${item.name}`);
    } catch (error) {
      setNotice(`导入工作流失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRegistryBusyId(null);
    }
  };

  const fetchRegistryDetail = async (kind: DiscoverKind, item: RegistryItem) =>
    fetchHermesRegistryDetail({
      kind,
      path: item.path ?? undefined,
      entry: item.entry ?? undefined,
    });

  const saveMemoryDraft = async (kind: "memory" | "user") => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await writeHermesMemoryContent({
        profile: targetProfile,
        kind,
        content: kind === "memory" ? memoryDraft.memory : memoryDraft.user,
      });
      setMemoryContent(next);
      setMemoryDraft({ memory: next.memory, user: next.user });
      await refreshHermesCapabilities(targetProfile);
      setNotice(t("app.notice.fileSaved", { file: kind === "memory" ? "MEMORY.md" : "USER.md" }));
    } catch (error) {
      setNotice(t("app.notice.memorySaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const savePersonaDraft = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await writeHermesPersona({
        profile: targetProfile,
        content: personaDraft,
      });
      setPersonaContent(next);
      setPersonaDraft(next.content);
      setNotice(t("app.notice.personaSaved"));
    } catch (error) {
      setNotice(t("app.notice.personaSaveFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const addMemoryEntryFromDraft = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const result = await addHermesMemoryEntry({
        profile: targetProfile,
        content: newMemoryEntry,
      });
      if (!result.success) {
        setNotice(result.error || t("app.notice.memoryAddFailedPlain"));
        return;
      }
      setNewMemoryEntry("");
      await refreshHermesCapabilities(targetProfile);
      setNotice(t("app.notice.memoryEntryAdded"));
    } catch (error) {
      setNotice(t("app.notice.memoryAddFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const saveEditingMemoryEntry = async () => {
    if (editingMemoryIndex === null) return;
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const result = await updateHermesMemoryEntry({
        profile: targetProfile,
        index: editingMemoryIndex,
        content: editingMemoryDraft,
      });
      if (!result.success) {
        setNotice(result.error || t("app.notice.memoryUpdateFailedPlain"));
        return;
      }
      setEditingMemoryIndex(null);
      setEditingMemoryDraft("");
      await refreshHermesCapabilities(targetProfile);
      setNotice(t("app.notice.memoryEntryUpdated"));
    } catch (error) {
      setNotice(t("app.notice.memoryUpdateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const deleteMemoryEntry = async (index: number) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const result = await removeHermesMemoryEntry({
        profile: targetProfile,
        index,
      });
      if (!result.success) {
        setNotice(result.error || t("app.notice.memoryDeleteFailedPlain"));
        return;
      }
      if (editingMemoryIndex === index) {
        setEditingMemoryIndex(null);
        setEditingMemoryDraft("");
      }
      await refreshHermesCapabilities(targetProfile);
      setNotice(t("app.notice.memoryEntryDeleted"));
    } catch (error) {
      setNotice(t("app.notice.memoryDeleteFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setCapabilityBusy(false);
    }
  };

  const activateMemoryProvider = async (name: string) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMemoryProviderBusy(name);
    try {
      const next = await activateHermesMemoryProvider({ profile: targetProfile, name });
      setMemoryProviders(next);
      setNotice(t("app.notice.memoryProviderActivated", { name }));
    } catch (error) {
      setNotice(t("app.notice.memoryProviderActivateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMemoryProviderBusy(null);
    }
  };

  const deactivateMemoryProvider = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMemoryProviderBusy("__deactivate__");
    try {
      const next = await deactivateHermesMemoryProvider({ profile: targetProfile });
      setMemoryProviders(next);
      setNotice(t("app.notice.memoryProviderDeactivated"));
    } catch (error) {
      setNotice(t("app.notice.memoryProviderDeactivateFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setMemoryProviderBusy(null);
    }
  };

  const saveMemoryProviderEnv = async (envKey: string) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setMemoryProviderBusy(envKey);
    try {
      const next = await setHermesMemoryProviderEnv({
        profile: targetProfile,
        envKey,
        value: memoryProviderEnvDraft[envKey] ?? "",
      });
      setMemoryProviders(next);
      setMemoryProviderEnvDraft((current) => {
        const updated = { ...current };
        delete updated[envKey];
        return updated;
      });
      setNotice(t("app.notice.envWritten", { envKey }));
    } catch (error) {
      setNotice(t("app.notice.envSaveFailed", { envKey, error: runtimeErrorMessage(error) }));
    } finally {
      setMemoryProviderBusy(null);
    }
  };

  const searchSkills = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setSkillBusy(true);
    try {
      const next = await searchHermesSkills({
        profile: targetProfile,
        query: skillQuery,
      });
      setSkills(next);
      setNotice(
        skillQuery.trim()
          ? t("app.notice.skillsSearchDone", { count: next.length })
          : t("app.notice.skillsRefreshed", { count: next.length }),
      );
    } catch (error) {
      setNotice(t("app.notice.skillsSearchFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSkillBusy(false);
    }
  };

  const installSkillFromForm = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setSkillBusy(true);
    try {
      const next = await installHermesSkill({
        profile: targetProfile,
        sourcePath: skillInstallForm.sourcePath,
        category: skillInstallForm.category,
        name: skillInstallForm.name,
      });
      setSkills(next);
      setBundledSkills(await listHermesBundledSkills({ profile: targetProfile }));
      setSkillInstallForm(emptySkillInstallForm);
      setSkillQuery("");
      setNotice(t("app.notice.skillInstalledTo", { profile: targetProfile }));
    } catch (error) {
      setNotice(t("app.notice.skillInstallFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSkillBusy(false);
    }
  };

  const installBundledSkill = async (skill: BundledSkillInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setSkillBusy(true);
    try {
      const next = await installHermesSkill({
        profile: targetProfile,
        sourcePath: skill.path,
        category: skill.category,
        name: skill.dirName,
      });
      setSkills(next);
      setBundledSkills(await listHermesBundledSkills({ profile: targetProfile }));
      setNotice(t("app.notice.skillInstalled", { name: skill.name }));
    } catch (error) {
      setNotice(t("app.notice.bundledSkillInstallFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSkillBusy(false);
    }
  };

  const openSkillDetail = async (skill: InstalledSkillInfo | BundledSkillInfo) => {
    setSkillBusy(true);
    try {
      const content = await readHermesSkillContent(skill.path);
      setSkillDetail(skill);
      setSkillDetailContent(content);
    } catch (error) {
      setNotice(t("app.notice.skillDetailReadFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSkillBusy(false);
    }
  };

  const deleteSkill = async (skill: InstalledSkillInfo) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setSkillBusy(true);
    try {
      const next = await removeHermesSkill({
        profile: targetProfile,
        category: skill.category,
        name: skill.dirName,
      });
      setSkills(next);
      setBundledSkills(await listHermesBundledSkills({ profile: targetProfile }));
      if (skillDetail?.path === skill.path) {
        setSkillDetail(null);
        setSkillDetailContent("");
      }
      setNotice(t("app.notice.skillDeleted", { name: skill.name }));
    } catch (error) {
      setNotice(t("app.notice.skillDeleteFailed", { error: runtimeErrorMessage(error) }));
    } finally {
      setSkillBusy(false);
    }
  };

  const setMode = (nextMode: WorkspaceMode) => {
    setModeState(nextMode);
    setState((current) => ({
      ...current,
      workspace: {
        ...current.workspace,
        mode: nextMode,
      },
    }));
  };

  const addDraftAttachment = (pathOverride?: string) => {
    const path = pathOverride?.trim();
    if (!path) return;
    const name = path.split(/[\\/]/).filter(Boolean).at(-1) ?? path;
    setDraftAttachments((current) => {
      if (current.some((attachment) => attachment.path === path)) return current;
      return [
        ...current,
        {
          id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          path,
          name,
          kind: "path-ref",
          createdAt: Date.now(),
        },
      ];
    });
  };

  const pickDraftAttachments = async () => {
    try {
      const selected = await selectAttachmentFiles();
      if (selected.length === 0) return;
      setDraftAttachments((current) => {
        const existing = new Set(current.map((attachment) => attachment.path));
        const next = [...current];
        for (const item of selected) {
          if (!item.isFile || existing.has(item.path)) continue;
          next.push({
            id: `att-${Date.now()}-${Math.random().toString(16).slice(2)}`,
            path: item.path,
            name: item.name,
            kind: "path-ref",
            size: item.sizeBytes,
            createdAt: Date.now(),
          });
          existing.add(item.path);
        }
        return next;
      });
      setNotice(t("app.notice.attachmentsAdded", { count: selected.filter((item) => item.isFile).length }));
    } catch (error) {
      setNotice(t("app.notice.pickAttachmentFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const removeDraftAttachment = (id: string) => {
    setDraftAttachments((current) => current.filter((attachment) => attachment.id !== id));
  };

  const attachDroppedOrPastedFiles = async (files: File[]) => {
    if (files.length === 0) return;
    try {
      const result = await processDroppedOrPastedFiles({
        files,
        existingCount: draftAttachments.length,
        sessionId: state.workspace.id,
        t,
      });
      if (result.attachments.length > 0) {
        setDraftAttachments((current) => {
          const existing = new Set(current.map((attachment) => attachment.path || attachment.name));
          const next = [...current];
          for (const attachment of result.attachments) {
            const key = attachment.path || `${attachment.kind}:${attachment.name}:${attachment.size ?? 0}`;
            if (existing.has(key)) continue;
            next.push(attachment);
            existing.add(key);
          }
          return next;
        });
      }
      const detail = [
        result.attachments.length > 0
          ? t("app.notice.attachmentsAdded", { count: result.attachments.length })
          : "",
        ...result.errors,
      ].filter(Boolean);
      if (detail.length > 0) setNotice(detail.join(" "));
    } catch (error) {
      setNotice(t("app.notice.processAttachmentFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const setChatContextFolder = (path: string | null) => {
    const agent = state.agents[0];
    if (!agent) return;
    setState((current) => ({
      ...current,
      bindings: current.bindings.map((binding) =>
        binding.agentId === agent.id
          ? { ...binding, workDir: path?.trim() || undefined }
          : binding,
      ),
    }));
    setNotice(path ? t("app.notice.contextFolderSet", { path }) : t("app.notice.contextFolderCleared"));
    if (!path) setWorktreeVisible(false);
  };

  const pickChatContextFolder = async () => {
    try {
      const selected = await selectContextFolder();
      if (!selected) return;
      setChatContextFolder(selected.path);
    } catch (error) {
      setNotice(t("app.notice.pickContextFolderFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const cancelTask = async (taskId: string) => {
    cancelledTaskIdsRef.current.add(taskId);
    try {
      if (isTauriRuntimeAvailable()) {
        await cancelHermesTask(taskId);
      }
    } catch {
      // UI cancellation still protects state from accepting a late response.
    }
    setState((current) =>
      cancelTaskWithSystemMessage({
        state: current,
        taskId,
        reason: t("app.notice.userAborted"),
      }),
    );
    addRuntimeEvent({
      taskId,
      label: "aborted",
      detail: t("app.notice.userAbortedDetail"),
      level: "warning",
    });
    setNotice(t("app.notice.taskCancelled"));
  };

  const settleCompletedTask = (taskId: string) => {
    let nextTaskId: string | null = null;
    let nextStateForRun: OrchestrationState | null = null;
    let nextNotice: string | null = null;
    setState((current) => {
      const task = current.tasks.find((item) => item.id === taskId);
      if (!task) return current;
      const agent = current.agents.find((item) => item.id === task.agentId);

      const serialAdvance = serialTrackerRef.current.advance(task.workspaceId, task.agentId, task.id);
      if (serialAdvance.kind === "next") {
        const appended = appendTask({
          state: current,
          workspaceId: task.workspaceId,
          agentId: serialAdvance.agentId,
          triggerMessageId: serialAdvance.triggerMessageId,
          instruction: serialAdvance.instruction,
        });
        serialTrackerRef.current.bindTask(task.workspaceId, serialAdvance.agentId, appended.taskId);
        nextTaskId = appended.taskId;
        nextStateForRun = appended.state;
        nextNotice = t("app.notice.serialAdvanced");
        return appended.state;
      }
      if (serialAdvance.kind === "last") {
        nextNotice = t("app.notice.serialDone");
        return appendSystemMessage({
          state: current,
          content: t("app.notice.serialDoneContent"),
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (serialAdvance.kind === "last_user_intervened") {
        nextNotice = t("app.notice.serialClosedIntervened");
        return appendSystemMessage({
          state: current,
          content: t("app.notice.serialClosedIntervenedContent"),
          replyToMessageId: task.triggerMessageId,
        });
      }

      const batchResult = parallelTrackerRef.current.markComplete(task.workspaceId, task.agentId);
      if (batchResult === "last") {
        nextNotice = t("app.notice.parallelMerged");
        return appendSystemMessage({
          state: current,
          content: t("app.notice.parallelMergedContent"),
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (batchResult === "last_user_intervened") {
        nextNotice = t("app.notice.parallelClosedIntervened");
        return appendSystemMessage({
          state: current,
          content: t("app.notice.parallelClosedIntervenedContent"),
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (batchResult === "pending") {
        nextNotice = t("app.notice.agentDonePending", { name: agent?.name ?? "Agent" });
      }
      return current;
    });
    if (nextNotice) setNotice(nextNotice);
    if (nextTaskId && nextStateForRun) {
      window.setTimeout(() => {
        void runDispatchedTask(nextStateForRun!, nextTaskId!);
      }, 0);
    }
  };

  const clearChat = () => {
    if (hasActiveSessionTasks(state)) {
      setNotice(t("app.notice.activeTasksClear"));
      return;
    }
    setState((current) => ({
      ...current,
      messages: [],
      tasks: [],
      logs: [],
      workspace: { ...current.workspace, modelOverride: undefined },
    }));
    setDraft("");
    setDraftAttachments([]);
      setRuntimeEvents([]);
      setNotice(t("app.notice.sessionCleared"));
  };

  const runLocalSlashCommand = (content: string) => {
    const workspaceId = state.workspace.id;
    const agent = state.agents[0];
    const now = Date.now();
    const userMessage: Message = {
      id: `local-user-${now}`,
      workspaceId,
      authorKind: "user",
      authorName: "You",
      content,
      createdAt: now,
    };
    setState((current) => ({ ...current, messages: [...current.messages, userMessage] }));
    setDraft("");
    setDraftAttachments([]);
    const appendReply = (replyContent: string) => {
      const replyMessage: Message = {
        id: `local-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        workspaceId,
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: replyContent,
        createdAt: Date.now(),
        replyToMessageId: userMessage.id,
      };
      setState((current) => ({ ...current, messages: [...current.messages, replyMessage] }));
    };
    void runLocalReplyCommand(content, {
      profile: installStatus?.activeProfile,
      tokenUsage,
      sessionModelOverride: state.workspace.modelOverride ?? null,
      commands: SLASH_COMMANDS,
      t,
    })
      .then((reply) => appendReply(reply ?? t("app.notice.commandNoOutput")))
      .catch((error) => appendReply(t("app.notice.commandFailed", { error: runtimeErrorMessage(error) })));
  };

  const runFastModeCommand = (content: string) => {
    const workspaceId = state.workspace.id;
    const agent = state.agents[0];
    const now = Date.now();
    const userMessage: Message = {
      id: `local-user-${now}`,
      workspaceId,
      authorKind: "user",
      authorName: "You",
      content,
      createdAt: now,
    };
    setState((current) => ({ ...current, messages: [...current.messages, userMessage] }));
    setDraft("");
    setDraftAttachments([]);
    const next = !fastMode;
    const appendReply = (replyContent: string) => {
      const replyMessage: Message = {
        id: `local-agent-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        workspaceId,
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: replyContent,
        createdAt: Date.now(),
        replyToMessageId: userMessage.id,
      };
      setState((current) => ({ ...current, messages: [...current.messages, replyMessage] }));
    };
    void setFastMode(next)
      .then(() =>
        appendReply(next ? t("app.notice.fastModeOnReply") : t("app.notice.fastModeOffReply")),
      )
      .catch((error) => appendReply(t("app.notice.fastModeToggleFailed", { error: runtimeErrorMessage(error) })));
  };

  const launchParallelChatRunWindows = async (plans: ParallelChatRunSessionPlan[]) => {
    if (plans.length === 0) return;
    if (!isTauriRuntimeAvailable()) {
      setNotice(t("app.notice.parallelChatRunsUnavailable"));
      return;
    }
    try {
      let nextSessions = sessionsRef.current;
      for (const plan of plans) {
        nextSessions = await saveSessionSnapshot(plan.state, nextSessions);
        sessionsRef.current = nextSessions;
        setSessions(nextSessions);
        await openChatRunWindow(
          buildChatRunWindowRequest({
            chatRunId: plan.taskId,
            profile: plan.profile,
            sessionId: plan.sessionId,
            parentSessionId: plan.parentSessionId,
            source: plan.source,
            label: plan.label,
          }),
        );
      }
      setNotice(t("app.notice.parallelChatRunsOpened", { count: plans.length }));
    } catch (error) {
      setNotice(t("app.notice.parallelChatRunsOpenFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const detachAndLaunchParallelChatRuns = (
    nextState: OrchestrationState,
    taskIds: string[],
  ): OrchestrationState | null => {
    const plans = planParallelChatRunSessions(nextState, taskIds);
    if (plans.length === 0) return null;
    const mainState = detachParallelChatRunTasks(
      nextState,
      plans.map((plan) => plan.taskId),
      t("app.notice.parallelChatRunsOpenedContent", { count: plans.length }),
    );
    void launchParallelChatRunWindows(plans);
    return mainState;
  };

  const handleChatRunWindowClosed = async (event: ChatRunWindowClosedEvent) => {
    if (chatRunContext.kind !== "main") return;
    const dedupKey = chatRunClosedDedupKey(event);
    if (closedChatRunWindowKeysRef.current.has(dedupKey)) return;
    closedChatRunWindowKeysRef.current.add(dedupKey);

    try {
      const items = await loadLocalSessionList();
      sessionsRef.current = items;
      setSessions(items);

      const lookupId = chatRunClosedSessionLookupId(event);
      const session = lookupId ? sessionForChatRun(items, { initialSessionId: lookupId }) : null;
      const summary = summarizeChatRunSession(session);
      const title = session?.title ?? event.title ?? event.windowLabel;
      const sessionId = session?.id ?? lookupId ?? event.windowLabel;
      const content = t("app.notice.parallelChatRunClosedContent", {
        title,
        sessionId,
        completed: summary.completed,
        failed: summary.failed,
        cancelled: summary.cancelled,
        unfinished: summary.unfinished,
        total: summary.total,
      });

      if (isChatRunClosedForWorkspace(event, stateRef.current.workspace.id)) {
        setState((current) =>
          isChatRunClosedForWorkspace(event, current.workspace.id)
            ? appendSystemMessage({ state: current, content })
            : current,
        );
      }
      setNotice(t("app.notice.parallelChatRunClosed", { title }));
    } catch (error) {
      setNotice(t("app.notice.parallelChatRunClosedRefreshFailed", { error: runtimeErrorMessage(error) }));
    }
  };

  const mergeChatRunBatchToChat = (content: string) => {
    setState((current) => appendSystemMessage({ state: current, content }));
    setNotice(t("app.notice.parallelChatRunMergedToChat"));
  };

  useEffect(() => {
    if (chatRunContext.kind !== "main") return undefined;
    if (!isTauriRuntimeAvailable()) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenChatRunWindowClosed((event) => {
      if (!disposed) void handleChatRunWindowClosed(event);
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch(() => undefined);
    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [chatRunContext.kind]);

  useEffect(() => {
    if (activeView !== "multiagent" || chatRunContext.kind !== "main") return undefined;
    if (!isTauriRuntimeAvailable()) return undefined;
    let disposed = false;
    const refreshChatRunSessions = () => {
      void loadLocalSessionList()
        .then((items) => {
          if (disposed) return;
          sessionsRef.current = items;
          setSessions(items);
        })
        .catch(() => undefined);
    };
    refreshChatRunSessions();
    const interval = window.setInterval(refreshChatRunSessions, 4000);
    return () => {
      disposed = true;
      window.clearInterval(interval);
    };
  }, [activeView, chatRunContext.kind]);

  const taskWorkMode = normalizeWorkMode(state.workspace.workMode);

  const setTaskWorkMode = (mode: WorkMode) => {
    setState((current) => ({
      ...current,
      workspace: { ...current.workspace, workMode: mode },
    }));
  };

  const dispatchPlannedMessage = (
    plan: Extract<SendMessagePlan, { kind: "dispatch" }>,
    baseState = stateRef.current,
  ) => {
    parallelTrackerRef.current.markUserIntervention(baseState.workspace.id);
    serialTrackerRef.current.markUserIntervention(baseState.workspace.id);
    const result = handleUserMessage(baseState, plan.content, plan.attachments);
    const latestDecision = result.state.logs[0]?.decision;
    if (latestDecision?.type === "dispatch" && latestDecision.mode === "parallel") {
      const mainState = detachAndLaunchParallelChatRuns(result.state, result.createdTaskIds);
      setState(mainState ?? result.state);
      setNotice(
        mainState
          ? t("app.notice.parallelChatRunsOpening", { count: result.createdTaskIds.length })
          : plan.background
            ? t("app.notice.backgroundStarted")
            : result.notice,
      );
      setDraft("");
      setDraftAttachments([]);
      return;
    }
    setState(result.state);
    setNotice(plan.background ? t("app.notice.backgroundStarted") : result.notice);
    setDraft("");
    setDraftAttachments([]);
    if (latestDecision?.type === "dispatch" && latestDecision.mode === "serial" && result.createdTaskIds[0]) {
      serialTrackerRef.current.start({
        workspaceId: result.state.workspace.id,
        triggerMessageId:
          result.state.tasks.find((task) => task.id === result.createdTaskIds[0])?.triggerMessageId ??
          result.state.messages.at(-1)?.id ??
          "",
        firstTaskId: result.createdTaskIds[0],
        assignments: latestDecision.assignments,
      });
    }
    scheduleDispatchedTasks(result.state, result.createdTaskIds);
  };

  const sendMessage = (contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim();
    const plan = planSendMessage({
      draft,
      draftAttachments,
      contentOverride,
      hasActiveTasks: hasActiveSessionTasks(state),
      attachmentFallbackText: t("app.notice.checkAttachments"),
    });
    if (plan.kind === "empty") return;
    if (plan.kind === "browse") {
      setWebPreviewUrl(plan.url);
      setDraft("");
      setDraftAttachments([]);
      setNotice(t("app.notice.webPreviewOpened", { url: plan.url }));
      return;
    }
    if (plan.kind === "new-session") {
      setDraft("");
      setDraftAttachments([]);
      void createNewSession();
      return;
    }
    if (plan.kind === "clear-session") {
      setDraft("");
      setDraftAttachments([]);
      clearChat();
      return;
    }
    if (plan.kind === "fast-mode") {
      runFastModeCommand(content);
      return;
    }
    if (plan.kind === "local-reply") {
      runLocalSlashCommand(content);
      return;
    }
    if (plan.kind === "queue") {
      setQueuedMessages((current) => [
        ...current,
        {
          id: `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: plan.text,
          attachments: plan.attachments,
        },
      ]);
      setDraft("");
      setDraftAttachments([]);
      setNotice(t("app.notice.messageQueued"));
      return;
    }
    const currentState = stateRef.current;
    const workMode = normalizeWorkMode(currentState.workspace.workMode);
    if (
      workMode === "craft" &&
      !currentState.workspace.destructiveApproved &&
      looksDestructiveInstruction(plan.content)
    ) {
      setDestructivePrompt({
        content: plan.content,
        attachments: plan.attachments,
        background: plan.background,
      });
      setDraft("");
      setDraftAttachments([]);
      return;
    }
    dispatchPlannedMessage(plan);
  };

  const confirmDestructiveSend = (rememberForTask: boolean) => {
    if (!destructivePrompt) return;
    const prompt = destructivePrompt;
    setDestructivePrompt(null);
    let baseState = stateRef.current;
    if (rememberForTask) {
      baseState = {
        ...baseState,
        workspace: { ...baseState.workspace, destructiveApproved: true },
      };
      setState(baseState);
    }
    dispatchPlannedMessage(
      {
        kind: "dispatch",
        content: prompt.content,
        attachments: prompt.attachments,
        background: prompt.background,
      },
      baseState,
    );
  };

  const regenerateFromMessage = (messageId: string) => {
    if (hasActiveSessionTasks(state)) {
      setNotice(t("app.notice.activeTasksRegenerate"));
      return;
    }
    const index = state.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const previousUser = [...state.messages.slice(0, index)]
      .reverse()
      .find((message) => message.authorKind === "user");
    if (!previousUser) {
      setNotice(t("app.notice.noUserMessageToRegenerate"));
      return;
    }
    setDraftAttachments([]);
    sendMessage(previousUser.content);
  };

  const branchFromMessage = (messageId: string) => {
    if (hasActiveSessionTasks(state)) {
      setNotice(t("app.notice.activeTasksBranch"));
      return;
    }
    const index = state.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const baseTime = Date.now();
    const nextWorkspaceId = `workspace-${baseTime}`;
    const branchedMessages = state.messages.slice(0, index + 1).map((message) => ({
      ...message,
      workspaceId: nextWorkspaceId,
    }));
    const nextState: OrchestrationState = {
      ...state,
      workspace: {
        ...state.workspace,
        id: nextWorkspaceId,
        name: `${state.workspace.name} branch`,
      },
      agents: state.agents.map((agent) => ({ ...agent, workspaceId: nextWorkspaceId })),
      messages: branchedMessages,
      tasks: [],
      logs: [],
      artifacts: [],
    };
    parallelTrackerRef.current.clear(state.workspace.id);
    serialTrackerRef.current.clear(state.workspace.id);
    cancelledTaskIdsRef.current.clear();
    setState(nextState);
    setDraft("");
    setDraftAttachments([]);
    setRuntimeEvents([]);
    setActiveView("team");
    setNotice(t("app.notice.branched"));
    if (isTauriRuntimeAvailable()) {
      if (shouldPersistGlobalState(chatRunContext)) {
        void saveWorkspaceState(nextState).catch(() => undefined);
      }
      if (shouldSaveSessionSnapshot(chatRunContext)) {
        void saveSessionSnapshot(nextState)
          .then((items) => setSessions(items))
          .catch(() => undefined);
      }
    }
  };

  const removeQueuedMessage = (id: string) => {
    setQueuedMessages((current) => current.filter((item) => item.id !== id));
  };

  // Answer an inline Clarify card. The `/v1/runs` transport has no clarify
  // resolve endpoint, so the answer is delivered as the next message (the
  // gateway's text-fallback contract). An empty answer means "let Hermes
  // decide"; we send a short instruction so the agent proceeds with its best
  // judgment instead of waiting. The card is flipped to a resolved, read-only
  // state so it can't be answered twice.
  const answerClarify = (messageId: string, answer: string) => {
    const trimmed = answer.trim();
    let alreadyResolved = false;
    setState((current) => {
      const target = current.messages.find((message) => message.id === messageId);
      if (!target || target.clarifyResolved) {
        alreadyResolved = true;
        return current;
      }
      return {
        ...current,
        messages: current.messages.map((message) =>
          message.id === messageId
            ? { ...message, clarifyResolved: true, clarifyAnswer: trimmed }
            : message,
        ),
      };
    });
    if (alreadyResolved) return;
    sendMessage(trimmed || t("app.notice.clarifyDefault"));
  };

  const scheduleDispatchedTasks = (nextState: OrchestrationState, taskIds: string[]) => {
    window.setTimeout(() => {
      for (const taskId of taskIds) {
        void runDispatchedTask(nextState, taskId);
      }
    }, 0);
  };

  const runDispatchedTask = async (baseState: OrchestrationState, taskId: string) => {
    const runtimeContext = resolveTaskRuntimeContext(baseState, taskId, profiles);
    if (runtimeContext.kind !== "ready") return;
    const { task, agent, profileName, selectedProfile } = runtimeContext;

    setState((current) => markTaskRunning(current, taskId));
    setNotice(t("app.notice.taskRunning", { name: agent.name }));
    addRuntimeEvent({
      taskId,
      label: "running",
      detail: t("app.notice.taskRunningDetail", { name: agent.name }),
      level: "info",
    });

    try {
      if (profiles.length > 0 && !selectedProfile) {
        throw new Error(t("app.notice.profileNotFound", { profile: profileName }));
      }
      if (selectedProfile && !selectedProfile.hasApiKey) {
        const created = await createApiKey(profileName);
        if (!created) {
          throw new Error(t("app.notice.profileNoApiKey", { profile: profileName }));
        }
      }
      if (runtimeStatus.state !== "ready") {
        setNotice(t("app.notice.waitingGateway", { name: agent.name }));
        const ready = await startGateway(profileName);
        if (!ready) {
          throw new Error(t("app.notice.gatewayNotReady"));
        }
      }
      const output = await executeTaskRuntimeStream(runtimeContext, baseState.messages, {
        workMode: normalizeWorkMode(baseState.workspace.workMode),
        allowDestructive: baseState.workspace.destructiveApproved === true,
      });
      if (cancelledTaskIdsRef.current.has(taskId)) {
        addRuntimeEvent({
          taskId,
          label: "ignored",
          detail: t("app.notice.lateResponseIgnored", { name: agent.name }),
          level: "warning",
        });
        return;
      }
      const workDir =
        runtimeContext.effectiveBinding?.workDir?.trim() ||
        runtimeContext.binding?.workDir?.trim() ||
        null;
      setState((current) => {
        const next = applyTaskStreamOutput(
          current,
          taskId,
          output,
          { generating: t("app.generating") },
          Date.now(),
          workDir,
        );
        queueArtifactStatRefresh(next, output.events ?? [], workDir);
        return next;
      });
      addRuntimeEvent({
        taskId,
        label: "completed",
        detail: t("app.notice.streamCompletedDetail", { name: agent.name }),
        level: "ok",
      });
      setNotice(t("app.notice.taskReturned", { name: agent.name }));
      settleCompletedTask(taskId);
    } catch (error) {
      const message = runtimeErrorMessage(error);
      if (cancelledTaskIdsRef.current.has(taskId) || message.includes("任务已取消")) {
        setState((current) =>
          current.tasks.some((item) => item.id === taskId && item.status === "cancelled")
            ? current
            : cancelTaskWithSystemMessage({
                state: current,
                taskId,
                reason: t("app.notice.userAborted"),
              }),
        );
        addRuntimeEvent({
          taskId,
          label: "aborted",
          detail: t("app.notice.runRequestCancelled", { name: agent.name }),
          level: "warning",
        });
        return;
      }
      setState((current) =>
        current.tasks.some((item) => item.id === taskId && item.status === "failed")
          ? current
          : failTaskWithSystemMessage({
              state: current,
              taskId,
              error: message,
            }),
      );
      addRuntimeEvent({
        taskId,
        label: "failed",
        detail: message,
        level: "warning",
      });
      setNotice(t("app.notice.runtimeCallFailed"));
    }
  };

  useEffect(() => {
    if (chatRunContext.kind !== "child" || !stateReady) return;
    if (!isTauriRuntimeAvailable()) return;
    const pendingTasks = state.tasks.filter((task) => task.status === "pending");
    for (const task of pendingTasks) {
      if (childAutoRunTaskIdsRef.current.has(task.id)) continue;
      childAutoRunTaskIdsRef.current.add(task.id);
      window.setTimeout(() => {
        void runDispatchedTask(state, task.id);
      }, 0);
    }
  }, [chatRunContext.kind, state, stateReady]);

  useEffect(() => {
    if (queuedMessages.length === 0 || hasActiveSessionTasks(state)) return;
    const [next] = queuedMessages;
    if (!next) return;
    setQueuedMessages((current) => current.slice(1));
    const result = handleUserMessage(state, next.text, next.attachments);
    const latestDecision = result.state.logs[0]?.decision;
    if (latestDecision?.type === "dispatch" && latestDecision.mode === "parallel") {
      const mainState = detachAndLaunchParallelChatRuns(result.state, result.createdTaskIds);
      setState(mainState ?? result.state);
      setNotice(
        mainState
          ? t("app.notice.parallelChatRunsOpening", { count: result.createdTaskIds.length })
          : t("app.notice.sendingNextQueued"),
      );
      return;
    }
    setState(result.state);
    setNotice(t("app.notice.sendingNextQueued"));
    scheduleDispatchedTasks(result.state, result.createdTaskIds);
  }, [queuedMessages, state]);

  // Auto-refresh the Schedules list while its panel is open so next-run times and
  // last-run status stay close to real-time without a manual refresh. Polling is
  // silent (no busy spinner / notice) and pauses while a run-history modal is open
  // to avoid churning the underlying list out from under the viewer.
  useEffect(() => {
    if (activeView !== "settings" || activeSettingsPanel !== "schedules") return;
    if (!isTauriRuntimeAvailable()) return;
    const interval = window.setInterval(() => {
      if (cronRunsJob) return;
      void refreshCronJobs(undefined, { silent: true });
    }, 15000);
    return () => window.clearInterval(interval);
  }, [activeView, activeSettingsPanel, cronRunsJob]);

  // Lazily fetch the community registry the first time the Discover screen is
  // opened, so the agents/workflows catalog populates without a manual refresh.
  useEffect(() => {
    if (activeView !== "discover" || registryLoaded || registryLoading) return;
    if (!isTauriRuntimeAvailable()) return;
    void refreshRegistry();
  }, [activeView, registryLoaded, registryLoading]);

  // Close the per-card overflow menu on any outside click.
  useEffect(() => {
    if (!cronMenuJobId) return;
    const handleClick = () => setCronMenuJobId(null);
    window.addEventListener("click", handleClick);
    return () => window.removeEventListener("click", handleClick);
  }, [cronMenuJobId]);

  // Escape closes the run-history modal.
  useEffect(() => {
    if (!cronRunsJob) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeCronRuns();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [cronRunsJob]);

  const lastAgentMessage = [...messages].reverse().find((message) => message.authorKind === "agent");
  const handoff = lastAgentMessage
    ? classifyAssistantHandoff({
        mentionNames: parseMentions(lastAgentMessage.content, agentNames).map((mention) => mention.name),
        selfAgentId: lastAgentMessage.authorId,
        agentIdByName,
      })
    : { kind: "none" as const, targetNames: [] };
  const scratchSession = isScratchSession(state);
  const showInspector = false;
  const showArtifactPanel = activeView === "team";
  const chatTitle = scratchSession ? t("chat.newChatTitle") : "Hermes Chat";
  const chatDescription = scratchSession
    ? t("chat.newChatDescription")
    : seedWorkspace.description;
  const activeTask = state.tasks.find((task) => task.status === "running" || task.status === "pending");
  const chatAgent = state.agents[0];
  const chatBinding = chatAgent
    ? state.bindings.find((binding) => binding.agentId === chatAgent.id)
    : undefined;
  const currentChatProfile = chatBinding?.hermesProfile ?? "default";
  // The model the current conversation actually resolves to: session override
  // first, then the global active model. Drives the in-chat picker label/check,
  // the context gauge window, and the readiness prompt so the UI reflects what a
  // send will route to.
  const sessionModelOverride = state.workspace.modelOverride ?? null;
  const effectiveModel: ActiveModelConfig | null = sessionModelOverride
    ? {
        provider: sessionModelOverride.provider,
        model: sessionModelOverride.model,
        baseUrl: sessionModelOverride.baseUrl,
        contextLength: sessionModelOverride.contextLength,
      }
    : activeModel;
  const { reasoningEffort, setReasoningEffort } = useReasoningEffort(currentChatProfile);
  const selectReasoningEffort = async (value: typeof reasoningEffort) => {
    await setReasoningEffort(value);
    setNotice(t("app.notice.reasoningSaved", { profile: currentChatProfile, value }));
  };
  const { fastMode, setFastMode } = useFastMode(currentChatProfile);
  const toggleFastMode = async () => {
    const next = !fastMode;
    try {
      await setFastMode(next);
      setNotice(
        next
          ? t("app.notice.fastModeOnProfile", { profile: currentChatProfile })
          : t("app.notice.fastModeOffProfile", { profile: currentChatProfile }),
      );
    } catch (error) {
      setNotice(t("app.notice.fastModeToggleFailed", { error: runtimeErrorMessage(error) }));
    }
  };
  const activeRuntimeEvent = activeTask
    ? runtimeEvents.find((event) => event.taskId === activeTask.id)
    : undefined;

  return (
    <main
      className={`app-shell ${
        activeView !== "team" || (!showInspector && !showArtifactPanel) ? "app-shell-utility" : ""
      } ${showArtifactPanel ? "app-shell-artifacts" : ""} ${
        sidebarCollapsed ? "app-shell-collapsed" : ""
      }`.trim()}
    >
      <aside className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}>
        <div className="brand">
          <div className="brand-mark">HT</div>
          <div className="brand-text">
            <strong>Hermes Team</strong>
            <span>{t("nav.brandSubtitle")}</span>
          </div>
          <button
            className="sidebar-collapse-btn"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
            aria-label={sidebarCollapsed ? t("nav.expandSidebar") : t("nav.collapseSidebar")}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
        </div>

        <nav className="workspace-list" aria-label={t("nav.mainNav")}>
          <button
            className={`workspace-item workspace-new-chat ${
              activeView === "team" && scratchSession ? "active" : ""
            }`}
            type="button"
            onClick={() => void createNewSession()}
            title={t("nav.newChat")}
            aria-label={t("nav.newChat")}
          >
            <Plus size={18} />
            <span>{t("nav.newChat")}</span>
          </button>

          <div className="nav-group">
            <p className="nav-group-label">{t("nav.groupWorkspace")}</p>
            <button
              className={`workspace-item ${
                activeView === "team" && !scratchSession ? "active" : ""
              }`}
              type="button"
              onClick={() => setActiveView("team")}
              title={t("nav.tasks")}
              aria-label={t("nav.tasks")}
            >
              <MessageSquareText size={18} />
              <span>{t("nav.tasks")}</span>
            </button>
            <button
              className={`workspace-item ${activeView === "discover" ? "active" : ""}`}
              type="button"
              onClick={() => {
                setActiveView("discover");
                void refreshInstallStatus();
                void refreshHermesCapabilities();
              }}
              title={t("nav.discover")}
              aria-label={t("nav.discover")}
            >
              <Compass size={18} />
              <span>{t("nav.discover")}</span>
            </button>
          </div>

          {(() => {
            const labsViewActive =
              activeView === "kanban" ||
              activeView === "multiagent" ||
              activeView === "office";
            const showLabsItems = labsExpanded || labsViewActive || sidebarCollapsed;
            return (
              <div className="nav-group nav-group-labs">
                {!sidebarCollapsed && (
                  <button
                    type="button"
                    className="nav-group-toggle"
                    onClick={() => setLabsExpanded((v) => !v)}
                    aria-expanded={showLabsItems}
                  >
                    <FlaskConical size={13} />
                    <span>{t("nav.groupObservation")}</span>
                    <ChevronDown
                      size={14}
                      className={`nav-group-chevron ${showLabsItems ? "open" : ""}`}
                    />
                  </button>
                )}
                {showLabsItems && (
                  <>
                    <button
                      className={`workspace-item ${activeView === "kanban" ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveView("kanban")}
                      title={t("nav.kanban")}
                      aria-label={t("nav.kanban")}
                    >
                      <LayoutGrid size={18} />
                      <span>{t("nav.kanban")}</span>
                    </button>
                    <button
                      className={`workspace-item ${activeView === "multiagent" ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveView("multiagent")}
                      title={t("nav.multiAgent")}
                      aria-label={t("nav.multiAgent")}
                    >
                      <Users size={18} />
                      <span>{t("nav.multiAgent")}</span>
                    </button>
                    <button
                      className={`workspace-item ${activeView === "office" ? "active" : ""}`}
                      type="button"
                      onClick={() => setActiveView("office")}
                      title={t("nav.office")}
                      aria-label={t("nav.office")}
                    >
                      <Building2 size={18} />
                      <span>{t("nav.office")}</span>
                    </button>
                  </>
                )}
              </div>
            );
          })()}

          <div className="nav-group">
            <p className="nav-group-label">{t("nav.groupSystem")}</p>
            <button
              className={`workspace-item ${
                activeView === "settings" && activeSettingsPanel !== "schedules" ? "active" : ""
              }`}
              type="button"
              onClick={() => {
                setActiveView("settings");
                setActiveSettingsPanel((current) => (current === "schedules" ? "overview" : current));
                void refreshInstallStatus();
                void refreshHermesCapabilities();
                void refreshMessagingPlatforms();
                void refreshCronJobs();
                void refreshCronScripts();
                void refreshHermesLogs();
              }}
              title={t("nav.settings")}
              aria-label={t("nav.settings")}
            >
              <Settings size={18} />
              <span>{t("nav.settings")}</span>
            </button>
          </div>
        </nav>

        {!sidebarCollapsed && (
          <SidebarRecentSessions
            sessions={sessions}
            formatTime={formatTime}
            onRestore={(session) => void restoreSession(session)}
            onShowAll={() => setActiveView("sessions")}
            onTogglePin={(sessionId) => void togglePinSession(sessionId)}
            onMoveToFolder={(sessionId, folder) => void moveSessionToFolder(sessionId, folder)}
            onPickFolder={(sessionId) => void pickFolderForSession(sessionId)}
          />
        )}

      </aside>

      <section className={`timeline ${activeView !== "team" ? "utility-view" : ""}`}>
        {activeView === "settings" ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="panel-label">Settings</p>
                <h1>{t("settings.header.envTitle")}</h1>
                <p>{t("settings.header.envSubtitle")}</p>
              </div>
              <div className="status-card">
                <TerminalSquare size={18} />
                <span>{installStatus?.installed ? t("settings.header.cliFound") : t("settings.header.waitingInstall")}</span>
              </div>
            </header>

            <div className="settings-content">
              <nav className="settings-section-tabs" aria-label={t("settings.sectionsLabel")}>
                {settingsPanels.map((panel) => (
                  <button
                    className={activeSettingsPanel === panel.id ? "selected" : ""}
                    key={panel.id}
                    type="button"
                    onClick={() => setActiveSettingsPanel(panel.id)}
                  >
                    {panel.label}
                  </button>
                ))}
              </nav>

              <section className={settingsCardClass("overview")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Install</p>
                    <h2>{t("settings.overview.installTitle")}</h2>
                  </div>
                  <div className="settings-card-head-actions">
                    <button className="refresh-runtime" type="button" onClick={startOnboarding}>
                      <WandSparkles size={14} />
                      <span>{t("settings.overview.guidedInstall")}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      disabled={installBusy}
                      type="button"
                      onClick={() => void refreshInstallStatus()}
                    >
                      <RefreshCw size={14} />
                      <span>{installBusy ? t("settings.overview.detecting") : t("settings.overview.recheck")}</span>
                    </button>
                  </div>
                </div>
                {installStatus ? (
                  <div className="settings-rows">
                    <StatusRow label="Hermes CLI" value={installStatus.command ?? t("settings.shared.notFound")} ok={installStatus.installed} />
                    <StatusRow label={t("settings.overview.versionLabel")} value={installStatus.version ?? t("settings.overview.notReturned")} ok={Boolean(installStatus.version)} />
                    <StatusRow label="Hermes Home" value={installStatus.hermesHome} ok />
                    <StatusRow label={t("settings.overview.currentProfile")} value={installStatus.activeProfile} ok />
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.overview.installEmpty")}</p>
                )}
              </section>

              <section className={settingsCardClass("overview")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Config</p>
                    <h2>{t("settings.overview.configTitle")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={keyBusy}
                    type="button"
                    onClick={() => void createApiKey(installStatus?.activeProfile)}
                  >
                    <Settings size={14} />
                    <span>{keyBusy ? t("settings.overview.generating") : t("settings.overview.generateKey")}</span>
                  </button>
                </div>
                {installStatus ? (
                  <div className="settings-rows">
                    <StatusRow label="config.yaml" value={installStatus.configExists ? t("settings.shared.exists") : t("settings.shared.notExists")} ok={installStatus.configExists} />
                    <StatusRow label=".env" value={installStatus.envExists ? t("settings.shared.exists") : t("settings.shared.notExists")} ok={installStatus.envExists} />
                    <StatusRow label="API_SERVER_KEY" value={installStatus.apiServerKeyPresent ? t("settings.shared.configured") : t("settings.shared.notConfigured")} ok={installStatus.apiServerKeyPresent} />
                    <StatusRow label="api_server" value={installStatus.apiServerConfigured ? t("settings.overview.enabled") : t("settings.overview.notEnabled")} ok={installStatus.apiServerConfigured} />
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.overview.configEmpty")}</p>
                )}
              </section>

              <section className={settingsCardClass("overview", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Config Health</p>
                    <h2>{t("settings.overview.healthTitle")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={configHealthBusy}
                    type="button"
                    onClick={() => void refreshConfigHealth(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{configHealthBusy ? t("settings.overview.checking") : t("settings.overview.recheckHealth")}</span>
                  </button>
                </div>
                {configHealth ? (
                  <div className="config-health-panel">
                    <div className="config-health-summary">
                      <span className={configHealth.summary.errors > 0 ? "danger" : "ok"}>
                        {configHealth.summary.errors} errors
                      </span>
                      <span className={configHealth.summary.warnings > 0 ? "warning" : "ok"}>
                        {configHealth.summary.warnings} warnings
                      </span>
                      <span>{configHealth.profile} · {formatTime(configHealth.ranAt)}</span>
                    </div>
                    {configHealth.issues.length === 0 ? (
                      <p className="empty-note">{t("settings.overview.healthPass")}</p>
                    ) : (
                      <div className="config-health-list">
                        {configHealth.issues.map((issue) => (
                          <article className={`config-health-issue ${issue.severity}`} key={issue.code}>
                            <div>
                              <div className="config-health-title">
                                <strong>{issue.message}</strong>
                                <em>{configSeverityLabel(issue.severity, t)}</em>
                              </div>
                              {issue.detail && <p>{issue.detail}</p>}
                              {issue.locations.length > 0 && (
                                <small title={issue.locations.join("\n")}>
                                  {issue.locations.slice(0, 2).join(" · ")}
                                </small>
                              )}
                            </div>
                            {issue.autoFixable && (
                              <button
                                className="refresh-runtime"
                                disabled={configFixingCode === issue.code}
                                type="button"
                                onClick={() => void fixConfigIssue(issue)}
                                title={issue.fixLocation ?? undefined}
                              >
                                <Settings size={14} />
                                <span>{configFixingCode === issue.code ? t("settings.overview.fixing") : issue.fixDescription ?? t("settings.overview.fix")}</span>
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.overview.healthEmpty")}</p>
                )}
              </section>

              <section className={settingsCardClass("overview", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Doctor</p>
                    <h2>{t("settings.overview.doctorTitle")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={doctorBusy}
                    type="button"
                    onClick={() => void runDoctorDiagnostics(installStatus?.activeProfile)}
                  >
                    <Stethoscope size={14} />
                    <span>{doctorBusy ? t("settings.shared.diagnosing") : t("settings.overview.runDoctor")}</span>
                  </button>
                </div>
                {doctorReport ? (
                  <div className="config-health-panel">
                    <div className="config-health-summary">
                      <span className={doctorReport.ok ? "ok" : "warning"}>
                        {doctorReport.ok ? t("settings.overview.pass") : t("settings.overview.needAttention")}
                      </span>
                      <span className={doctorReport.configErrors > 0 ? "danger" : "ok"}>
                        {doctorReport.configErrors} errors
                      </span>
                      <span className={doctorReport.configWarnings > 0 ? "warning" : "ok"}>
                        {doctorReport.configWarnings} warnings
                      </span>
                      <span>{doctorReport.activeProfile} · {formatTime(doctorReport.ranAt)}</span>
                    </div>
                    <p className="empty-note">{doctorReport.summary}</p>
                    <div className="settings-rows">
                      {doctorReport.checks.map((check) => (
                        <StatusRow
                          key={check.label}
                          label={check.label}
                          value={check.detail}
                          ok={check.status === "ok"}
                          warn={check.status === "warn" || check.status === "info"}
                        />
                      ))}
                    </div>
                    {doctorReport.doctorOutput.trim().length > 0 && (
                      <div className="doctor-output">
                        <p className="panel-label">
                          {doctorReport.doctorSupported ? t("settings.overview.doctorOutput") : t("settings.overview.doctorNote")}
                        </p>
                        <pre>{doctorReport.doctorOutput}</pre>
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="empty-note">
                    {t("settings.overview.doctorEmptyPre")} <code>hermes doctor</code> {t("settings.overview.doctorEmptyPost")}
                  </p>
                )}
              </section>

              <section className={settingsCardClass("appearance", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">{t("appearance.panelLabel")}</p>
                    <h2>{t("appearance.title")}</h2>
                  </div>
                  <span className="count-pill">{settingsBusy ? t("common.saving") : t("common.local")}</span>
                </div>
                <div className="appearance-panel">
                  <div>
                    <h3>{t("appearance.language")}</h3>
                    <div className="language-options">
                      {languageOptions.map((option) => (
                        <button
                          className={language === option.id ? "active" : ""}
                          key={option.id}
                          type="button"
                          onClick={() => setLanguage(option.id as Language)}
                        >
                          {option.label}
                        </button>
                      ))}
                    </div>
                    <small className="language-hint">{t("appearance.languageHint")}</small>
                  </div>
                  <div>
                    <h3>{t("appearance.theme")}</h3>
                    <div className="theme-grid">
                      {themeOptions.map((theme) => (
                        <button
                          className={`theme-card ${appSettings.theme === theme.id ? "active" : ""}`}
                          key={theme.id}
                          type="button"
                          onClick={() => void updateAppSettings({ theme: theme.id })}
                        >
                          <span className="theme-preview" data-theme-preview={theme.id}>
                            <i />
                            <b />
                          </span>
                          <strong>{theme.name}</strong>
                          <small>{theme.appearance}</small>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="appearance-options">
                    <label className="settings-toggle-row">
                      <span>
                        <strong>{t("appearance.roundedCorners")}</strong>
                        <small>{t("appearance.roundedCornersHint")}</small>
                      </span>
                      <input
                        checked={appSettings.roundedCorners}
                        type="checkbox"
                        onChange={(event) => void updateAppSettings({ roundedCorners: event.target.checked })}
                      />
                    </label>
                    <div>
                      <h3>{t("appearance.font")}</h3>
                      <div className="font-options">
                        {fontOptions.map((font) => (
                          <button
                            className={appSettings.font === font.id ? "active" : ""}
                            key={font.id}
                            style={{ fontFamily: font.stack }}
                            type="button"
                            onClick={() => void updateAppSettings({ font: font.id })}
                          >
                            {font.name}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("privacy", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Privacy</p>
                    <h2>{t("settings.privacy.title")}</h2>
                  </div>
                  <span className="count-pill">
                    <ShieldCheck size={14} />
                    {settingsBusy ? t("common.saving") : t("common.local")}
                  </span>
                </div>
                <div className="appearance-options">
                  <label className="settings-toggle-row">
                    <span>
                      <strong>{t("settings.privacy.allowAnalytics")}</strong>
                      <small>
                        {t("settings.privacy.allowAnalyticsHint")}
                      </small>
                    </span>
                    <input
                      checked={appSettings.allowAnonymousAnalytics}
                      type="checkbox"
                      onChange={(event) =>
                        void updateAppSettings({ allowAnonymousAnalytics: event.target.checked })
                      }
                    />
                  </label>
                  <p className="empty-note">
                    {t("settings.privacy.note1")}<strong>{t("settings.privacy.strongNot")}</strong>{t("settings.privacy.note2")}<strong>{t("settings.privacy.strongNot")}</strong>{t("settings.privacy.note3")}
                  </p>
                </div>
              </section>

              <section className={settingsCardClass("network", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Network</p>
                    <h2>{t("settings.network.title")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={networkBusy}
                    type="button"
                    onClick={() => void refreshNetworkSettings(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{networkBusy ? t("common.loading") : t("common.refresh")}</span>
                  </button>
                </div>
                <div className="network-panel">
                  <label className="settings-toggle-row">
                    <span>
                      <strong>Force IPv4</strong>
                      <small>{installStatus?.activeProfile ?? "default"} · network.force_ipv4</small>
                    </span>
                    <input
                      checked={networkSettings.forceIpv4}
                      type="checkbox"
                      onChange={(event) => void updateNetworkSettings({ forceIpv4: event.target.checked })}
                    />
                  </label>
                  <label className="network-field">
                    <span>HTTP Proxy</span>
                    <input
                      value={networkSettings.proxy}
                      onChange={(event) => setNetworkSettings((current) => ({ ...current, proxy: event.target.value }))}
                      onBlur={() => void updateNetworkSettings({ proxy: networkSettings.proxy })}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") {
                          event.preventDefault();
                          void updateNetworkSettings({ proxy: networkSettings.proxy });
                          event.currentTarget.blur();
                        }
                      }}
                      placeholder="http://127.0.0.1:7890"
                    />
                  </label>
                  <div className="transport-grid">
                    <TransportSelector
                      label="Local chat transport"
                      value={networkSettings.localChatTransport}
                      onChange={(localChatTransport) => void updateNetworkSettings({ localChatTransport })}
                    />
                    <TransportSelector
                      label="Remote chat transport"
                      value={networkSettings.remoteChatTransport}
                      onChange={(remoteChatTransport) => void updateNetworkSettings({ remoteChatTransport })}
                    />
                    <TransportSelector
                      label="SSH chat transport"
                      value={networkSettings.sshChatTransport}
                      onChange={(sshChatTransport) => void updateNetworkSettings({ sshChatTransport })}
                    />
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("profiles", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Profiles</p>
                    <h2>Hermes Profiles</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{profiles.length}</span>
                    <button className="refresh-runtime" disabled={profileBusy} type="button" onClick={() => void refreshProfiles()}>
                      <RefreshCw size={14} />
                      <span>{profileBusy ? t("common.processing") : t("common.refresh")}</span>
                    </button>
                  </div>
                </div>

                <div className="profile-manager">
                  <div className="profile-create-form">
                    <input
                      value={profileForm.name}
                      onChange={(event) =>
                        setProfileForm((current) => ({
                          ...current,
                          name: event.target.value.toLowerCase().replace(/[^a-z0-9_-]/g, ""),
                        }))
                      }
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void createProfileFromForm();
                      }}
                      placeholder="profile-name"
                    />
                    <label className="mcp-check">
                      <input
                        checked={profileForm.cloneConfig}
                        type="checkbox"
                        onChange={(event) => setProfileForm((current) => ({ ...current, cloneConfig: event.target.checked }))}
                      />
                      clone config
                    </label>
                    <button className="refresh-runtime" disabled={profileBusy || !profileForm.name.trim()} type="button" onClick={() => void createProfileFromForm()}>
                      <Plus size={14} />
                      <span>{t("settings.profiles.create")}</span>
                    </button>
                  </div>

                  <div className="profile-card-grid">
                    {profiles.length > 0 ? (
                      profiles.map((profile) => (
                        <article className={`profile-card ${profile.active ? "active" : ""}`} key={profile.name}>
                          <div className="profile-card-head">
                            <ProfileAvatar
                              name={profile.name}
                              color={profile.color}
                              avatar={profile.avatar}
                              size={40}
                            />
                            <div>
                              <strong>{profile.name}</strong>
                              <span>{profile.provider || "auto"} · {profile.model || "no model"}</span>
                              <small>{profile.home}</small>
                            </div>
                            <em>{profile.active ? "active" : profile.isDefault ? "default" : "profile"}</em>
                          </div>
                          <div className="profile-card-stats">
                            <span>{profile.hasEnv ? ".env" : "no env"}</span>
                            <span>{profile.hasSoul ? "SOUL" : "no SOUL"}</span>
                            <span>{profile.skillCount} skills</span>
                            <span>{profile.gatewayRunning ? "gateway on" : "gateway off"}</span>
                            <span>{profile.hasApiKey ? "api key" : "no key"}</span>
                          </div>
                          <div className="model-card-actions profile-card-actions">
                            <button type="button" onClick={() => setDetailProfileName(profile.name)}>
                              <Settings size={14} />
                              <span>{t("settings.shared.detail")}</span>
                            </button>
                            <button disabled={profileBusy || profile.active} type="button" onClick={() => void activateProfile(profile.name)}>
                              <Plug size={14} />
                              <span>{profile.active ? t("settings.shared.activated") : t("settings.shared.activate")}</span>
                            </button>
                            <button disabled={profileBusy} type="button" onClick={() => void activateProfile(profile.name, true)}>
                              <MessageSquareText size={14} />
                              <span>{t("settings.profiles.chat")}</span>
                            </button>
                            {!profile.isDefault && (
                              <button disabled={profileBusy} type="button" onClick={() => void deleteProfileByName(profile)}>
                                <Trash2 size={14} />
                                <span>{t("settings.shared.delete")}</span>
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="empty-note">{t("settings.profiles.empty")}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("providers", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Provider Keys</p>
                    <h2>{t("settings.providers.title")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{t("settings.providers.refreshKeys")}</span>
                  </button>
                </div>

                <div className="provider-key-grid">
                  {providerKeys.map((item) => (
                    <article className="provider-key-card" key={item.envKey}>
                      <div className="provider-key-card-head">
                        <div>
                          <strong>{item.label}</strong>
                          <span>{item.envKey}</span>
                        </div>
                        <em className={item.present ? "ok" : "warning"}>
                          {item.present ? item.masked : t("settings.shared.notConfigured")}
                        </em>
                      </div>
                      <div className="provider-key-row">
                        <input
                          type="password"
                          value={providerKeyDrafts[item.envKey] ?? ""}
                          onChange={(event) =>
                            setProviderKeyDrafts((current) => ({
                              ...current,
                              [item.envKey]: event.target.value,
                            }))
                          }
                          placeholder={t("settings.providers.newKeyPlaceholder")}
                        />
                        <button
                          disabled={providerBusy || !(providerKeyDrafts[item.envKey] ?? "").trim()}
                          type="button"
                          onClick={() => void saveProviderKeyDraft(item.envKey)}
                        >
                          <Save size={14} />
                          <span>{t("common.save")}</span>
                        </button>
                      </div>
                    </article>
                  ))}
                </div>

                <div className="provider-registry-panel">
                  <div className="settings-card-head compact-head">
                    <div>
                      <p className="panel-label">Provider Registry</p>
                      <h3>{t("settings.providers.registryTitle")}</h3>
                    </div>
                    <span className="count-pill">{providerRegistry.length}</span>
                  </div>
                  <div className="provider-registry-grid">
                    {providerRegistry.map((provider) => (
                      <article className={`provider-registry-card ${provider.authType.startsWith("oauth") ? "oauth" : ""}`} key={provider.id}>
                        <div className="provider-registry-head">
                          <div>
                            <strong>{provider.label}</strong>
                            <span>{provider.id} · {provider.authType}</span>
                          </div>
                          <em className={provider.keyPresent || provider.credentialCount > 0 || provider.local ? "ok" : "warning"}>
                            {provider.local ? "local" : provider.keyPresent ? "env" : provider.credentialCount > 0 ? "pool" : "not ready"}
                          </em>
                        </div>
                        <small>{provider.baseUrl || "OAuth / registry models"}{provider.envKey ? ` · ${provider.envKey}` : ""}</small>
                        <p>{provider.notes}</p>
                        <div className="provider-registry-actions">
                          {provider.authType.startsWith("oauth") ? (
                            <button
                              disabled={oauthBusyProvider === provider.id}
                              type="button"
                              onClick={() => void loginOAuthProvider(provider)}
                            >
                              <Plug size={14} />
                              <span>{oauthBusyProvider === provider.id ? t("settings.providers.loggingIn") : t("settings.providers.oauthLogin")}</span>
                            </button>
                          ) : (
                            <button
                              disabled={discoveryBusy || !provider.discoverable}
                              type="button"
                              onClick={() =>
                                void diagnoseProvider({
                                  id: provider.id,
                                  name: provider.label,
                                  provider: provider.id,
                                  model: "",
                                  baseUrl: provider.baseUrl,
                                  createdAt: Date.now(),
                                })
                              }
                            >
                              <RefreshCw size={14} />
                              <span>{t("settings.providers.probe")}</span>
                            </button>
                          )}
                        </div>
                      </article>
                    ))}
                  </div>
                </div>

                <div className="credential-pool">
                  <div className="credential-pool-form">
                    <input
                      value={poolForm.provider}
                      onChange={(event) => setPoolForm((current) => ({ ...current, provider: event.target.value }))}
                      placeholder="provider"
                    />
                    <input
                      type="password"
                      value={poolForm.apiKey}
                      onChange={(event) => setPoolForm((current) => ({ ...current, apiKey: event.target.value }))}
                      placeholder="API key"
                    />
                    <input
                      value={poolForm.label}
                      onChange={(event) => setPoolForm((current) => ({ ...current, label: event.target.value }))}
                      placeholder={t("settings.providers.labelOptional")}
                    />
                    <button
                      className="refresh-runtime"
                      disabled={providerBusy || !poolForm.provider.trim() || !poolForm.apiKey.trim()}
                      type="button"
                      onClick={() => void addPoolEntry()}
                    >
                      <Plus size={14} />
                      <span>{t("settings.providers.addToPool")}</span>
                    </button>
                  </div>
                  <div className="credential-pool-list">
                    {credentialPool.some((group) => group.entries.length > 0) ? (
                      credentialPool.map((group) =>
                        group.entries.length > 0 ? (
                          <article className="credential-pool-group" key={group.provider}>
                            <strong>{group.provider}</strong>
                            {group.entries.map((entry) => (
                              <div className="credential-pool-entry" key={entry.id}>
                                <span>{entry.label}</span>
                                <code>{entry.masked || "empty"}</code>
                                <small>{entry.authType} · {entry.source}</small>
                                <button
                                  disabled={providerBusy}
                                  type="button"
                                  onClick={() => void removePoolEntry(group.provider, entry.id)}
                                >
                                  <Trash2 size={13} />
                                </button>
                              </div>
                            ))}
                          </article>
                        ) : null,
                      )
                    ) : (
                      <p className="empty-note">{t("settings.providers.poolEmpty")}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("models", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Models</p>
                    <h2>{t("settings.models.title")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{t("settings.models.refreshModels")}</span>
                  </button>
                  <button
                    className="refresh-runtime"
                    disabled={discoveryBusy}
                    type="button"
                    onClick={() => void diagnoseProvider()}
                  >
                    <Plug size={14} />
                    <span>{discoveryBusy ? t("settings.shared.diagnosing") : t("settings.models.diagnoseProvider")}</span>
                  </button>
                </div>
                <div className="model-panel">
                  <div className="settings-rows">
                    <StatusRow label={t("settings.models.currentProvider")} value={activeModel?.provider || t("settings.shared.notConfigured")} ok={Boolean(activeModel?.provider && activeModel.provider !== "auto")} />
                    <StatusRow label={t("settings.models.currentModel")} value={activeModel?.model || t("settings.shared.notConfigured")} ok={Boolean(activeModel?.model)} />
                    <StatusRow label="Base URL" value={activeModel?.baseUrl || t("settings.models.baseUrlDefault")} ok />
                  </div>

                  {providerDiscovery && (
                    <div className={`provider-diagnosis ${providerDiscovery.ok ? "ok" : "warning"}`}>
                      <div>
                        <strong>{providerDiscovery.provider} · {providerDiscovery.status}{providerDiscovery.cached ? " · cached" : ""}</strong>
                        <span>{providerDiscovery.message}</span>
                        <small>{providerDiscovery.baseUrl || "no base url"} · {providerDiscovery.envKey || "no env key"}</small>
                        {providerDiscovery.models.length > 0 && (
                          <div className="discovered-model-list">
                            {providerDiscovery.models.slice(0, 18).map((model) => {
                              const free = providerDiscovery.freeModels.includes(model.id);
                              return (
                                <button
                                  key={model.id}
                                  type="button"
                                  onClick={() => useDiscoveredModel(model.id, model.contextLength)}
                                  title={model.contextLength ? `${model.contextLength} tokens` : undefined}
                                >
                                  <span>{model.id}</span>
                                  {free && <em>free</em>}
                                  {model.contextLength && <small>{model.contextLength}</small>}
                                </button>
                              );
                            })}
                          </div>
                        )}
                      </div>
                      <em>{providerDiscovery.modelCount} models</em>
                    </div>
                  )}

                  <div className="model-form">
                    <label>
                      <span>{t("settings.models.name")}</span>
                      <input
                        value={modelForm.name}
                        onChange={(event) => setModelForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder={t("settings.models.namePlaceholder")}
                      />
                    </label>
                    <label>
                      <span>Provider</span>
                      <input
                        value={modelForm.provider}
                        onChange={(event) => setModelForm((current) => ({ ...current, provider: event.target.value }))}
                        placeholder="openai / openrouter / custom"
                      />
                    </label>
                    <label>
                      <span>Model</span>
                      <input
                        value={modelForm.model}
                        onChange={(event) => setModelForm((current) => ({ ...current, model: event.target.value }))}
                        placeholder={t("settings.models.modelIdPlaceholder")}
                        list="provider-discovered-models"
                      />
                      {providerDiscovery?.models.length ? (
                        <datalist id="provider-discovered-models">
                          {providerDiscovery.models.map((model) => (
                            <option key={model.id} value={model.id} />
                          ))}
                        </datalist>
                      ) : null}
                    </label>
                    <label>
                      <span>Base URL</span>
                      <input
                        value={modelForm.baseUrl}
                        onChange={(event) => setModelForm((current) => ({ ...current, baseUrl: event.target.value }))}
                        placeholder={t("settings.models.optional")}
                      />
                    </label>
                    <label>
                      <span>Context</span>
                      <input
                        value={modelForm.contextLength}
                        onChange={(event) => setModelForm((current) => ({ ...current, contextLength: event.target.value }))}
                        placeholder={t("settings.models.optionalTokens")}
                      />
                    </label>
                    <div className="model-form-actions">
                      <button className="refresh-runtime" disabled={modelBusy} type="button" onClick={saveModelFromForm}>
                        <Save size={14} />
                        <span>{modelForm.id ? t("common.update") : t("common.save")}</span>
                      </button>
                      <button className="refresh-runtime" type="button" onClick={resetModelForm}>
                        <Plus size={14} />
                        <span>{t("settings.models.new")}</span>
                      </button>
                    </div>
                  </div>

                  <div className="model-subpanel">
                    <div className="model-subpanel-head">
                      <div>
                        <strong>{t("settings.models.auxTitle")}</strong>
                        <span>{t("settings.models.auxHint")}</span>
                      </div>
                    </div>
                    <div className="auxiliary-model-grid">
                      {auxiliaryModels.map((item) => {
                        const contextValue = item.contextLength ? String(item.contextLength) : "";
                        const busy = auxiliaryBusyTask === item.task;
                        return (
                          <article className="auxiliary-model-card" key={item.task}>
                            <div className="auxiliary-model-title">
                              <WandSparkles size={15} />
                              <strong>{item.label}</strong>
                              <em>{item.provider || "auto"}</em>
                            </div>
                            <p>{item.hint}</p>
                            <div className="auxiliary-model-fields">
                              <label>
                                <span>Provider</span>
                                <input
                                  value={item.provider}
                                  onChange={(event) => updateAuxiliaryModelDraft(item.task, { provider: event.target.value })}
                                  placeholder="auto"
                                />
                              </label>
                              <label>
                                <span>Model</span>
                                <input
                                  value={item.model}
                                  onChange={(event) => updateAuxiliaryModelDraft(item.task, { model: event.target.value })}
                                  placeholder={t("settings.models.autoUseMain")}
                                />
                              </label>
                              <label>
                                <span>Base URL</span>
                                <input
                                  value={item.baseUrl}
                                  onChange={(event) => updateAuxiliaryModelDraft(item.task, { baseUrl: event.target.value })}
                                  placeholder={t("settings.models.optional")}
                                />
                              </label>
                              <label>
                                <span>Context</span>
                                <input
                                  value={contextValue}
                                  onChange={(event) => {
                                    const value = Number.parseInt(event.target.value.trim(), 10);
                                    updateAuxiliaryModelDraft(item.task, {
                                      contextLength: Number.isFinite(value) && value > 0 ? value : undefined,
                                    });
                                  }}
                                  placeholder={t("settings.models.optional")}
                                />
                              </label>
                            </div>
                            <div className="model-card-actions">
                              <button disabled={busy} type="button" onClick={() => void saveAuxiliaryModel(item)}>
                                <Save size={14} />
                                <span>{busy ? t("settings.shared.saving") : t("common.save")}</span>
                              </button>
                              <button disabled={busy} type="button" onClick={() => resetAuxiliaryDraftToAuto(item.task)}>
                                <RefreshCw size={14} />
                                <span>Auto</span>
                              </button>
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </div>

                  <div className="model-subpanel">
                    <div className="model-subpanel-head">
                      <div>
                        <strong>Registry Model Library</strong>
                        <span>{t("settings.models.registryHint")}</span>
                      </div>
                      <button className="refresh-runtime" disabled={registryBusy} type="button" onClick={() => void refreshRegistryLibrary()}>
                        <RefreshCw size={14} />
                        <span>{registryBusy ? t("settings.models.refreshing") : t("settings.models.refreshLibrary")}</span>
                      </button>
                    </div>
                    <div className="registry-library-grid">
                      {registryLibrary.some((provider) => provider.models.length > 0) ? (
                        registryLibrary
                          .filter((provider) => provider.models.length > 0)
                          .map((provider) => (
                            <article className="registry-library-provider" key={provider.provider}>
                              <div className="registry-library-provider-head">
                                <div>
                                  <strong>{provider.label}</strong>
                                  <span>{provider.provider} · {provider.status}</span>
                                </div>
                                <em>{provider.models.length}</em>
                              </div>
                              <small>{provider.baseUrl || provider.authType}</small>
                              <div className="registry-library-models">
                                {provider.models.slice(0, 12).map((model) => (
                                  <button
                                    className={model.saved ? "saved" : ""}
                                    key={`${provider.provider}:${model.id}`}
                                    type="button"
                                    title={`${model.source}${model.contextLength ? ` · ${model.contextLength} tokens` : ""}`}
                                    onClick={() => pickRegistryModel(provider, model)}
                                  >
                                    <span>{model.label || model.id}</span>
                                    {model.free && <em>free</em>}
                                    {model.saved && <em>saved</em>}
                                  </button>
                                ))}
                              </div>
                            </article>
                          ))
                      ) : (
                        <p className="empty-note">{t("settings.models.libraryEmpty")}</p>
                      )}
                    </div>
                  </div>

                  <div className="model-list">
                    {models.length > 0 ? (
                      models.map((model) => {
                        const isActive = activeModel?.provider === model.provider && activeModel.model === model.model;
                        return (
                          <article className={`model-card ${isActive ? "active" : ""}`} key={model.id}>
                            <div>
                              <strong>{model.name}</strong>
                              <span>{model.provider} · {model.model}</span>
                              <small>{model.baseUrl || "provider default"}{model.contextLength ? ` · ${model.contextLength} tokens` : ""}</small>
                            </div>
                            <div className="model-card-actions">
                              <button disabled={modelBusy || isActive} type="button" onClick={() => void activateModel(model)}>
                                <Plug size={14} />
                                <span>{isActive ? t("settings.shared.activated") : t("settings.shared.activate")}</span>
                              </button>
                              <button disabled={discoveryBusy} type="button" onClick={() => void diagnoseProvider(model)}>
                                <RefreshCw size={14} />
                                <span>{t("settings.shared.diagnose")}</span>
                              </button>
                              <button disabled={modelBusy} type="button" onClick={() => editModel(model)}>
                                <Settings size={14} />
                                <span>{t("settings.shared.edit")}</span>
                              </button>
                              <button disabled={modelBusy} type="button" onClick={() => void deleteModel(model)}>
                                <Trash2 size={14} />
                                <span>{t("settings.shared.delete")}</span>
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="empty-note">{t("settings.models.listEmpty")}</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("gateway", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Gateway</p>
                    <h2>{t("settings.gateway.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="refresh-runtime"
                      type="button"
                      onClick={() => void refreshRuntime({ autoStart: false })}
                    >
                      <RefreshCw size={14} />
                      <span>{t("common.refresh")}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      disabled={gatewayBusy}
                      type="button"
                      onClick={() => void startGateway(installStatus?.activeProfile)}
                    >
                      <Plug size={14} />
                      <span>{gatewayBusy ? t("common.processing") : t("settings.gateway.start")}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      disabled={gatewayBusy}
                      type="button"
                      onClick={() => void stopGateway(installStatus?.activeProfile)}
                    >
                      <Power size={14} />
                      <span>{t("settings.gateway.stop")}</span>
                    </button>
                  </div>
                </div>
                <div className="settings-rows">
                  <StatusRow
                    label={t("settings.gateway.health")}
                    value={installStatus?.gatewayHealth ?? runtimeStatus.message}
                    ok={installStatus?.gatewayRunning ?? runtimeStatus.state === "ready"}
                  />
                  <StatusRow label="Runtime" value={runtimeStatus.message} ok={runtimeStatus.state === "ready"} />
                </div>
                {profiles.length > 0 ? (
                  <div className="settings-profile-grid">
                    {profiles.map((profile) => (
                      <article className="settings-profile" key={profile.name}>
                        <strong>{profile.name}</strong>
                        <span>{profile.gatewayUrl}</span>
                        <small>{profile.hasApiKey ? "API key ready" : "API key missing"}</small>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.gateway.empty")}</p>
                )}
              </section>

              <section className={settingsCardClass("gateway", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Remote</p>
                    <h2>{t("settings.remote.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void refreshRemoteConnection()}>
                      <RefreshCw size={14} />
                      <span>{t("common.refresh")}</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void saveRemoteConfig()}>
                      <Save size={14} />
                      <span>{t("common.save")}</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void testRemoteConfig()}>
                      <Plug size={14} />
                      <span>{t("settings.shared.test")}</span>
                    </button>
                  </div>
                </div>
                <div className="remote-panel">
                  <div className="mode-toggle remote-mode-toggle">
                    {(["local", "remote", "ssh"] as const).map((modeName) => (
                      <button
                        className={remoteConfig.mode === modeName ? "selected" : ""}
                        key={modeName}
                        type="button"
                        onClick={() => setRemoteConfig((current) => ({ ...current, mode: modeName }))}
                      >
                        {modeName === "local" ? t("settings.remote.local") : modeName === "remote" ? t("settings.remote.remoteUrl") : t("settings.remote.sshTunnel")}
                      </button>
                    ))}
                  </div>
                  <div className="settings-rows">
                    <StatusRow label={t("settings.remote.currentMode")} value={remoteConfig.mode} ok />
                    <StatusRow label={t("settings.remote.connStatus")} value={remoteStatus?.message ?? t("settings.shared.notTested")} ok={Boolean(remoteStatus?.ok)} />
                    <StatusRow label="Base URL" value={remoteStatus?.baseUrl || (remoteConfig.mode === "remote" ? remoteConfig.remoteUrl : t("settings.remote.baseUrlByMode"))} ok={Boolean(remoteStatus?.baseUrl || remoteConfig.mode !== "remote" || remoteConfig.remoteUrl)} />
                    <StatusRow label="SSH Tunnel" value={remoteStatus?.sshTunnelActive ? "active" : "inactive"} ok={Boolean(remoteStatus?.sshTunnelActive) || remoteConfig.mode !== "ssh"} />
                  </div>
                  <div className="remote-form">
                    <label>
                      <span>Remote URL</span>
                      <input
                        value={remoteConfig.remoteUrl}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, remoteUrl: event.target.value }))}
                        placeholder="http://host:8642"
                      />
                    </label>
                    <label>
                      <span>API_SERVER_KEY</span>
                      <input
                        type="password"
                        value={remoteConfig.apiKey}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, apiKey: event.target.value }))}
                        placeholder={t("settings.remote.remoteTokenPlaceholder")}
                      />
                    </label>
                    <label>
                      <span>SSH Host</span>
                      <input
                        value={remoteConfig.ssh.host}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, host: event.target.value } }))}
                        placeholder="192.168.1.100"
                      />
                    </label>
                    <label>
                      <span>Username</span>
                      <input
                        value={remoteConfig.ssh.username}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, username: event.target.value } }))}
                        placeholder="hermes"
                      />
                    </label>
                    <label>
                      <span>Key Path</span>
                      <input
                        value={remoteConfig.ssh.keyPath}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, keyPath: event.target.value } }))}
                        placeholder="~/.ssh/id_rsa"
                      />
                    </label>
                    <label>
                      <span>SSH Port</span>
                      <input
                        value={String(remoteConfig.ssh.port)}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, port: Number.parseInt(event.target.value, 10) || 22 } }))}
                      />
                    </label>
                    <label>
                      <span>Remote Port</span>
                      <input
                        value={String(remoteConfig.ssh.remotePort)}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, remotePort: Number.parseInt(event.target.value, 10) || 8642 } }))}
                      />
                    </label>
                    <label>
                      <span>Local Port</span>
                      <input
                        value={String(remoteConfig.ssh.localPort)}
                        onChange={(event) => setRemoteConfig((current) => ({ ...current, ssh: { ...current.ssh, localPort: Number.parseInt(event.target.value, 10) || 18642 } }))}
                      />
                    </label>
                  </div>
                  <div className="settings-actions remote-actions">
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void connectSsh()}>
                      <Plug size={14} />
                      <span>{remoteBusy ? t("settings.remote.connecting") : t("settings.remote.startSsh")}</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void disconnectSsh()}>
                      <Power size={14} />
                      <span>{t("settings.remote.stopSsh")}</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("messaging", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Messaging</p>
                    <h2>{t("settings.messaging.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{messagingResponse?.platforms.length ?? 0}</span>
                    <button className="refresh-runtime" disabled={messagingBusy} type="button" onClick={() => void refreshMessagingPlatforms(installStatus?.activeProfile)}>
                      <RefreshCw size={14} />
                      <span>{messagingBusy ? t("common.loading") : t("common.refresh")}</span>
                    </button>
                  </div>
                </div>

                {messagingResponse ? (
                  <>
                    <div className="messaging-toolbar">
                      <div className="messaging-search">
                        <Search size={14} />
                        <input
                          type="text"
                          value={messagingSearch}
                          placeholder={t("settings.messaging.searchPlaceholder")}
                          onChange={(event) => setMessagingSearch(event.target.value)}
                        />
                      </div>
                      <div className="messaging-filter">
                        {(["all", "enabled", "configured", "unconfigured"] as const).map((key) => (
                          <button
                            key={key}
                            type="button"
                            className={messagingFilter === key ? "is-active" : ""}
                            onClick={() => setMessagingFilter(key)}
                          >
                            {t(`settings.messaging.filter.${key}`)}
                          </button>
                        ))}
                      </div>
                    </div>

                    {messagingPlatformsView.length > 0 ? (
                      <div className="messaging-platform-list">
                        {messagingPlatformsView.map((platform) => (
                          <MessagingPlatformCard
                            key={platform.id}
                            platform={platform}
                            source={messagingResponse.source}
                            busy={messagingBusy}
                            open={isMessagingCardOpen(platform)}
                            envDraft={messagingEnvDrafts[platform.id] ?? {}}
                            t={t}
                            onToggleOpen={() =>
                              setMessagingExpanded((current) => ({
                                ...current,
                                [platform.id]: !isMessagingCardOpen(platform),
                              }))
                            }
                            onToggleEnabled={() => void toggleMessagingPlatform(platform)}
                            onTest={() => void runMessagingPlatformTest(platform)}
                            onEnvChange={(key, value) =>
                              setMessagingEnvDrafts((current) => ({
                                ...current,
                                [platform.id]: { ...(current[platform.id] ?? {}), [key]: value },
                              }))
                            }
                            onClearEnv={(key) => void clearMessagingEnv(platform, key)}
                            onSaveEnv={() => void saveMessagingPlatformEnv(platform)}
                            onToggleToolset={(key, enabled) => void toggleMessagingToolset(platform, key, enabled)}
                            onOpenDocs={(url) => {
                              if (!url) return;
                              void openExternalUrl(url).catch((error) =>
                                setNotice(t("app.notice.openExternalBrowserFailed", { error: runtimeErrorMessage(error) })),
                              );
                            }}
                          />
                        ))}
                      </div>
                    ) : (
                      <p className="empty-note">{t("settings.messaging.noMatch")}</p>
                    )}
                  </>
                ) : (
                  <p className="empty-note">{t("settings.messaging.empty")}</p>
                )}
              </section>

              <section className={settingsCardClass("schedules", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Schedules</p>
                    <h2>{t("app.schedules.heading")}</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{cronJobs.length}</span>
                    <span className="cron-autorefresh-hint" title={t("app.schedules.autoRefreshHint")}>
                      <RefreshCw size={12} />
                      {t("app.schedules.autoRefresh")}
                    </span>
                    <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => { void refreshCronJobs(installStatus?.activeProfile); void refreshCronScripts(installStatus?.activeProfile); }}>
                      <RefreshCw size={14} />
                      <span>{cronBusy ? t("common.loading") : t("common.refresh")}</span>
                    </button>
                  </div>
                </div>

                <div className="model-panel">
                  <div className="model-form">
                    {cronEditId && (
                      <div className="cron-edit-banner model-form-wide">
                        <Pencil size={13} />
                        <span>{t("app.schedules.editBanner")}</span>
                        <button type="button" onClick={cancelCronEdit}>
                          {t("common.cancel")}
                        </button>
                      </div>
                    )}
                    <label>
                      <span>{t("app.schedules.name")}</span>
                      <input
                        ref={cronNameInputRef}
                        value={cronForm.name}
                        onChange={(event) => setCronForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder={t("app.schedules.namePlaceholder")}
                      />
                    </label>
                    <label>
                      <span>{t("app.schedules.repeatTimes")}</span>
                      <input
                        type="number"
                        min={1}
                        value={cronForm.repeatTimes}
                        onChange={(event) => setCronForm((current) => ({ ...current, repeatTimes: event.target.value }))}
                        placeholder={t("app.schedules.repeatPlaceholder")}
                      />
                    </label>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">{t("app.schedules.taskType")}</span>
                      <div className="cron-type-tabs">
                        <button
                          type="button"
                          className={!cronForm.noAgent ? "active" : ""}
                          onClick={() => setCronForm((current) => ({ ...current, noAgent: false }))}
                        >
                          <WandSparkles size={13} />
                          <span>{t("app.schedules.agentTask")}</span>
                        </button>
                        <button
                          type="button"
                          className={cronForm.noAgent ? "active" : ""}
                          onClick={() => setCronForm((current) => ({ ...current, noAgent: true }))}
                        >
                          <TerminalSquare size={13} />
                          <span>{t("app.schedules.scriptTask")}</span>
                        </button>
                      </div>
                      <span className="cron-field-hint">
                        {cronForm.noAgent
                          ? t("app.schedules.scriptTaskHint")
                          : t("app.schedules.agentTaskHint")}
                      </span>
                    </div>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">
                        {cronForm.noAgent ? t("app.schedules.scriptRequired") : t("app.schedules.scriptOptional")}
                      </span>
                      <div className="cron-script-row">
                        <FileCode2 size={14} />
                        <input
                          list="cron-script-options"
                          value={cronForm.script}
                          placeholder={t("app.schedules.scriptPlaceholder")}
                          onChange={(event) => setCronForm((current) => ({ ...current, script: event.target.value }))}
                        />
                        <datalist id="cron-script-options">
                          {cronScripts.map((script) => (
                            <option key={script} value={script} />
                          ))}
                        </datalist>
                        {cronForm.script && (
                          <button
                            type="button"
                            className="cron-script-clear"
                            aria-label={t("app.schedules.clearScript")}
                            onClick={() => setCronForm((current) => ({ ...current, script: "", noAgent: false }))}
                          >
                            <X size={13} />
                          </button>
                        )}
                      </div>
                      {cronScripts.length > 0 && (
                        <div className="cron-script-suggest">
                          {cronScripts
                            .filter((script) => script !== cronForm.script)
                            .slice(0, 6)
                            .map((script) => (
                              <button
                                key={script}
                                type="button"
                                className="cron-script-suggest-chip"
                                onClick={() => setCronForm((current) => ({ ...current, script }))}
                              >
                                {script}
                              </button>
                            ))}
                        </div>
                      )}
                      <span className="cron-field-hint">{t("app.schedules.scriptHint")}</span>
                    </div>

                    <div className="cron-builder model-form-wide">
                      <span className="cron-builder-title">{t("app.schedules.frequency")}</span>
                      <div className="cron-freq-tabs">
                        {CRON_FREQ_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={cronForm.freq === option.id ? "active" : ""}
                            onClick={() => setCronForm((current) => ({ ...current, freq: option.id }))}
                          >
                            {t(option.labelKey)}
                          </button>
                        ))}
                      </div>

                      <div className="cron-builder-controls">
                        {cronForm.freq === "minutes" && (
                          <div className="cron-control-row">
                            <span>{t("app.schedules.every")}</span>
                            <input
                              type="number"
                              min={1}
                              max={59}
                              value={cronForm.minuteInterval}
                              onChange={(event) =>
                                setCronForm((current) => ({
                                  ...current,
                                  minuteInterval: clampInt(event.target.value, 1, 59, 30),
                                }))
                              }
                            />
                            <span>{t("app.schedules.minutesOnce")}</span>
                          </div>
                        )}
                        {cronForm.freq === "hourly" && (
                          <div className="cron-control-row">
                            <span>{t("app.schedules.hourlyAt")}</span>
                            <input
                              type="number"
                              min={0}
                              max={59}
                              value={cronForm.minute}
                              onChange={(event) =>
                                setCronForm((current) => ({
                                  ...current,
                                  minute: clampInt(event.target.value, 0, 59, 0),
                                }))
                              }
                            />
                            <span>{t("app.schedules.minuteRun")}</span>
                          </div>
                        )}
                        {(cronForm.freq === "daily" || cronForm.freq === "weekly") && (
                          <>
                            {cronForm.freq === "weekly" && (
                              <div className="cron-weekday-row">
                                {CRON_WEEKDAYS.map((day) => (
                                  <button
                                    key={day.value}
                                    type="button"
                                    className={`cron-weekday ${cronForm.weekdays.includes(day.value) ? "active" : ""}`}
                                    onClick={() =>
                                      setCronForm((current) => ({
                                        ...current,
                                        weekdays: current.weekdays.includes(day.value)
                                          ? current.weekdays.filter((value) => value !== day.value)
                                          : [...current.weekdays, day.value],
                                      }))
                                    }
                                  >
                                    {t(`cron.weekdayShort.${day.value}`)}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="cron-control-row">
                              <span>{t("app.schedules.time")}</span>
                              <input
                                type="number"
                                min={0}
                                max={23}
                                value={cronForm.hour}
                                onChange={(event) =>
                                  setCronForm((current) => ({
                                    ...current,
                                    hour: clampInt(event.target.value, 0, 23, 9),
                                  }))
                                }
                              />
                              <span className="cron-colon">:</span>
                              <input
                                type="number"
                                min={0}
                                max={59}
                                value={cronForm.minute}
                                onChange={(event) =>
                                  setCronForm((current) => ({
                                    ...current,
                                    minute: clampInt(event.target.value, 0, 59, 0),
                                  }))
                                }
                              />
                            </div>
                          </>
                        )}
                        {cronForm.freq === "custom" && (
                          <div className="cron-control-row">
                            <input
                              className="cron-custom-input"
                              value={cronForm.customCron}
                              placeholder="*/30 * * * *"
                              onChange={(event) =>
                                setCronForm((current) => ({ ...current, customCron: event.target.value }))
                              }
                            />
                          </div>
                        )}
                      </div>

                      <div className={`cron-builder-preview ${cronSchedulePreview.error ? "cron-preview-invalid" : ""}`}>
                        {cronSchedulePreview.error ? (
                          <span className="cron-preview-error">
                            <AlertTriangle size={13} />
                            {cronSchedulePreview.error}
                          </span>
                        ) : (
                          <>
                            <code className="cron-preview-expr">{cronSchedulePreview.value}</code>
                            <span className="cron-preview-desc">{describeCronSchedule(cronForm, t)}</span>
                            {cronNextRun && (
                              <span className="cron-preview-next">
                                {t("app.schedules.nextRunPreview", {
                                  relative: formatCronRelative(cronNextRun.toISOString(), t) ?? "",
                                  date: formatCronDate(cronNextRun.toISOString(), t),
                                })}
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">{t("app.schedules.deliverTargets")}</span>
                      <div className="cron-chip-row">
                        {CRON_DELIVER_OPTIONS.map((option) => {
                          const selected = cronForm.deliverTargets.includes(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              className={`cron-toggle-chip ${selected ? "active" : ""}`}
                              onClick={() =>
                                setCronForm((current) => ({
                                  ...current,
                                  deliverTargets: selected
                                    ? current.deliverTargets.filter((value) => value !== option.id)
                                    : [...current.deliverTargets, option.id],
                                }))
                              }
                            >
                              {option.label}
                            </button>
                          );
                        })}
                      </div>
                      <span className="cron-field-hint">{t("app.schedules.deliverHint")}</span>
                    </div>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">{t("app.schedules.linkedSkills")}</span>
                      <div className="cron-chip-row">
                        {cronForm.skills.length === 0 && (
                          <span className="cron-field-hint">{t("app.schedules.noSkillsHint")}</span>
                        )}
                        {cronForm.skills.map((skill) => (
                          <span key={skill} className="cron-skill-chip">
                            {skill}
                            <button
                              type="button"
                              aria-label={t("app.schedules.removeSkill", { skill })}
                              onClick={() =>
                                setCronForm((current) => ({
                                  ...current,
                                  skills: current.skills.filter((value) => value !== skill),
                                }))
                              }
                            >
                              ×
                            </button>
                          </span>
                        ))}
                      </div>
                      <div className="cron-skill-add">
                        <input
                          value={cronSkillDraft}
                          placeholder={t("app.schedules.skillDraftPlaceholder")}
                          onChange={(event) => setCronSkillDraft(event.target.value)}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") {
                              event.preventDefault();
                              const next = cronSkillDraft.trim();
                              if (next && !cronForm.skills.includes(next)) {
                                setCronForm((current) => ({ ...current, skills: [...current.skills, next] }));
                              }
                              setCronSkillDraft("");
                            }
                          }}
                        />
                      </div>
                      {skills.length > 0 && (
                        <div className="cron-skill-suggest">
                          {skills
                            .filter((skill) => !cronForm.skills.includes(skill.name))
                            .slice(0, 8)
                            .map((skill) => (
                              <button
                                key={skill.dirName || skill.name}
                                type="button"
                                className="cron-skill-suggest-chip"
                                onClick={() =>
                                  setCronForm((current) => ({
                                    ...current,
                                    skills: current.skills.includes(skill.name)
                                      ? current.skills
                                      : [...current.skills, skill.name],
                                  }))
                                }
                              >
                                + {skill.name}
                              </button>
                            ))}
                        </div>
                      )}
                    </div>

                    <label className="model-form-wide">
                      <span>{cronForm.noAgent ? t("app.schedules.promptOptional") : "Prompt"}</span>
                      <textarea
                        value={cronForm.prompt}
                        onChange={(event) => setCronForm((current) => ({ ...current, prompt: event.target.value }))}
                        placeholder={
                          cronForm.noAgent
                            ? t("app.schedules.promptScriptPlaceholder")
                            : t("app.schedules.promptPlaceholder")
                        }
                      />
                    </label>
                    <div className="model-form-actions">
                      <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => void submitCronForm()}>
                        <Save size={14} />
                        <span>{cronEditId ? t("app.schedules.saveChanges") : t("app.schedules.create")}</span>
                      </button>
                      {cronEditId ? (
                        <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={cancelCronEdit}>
                          <X size={14} />
                          <span>{t("app.schedules.cancelEdit")}</span>
                        </button>
                      ) : (
                        <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => setCronForm(emptyCronJobForm)}>
                          <Plus size={14} />
                          <span>{t("app.schedules.reset")}</span>
                        </button>
                      )}
                    </div>
                  </div>

                  <div className="schedule-list">
                    {cronBusy && cronJobs.length === 0 ? (
                      <>
                        <div className="schedule-skeleton" />
                        <div className="schedule-skeleton" />
                      </>
                    ) : cronJobs.length > 0 ? (
                      cronJobs.map((job) => {
                        const meta = cronStateMeta(job.state);
                        const nextRelative = formatCronRelative(job.nextRunAt, t);
                        const lastRelative = formatCronRelative(job.lastRunAt, t);
                        const lastKind = job.lastError ? "fail" : job.lastRunAt ? "ok" : "none";
                        const deliverTargets = job.deliver.length ? job.deliver : ["local"];
                        const operating = cronOperatingId === job.id;
                        return (
                          <article
                            className={`schedule-card schedule-${job.state} ${cronEditId === job.id ? "schedule-card-editing" : ""}`}
                            key={job.id}
                          >
                            <div className="schedule-card-main">
                              <div className="schedule-card-title">
                                <strong>{job.name}</strong>
                                <span className={`schedule-badge ${meta.cls}`}>{meta.label}</span>
                                {cronEditId === job.id && <span className="schedule-editing-tag">{t("app.schedules.editing")}</span>}
                              </div>
                              <div className="schedule-card-meta">
                                <span className="schedule-meta-item">
                                  <Clock size={13} />
                                  {job.schedule}
                                </span>
                                {job.script && (
                                  <span
                                    className="schedule-meta-item schedule-meta-script"
                                    title={job.noAgent ? t("app.schedules.scriptTaskTitle") : t("app.schedules.scriptAttachTitle")}
                                  >
                                    {job.noAgent ? <TerminalSquare size={13} /> : <FileCode2 size={13} />}
                                    {job.noAgent ? t("app.schedules.scriptPrefix", { script: job.script }) : job.script}
                                  </span>
                                )}
                                {job.repeat?.times != null && (
                                  <span className="schedule-meta-item">
                                    <Repeat size={13} />
                                    {t("app.schedules.executed", {
                                      completed: job.repeat.completed,
                                      times: job.repeat.times,
                                    })}
                                  </span>
                                )}
                                <span
                                  className="schedule-meta-item"
                                  title={job.nextRunAt ? formatCronDate(job.nextRunAt, t) : undefined}
                                >
                                  {t("app.schedules.nextPrefix", {
                                    value: nextRelative ?? formatCronDate(job.nextRunAt, t),
                                  })}
                                </span>
                                <span
                                  className={`schedule-meta-item schedule-last-${lastKind}`}
                                  title={lastRelative ?? undefined}
                                >
                                  {lastKind === "fail" ? (
                                    <AlertTriangle size={13} />
                                  ) : lastKind === "ok" ? (
                                    <CheckCircle2 size={13} />
                                  ) : null}
                                  {t("app.schedules.lastPrefix", {
                                    value:
                                      lastKind === "fail"
                                        ? t("app.schedules.lastFail")
                                        : lastKind === "ok"
                                          ? t("app.schedules.lastOk")
                                          : t("app.schedules.lastNone"),
                                  })}
                                </span>
                              </div>
                              {job.prompt && <p className="schedule-card-prompt">{job.prompt}</p>}
                              <div className="schedule-card-deliver">
                                <span className="schedule-deliver-label">{t("app.schedules.deliver")}</span>
                                {deliverTargets.map((target) => (
                                  <span className="schedule-chip" key={target}>
                                    {target}
                                  </span>
                                ))}
                              </div>
                              {job.lastError && (
                                <details className="schedule-error">
                                  <summary>{t("app.schedules.lastErrorSummary")}</summary>
                                  <pre>{job.lastError}</pre>
                                </details>
                              )}
                            </div>
                            <div className="schedule-card-actions">
                              <button
                                className="schedule-action"
                                disabled={cronBusy}
                                type="button"
                                onClick={() => void runCronJobOperation(job, "trigger")}
                              >
                                {operating ? (
                                  <RefreshCw className="schedule-spin" size={14} />
                                ) : (
                                  <Play size={14} />
                                )}
                                <span>{t("app.schedules.run")}</span>
                              </button>
                              <button
                                className="schedule-action"
                                disabled={cronBusy}
                                type="button"
                                onClick={() => startCronEdit(job)}
                              >
                                <Pencil size={14} />
                                <span>{t("app.schedules.edit")}</span>
                              </button>
                              {job.state === "paused" ? (
                                <button
                                  className="schedule-action"
                                  disabled={cronBusy}
                                  type="button"
                                  onClick={() => void runCronJobOperation(job, "resume")}
                                >
                                  <Power size={14} />
                                  <span>{t("app.schedules.resume")}</span>
                                </button>
                              ) : (
                                <button
                                  className="schedule-action"
                                  disabled={cronBusy}
                                  type="button"
                                  onClick={() => void runCronJobOperation(job, "pause")}
                                >
                                  <Pause size={14} />
                                  <span>{t("app.schedules.pause")}</span>
                                </button>
                              )}
                              <button
                                className="schedule-action schedule-action-danger"
                                disabled={cronBusy}
                                type="button"
                                onClick={() => void runCronJobOperation(job, "remove")}
                              >
                                <Trash2 size={14} />
                                <span>{t("app.schedules.delete")}</span>
                              </button>
                              <div className="schedule-overflow">
                                <button
                                  className="schedule-action schedule-overflow-trigger"
                                  type="button"
                                  aria-label={t("app.schedules.moreActions")}
                                  aria-expanded={cronMenuJobId === job.id}
                                  onClick={(event) => {
                                    event.stopPropagation();
                                    setCronMenuJobId((current) => (current === job.id ? null : job.id));
                                  }}
                                >
                                  <MoreHorizontal size={14} />
                                  <span>{t("app.schedules.more")}</span>
                                </button>
                                {cronMenuJobId === job.id && (
                                  <div className="schedule-overflow-menu" onClick={(event) => event.stopPropagation()}>
                                    <button type="button" onClick={() => void openCronRuns(job)}>
                                      <History size={13} />
                                      <span>{t("app.schedules.viewRuns")}</span>
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => {
                                        void navigator.clipboard?.writeText(job.id);
                                        setCronMenuJobId(null);
                                        setNotice(t("app.schedules.copiedJobId", { id: job.id }));
                                      }}
                                    >
                                      <ScrollText size={13} />
                                      <span>{t("app.schedules.copyJobId")}</span>
                                    </button>
                                  </div>
                                )}
                              </div>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="schedule-empty">
                        <Clock size={26} />
                        <strong>{t("app.schedules.emptyTitle")}</strong>
                        <span>{t("app.schedules.emptyText")}</span>
                        <button type="button" onClick={() => cronNameInputRef.current?.focus()}>
                          <Plus size={14} />
                          <span>{t("app.schedules.createFirst")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {cronRunsJob && (
                <div className="snippet-modal-overlay" onClick={closeCronRuns}>
                  <div className="snippet-modal schedule-runs-modal" onClick={(event) => event.stopPropagation()}>
                    <div className="snippet-modal-head">
                      <div>
                        <h2>{t("app.schedules.runsTitle")}</h2>
                        <p>
                          {t("app.schedules.runsSubtitle", { name: cronRunsJob.name, count: cronRuns.length })}
                        </p>
                      </div>
                      <button className="snippet-modal-close" type="button" aria-label={t("common.close")} onClick={closeCronRuns}>
                        <X size={18} />
                      </button>
                    </div>
                    <div className="snippet-modal-body schedule-runs-body">
                      {cronRunsBusy ? (
                        <div className="schedule-runs-empty">
                          <RefreshCw className="schedule-spin" size={18} />
                          <span>{t("app.schedules.runsLoading")}</span>
                        </div>
                      ) : cronRunsError ? (
                        <div className="schedule-runs-empty schedule-runs-error">
                          <AlertTriangle size={18} />
                          <span>{t("app.schedules.runsLoadFailed", { error: cronRunsError })}</span>
                        </div>
                      ) : cronRuns.length === 0 ? (
                        <div className="schedule-runs-empty">
                          <History size={20} />
                          <span>
                            {remoteConfig.mode === "local"
                              ? t("app.schedules.runsEmptyLocal")
                              : t("app.schedules.runsEmptyRemote")}
                          </span>
                        </div>
                      ) : (
                        cronRuns.map((run) => {
                          const statusKind = cronRunStatusKind(run.status);
                          const expanded = cronExpandedRun === run.name;
                          return (
                            <div className={`schedule-run-item schedule-run-${statusKind}`} key={run.name}>
                              <button
                                type="button"
                                className="schedule-run-head"
                                onClick={() => setCronExpandedRun((current) => (current === run.name ? null : run.name))}
                              >
                                <span className="schedule-run-time">{formatCronRunTime(run.ranAt, t)}</span>
                                <span className="schedule-run-tags">
                                  {run.mode && <span className="schedule-run-mode">{run.mode}</span>}
                                  {run.status && (
                                    <span className={`schedule-run-status schedule-run-status-${statusKind}`}>
                                      {run.status}
                                    </span>
                                  )}
                                </span>
                              </button>
                              {expanded && <pre className="schedule-run-content">{run.content}</pre>}
                            </div>
                          );
                        })
                      )}
                    </div>
                  </div>
                </div>
              )}

              <section className={settingsCardClass("capabilities", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Capabilities</p>
                    <h2>{t("settings.capabilities.title")}</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{t("settings.capabilities.refreshCaps")}</span>
                  </button>
                </div>
                <div className="tools-remote-pane">
                  <div>
                    <strong>{t("settings.capabilities.toolsLocation")}</strong>
                    <span>
                      {remoteConfig.mode === "local"
                        ? t("settings.capabilities.locLocal")
                        : remoteConfig.mode === "remote"
                          ? t("settings.capabilities.locRemote")
                          : t("settings.capabilities.locSsh")}
                    </span>
                  </div>
                  <div>
                    <strong>{t("settings.capabilities.connStatus")}</strong>
                    <span>{remoteStatus?.message ?? t("settings.capabilities.notTestedRemote")}</span>
                  </div>
                  <div>
                    <strong>Base URL</strong>
                    <span>{remoteStatus?.baseUrl || (remoteConfig.mode === "remote" ? remoteConfig.remoteUrl : "local profile")}</span>
                  </div>
                  <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void refreshRemoteConnection()}>
                    <RefreshCw size={14} />
                    <span>{t("settings.capabilities.refreshConn")}</span>
                  </button>
                </div>
                <div className="capability-split">
                  <div>
                    <h3>Toolsets</h3>
                    <div className="toolset-group-list">
                      {toolsetGroups.length > 0 ? (
                        toolsetGroups.map(({ group, items }) => (
                          <section className="toolset-group" key={group}>
                            <div className="toolset-group-head">
                              <strong>{group}</strong>
                              <span>{items.filter((item) => item.enabled).length}/{items.length}</span>
                            </div>
                            <div className="capability-grid">
                              {items.map((toolset) => (
                                <article className={`capability-card ${toolset.enabled ? "enabled" : ""}`} key={toolset.key}>
                                  <strong>{toolset.label}</strong>
                                  <span>{toolset.description}</span>
                                  <small>{toolset.key} · {toolset.risk}</small>
                                  <button
                                    className="inline-action"
                                    disabled={capabilityBusy}
                                    type="button"
                                    onClick={() => void toggleToolset(toolset)}
                                  >
                                    {toolset.enabled ? t("settings.capabilities.off") : t("settings.capabilities.on")}
                                  </button>
                                </article>
                              ))}
                            </div>
                          </section>
                        ))
                      ) : (
                        <p className="empty-note">{t("settings.capabilities.toolsetsEmpty")}</p>
                      )}
                    </div>
                  </div>
                  <div>
                    <h3>MCP Servers</h3>
                    <div className="mcp-form">
                      <input
                        value={mcpForm.name}
                        onChange={(event) => setMcpForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="name"
                      />
                      <select
                        value={mcpForm.transport}
                        onChange={(event) =>
                          setMcpForm((current) => ({
                            ...current,
                            transport: event.target.value === "stdio" ? "stdio" : "http",
                          }))
                        }
                      >
                        <option value="http">http</option>
                        <option value="stdio">stdio</option>
                      </select>
                      {mcpForm.transport === "http" ? (
                        <input
                          value={mcpForm.url}
                          onChange={(event) => setMcpForm((current) => ({ ...current, url: event.target.value }))}
                          placeholder="https://..."
                        />
                      ) : (
                        <input
                          value={mcpForm.command}
                          onChange={(event) => setMcpForm((current) => ({ ...current, command: event.target.value }))}
                          placeholder="command"
                        />
                      )}
                      <label className="mcp-check">
                        <input
                          checked={mcpForm.enabled}
                          type="checkbox"
                          onChange={(event) => setMcpForm((current) => ({ ...current, enabled: event.target.checked }))}
                        />
                        enabled
                      </label>
                      {mcpForm.transport === "stdio" && (
                        <>
                          <textarea
                            value={mcpForm.args}
                            onChange={(event) => setMcpForm((current) => ({ ...current, args: event.target.value }))}
                            placeholder={t("settings.capabilities.argsPlaceholder")}
                          />
                          <textarea
                            value={mcpForm.env}
                            onChange={(event) => setMcpForm((current) => ({ ...current, env: event.target.value }))}
                            placeholder={t("settings.capabilities.envPlaceholder")}
                          />
                        </>
                      )}
                      {mcpForm.transport === "http" && (
                        <input
                          value={mcpForm.auth}
                          onChange={(event) => setMcpForm((current) => ({ ...current, auth: event.target.value }))}
                          placeholder={t("settings.capabilities.authPlaceholder")}
                        />
                      )}
                      <div className="settings-actions">
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMcpFromForm()}>
                          <Save size={14} />
                          <span>{t("settings.capabilities.saveMcp")}</span>
                        </button>
                        <button className="refresh-runtime" type="button" onClick={() => setMcpForm(emptyMcpForm)}>
                          <Plus size={14} />
                          <span>{t("settings.capabilities.new")}</span>
                        </button>
                      </div>
                    </div>
                    <div className="capability-grid">
                      {mcpServers.length > 0 ? (
                        mcpServers.map((server) => (
                          <article className={`capability-card ${server.enabled ? "enabled" : ""}`} key={server.name}>
                            <strong>{server.name}</strong>
                            <span>{server.detail || server.transport}</span>
                            <small>{server.transport} · {server.enabled ? "enabled" : "disabled"}</small>
                            <div className="mini-actions">
                              <button disabled={mcpBusyServer === server.name} type="button" onClick={() => void testMcpServer(server)}>
                                {mcpBusyServer === server.name ? t("settings.capabilities.testing") : t("settings.shared.test")}
                              </button>
                              <button type="button" onClick={() => editMcpServer(server)}>{t("settings.shared.edit")}</button>
                              <button disabled={capabilityBusy} type="button" onClick={() => void deleteMcpServer(server)}>{t("settings.shared.delete")}</button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">{t("settings.capabilities.mcpEmpty")}</p>
                      )}
                    </div>
                    {mcpTestResult && (
                      <div className={`mcp-test-result ${mcpTestResult.result.success ? "success" : "failed"}`}>
                        <div className="mcp-test-head">
                          <strong>{mcpTestResult.name}</strong>
                          <span>{mcpTestResult.result.success ? "test passed" : "test failed"}</span>
                        </div>
                        {mcpTestResult.result.tools.length > 0 ? (
                          <div className="mcp-tool-list">
                            {mcpTestResult.result.tools.map((tool) => (
                              <article key={tool.name}>
                                <strong>{tool.name}</strong>
                                {tool.description && <span>{tool.description}</span>}
                              </article>
                            ))}
                          </div>
                        ) : (
                          <p className="empty-note">{t("settings.capabilities.noTools")}</p>
                        )}
                        {mcpTestResult.result.output && <pre>{mcpTestResult.result.output}</pre>}
                      </div>
                    )}
                    <div className="mcp-catalog-panel">
                      <div className="mcp-catalog-head">
                        <div>
                          <strong>MCP Catalog</strong>
                          <span>{mcpCatalog.length} entries</span>
                        </div>
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void refreshMcpCatalog()}>
                          <RefreshCw size={14} />
                          <span>{t("settings.capabilities.refreshCatalog")}</span>
                        </button>
                      </div>
                      <div className="session-search">
                        <Search size={14} />
                        <input
                          value={mcpCatalogQuery}
                          onChange={(event) => setMcpCatalogQuery(event.target.value)}
                          placeholder={t("settings.capabilities.searchCatalogPlaceholder")}
                        />
                        <button type="button" onClick={() => setMcpCatalogQuery("")}>
                          <StopCircle size={13} />
                        </button>
                      </div>
                      {mcpCatalogError && <p className="warning-text">{t("settings.capabilities.catalogCmdFailed", { error: mcpCatalogError })}</p>}
                      {mcpCatalogDiagnostics.map((item) => (
                        <p className="empty-note" key={item}>{item}</p>
                      ))}
                      <div className="mcp-catalog-list">
                        {filteredMcpCatalog.length > 0 ? (
                          filteredMcpCatalog.map((entry) => (
                            <article className={`capability-card ${entry.enabled ? "enabled" : ""}`} key={entry.name}>
                              <strong>{entry.name}</strong>
                              <span>{entry.description || entry.source || "Hermes MCP catalog entry"}</span>
                              <small>
                                {entry.transport} · {entry.installed ? "installed" : "not installed"}
                                {entry.requiredEnv.length > 0 ? ` · env ${entry.requiredEnv.join(", ")}` : ""}
                              </small>
                              <div className="mini-actions">
                                <button
                                  disabled={mcpCatalogBusyName === entry.name || !entry.needsInstall}
                                  type="button"
                                  onClick={() => void installMcpCatalogEntry(entry)}
                                >
                                  {entry.installed ? t("settings.shared.installed") : mcpCatalogBusyName === entry.name ? t("settings.shared.installing") : t("settings.shared.install")}
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="empty-note">{t("settings.capabilities.catalogEmpty")}</p>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("skills", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Skills</p>
                    <h2>{t("settings.skills.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{skills.length} installed</span>
                    <span className="count-pill">{bundledSkills.length} bundled</span>
                  </div>
                </div>
                <div className="skill-manager">
                  <div className="skill-search">
                    <input
                      value={skillQuery}
                      onChange={(event) => setSkillQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void searchSkills();
                      }}
                      placeholder={t("settings.skills.searchPlaceholder")}
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void searchSkills()}>
                      <Search size={14} />
                      <span>{t("settings.skills.search")}</span>
                    </button>
                  </div>
                  <div className="skill-search">
                    <input
                      value={skillCatalogQuery}
                      onChange={(event) => setSkillCatalogQuery(event.target.value)}
                      placeholder={t("settings.skills.searchBundledPlaceholder")}
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}>
                      <RefreshCw size={14} />
                      <span>{t("common.refresh")}</span>
                    </button>
                  </div>
                  <div className="skill-install-form">
                    <input
                      value={skillInstallForm.sourcePath}
                      onChange={(event) => setSkillInstallForm((current) => ({ ...current, sourcePath: event.target.value }))}
                      placeholder="/path/to/skill-dir"
                    />
                    <input
                      value={skillInstallForm.category}
                      onChange={(event) => setSkillInstallForm((current) => ({ ...current, category: event.target.value }))}
                      placeholder="category"
                    />
                    <input
                      value={skillInstallForm.name}
                      onChange={(event) => setSkillInstallForm((current) => ({ ...current, name: event.target.value }))}
                      placeholder={t("settings.skills.nameOptional")}
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void installSkillFromForm()}>
                      <FolderPlus size={14} />
                      <span>{t("settings.shared.install")}</span>
                    </button>
                  </div>
                </div>

                <div className="skills-split">
                  <div>
                    <h3>Installed Skills</h3>
                    <div className="mini-list skills-list">
                      {skills.length > 0 ? (
                        skills.map((skill) => (
                          <article key={skill.path}>
                            <div>
                              <strong>{skill.name}</strong>
                              <span>{skill.category}/{skill.dirName}{skill.description ? ` · ${skill.description}` : ""}</span>
                              <small>{skill.path}</small>
                            </div>
                            <div className="mini-actions">
                              <button disabled={skillBusy} type="button" onClick={() => void openSkillDetail(skill)}>
                                {t("settings.shared.detail")}
                              </button>
                              <button disabled={skillBusy} type="button" onClick={() => void deleteSkill(skill)}>
                                {t("settings.shared.delete")}
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">{t("settings.skills.installedEmpty")}</p>
                      )}
                    </div>
                  </div>

                  <div>
                    <h3>Bundled Skills</h3>
                    <div className="mini-list skills-list">
                      {filteredBundledSkills.length > 0 ? (
                        filteredBundledSkills.map((skill) => (
                          <article className={skill.installed ? "installed" : ""} key={skill.path}>
                            <div>
                              <strong>{skill.name}</strong>
                              <span>{skill.category}/{skill.dirName}{skill.description ? ` · ${skill.description}` : ""}</span>
                              <small>{skill.installed ? "installed" : skill.source}</small>
                            </div>
                            <div className="mini-actions">
                              <button disabled={skillBusy} type="button" onClick={() => void openSkillDetail(skill)}>
                                {t("settings.shared.detail")}
                              </button>
                              <button disabled={skillBusy || skill.installed} type="button" onClick={() => void installBundledSkill(skill)}>
                                {skill.installed ? t("settings.shared.installed") : t("settings.shared.install")}
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">{t("settings.skills.bundledEmpty")}</p>
                      )}
                    </div>
                  </div>
                </div>

                {skillDetail && (
                  <div className="skill-detail-panel">
                    <div className="skill-detail-head">
                      <div>
                        <strong>{skillDetail.name}</strong>
                        <span>{skillDetail.category}/{skillDetail.dirName}</span>
                      </div>
                      <button className="refresh-runtime" type="button" onClick={() => {
                        setSkillDetail(null);
                        setSkillDetailContent("");
                      }}>
                        <span>{t("common.close")}</span>
                      </button>
                    </div>
                    <pre>{skillDetailContent || t("settings.skills.skillContentEmpty")}</pre>
                  </div>
                  )}
              </section>

              <section className={settingsCardClass("memory", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Memory</p>
                    <h2>{t("settings.memory.title")}</h2>
                  </div>
                </div>
                {memoryDetails && memorySummary ? (
                  <div className="memory-editor">
                    <div className="settings-rows memory-summary-grid">
                      <StatusRow label="MEMORY.md" value={t("settings.memory.entriesValue", { count: memorySummary.memoryEntries, chars: memoryDetails.memory.charCount, limit: memoryDetails.memory.charLimit })} ok={memorySummary.memoryExists} />
                      <StatusRow label="USER.md" value={`${memoryDetails.user.charCount}/${memoryDetails.user.charLimit} chars`} ok={memorySummary.userExists} />
                      <StatusRow label="state.db" value={`${memoryDetails.stats.totalSessions} sessions · ${memoryDetails.stats.totalMessages} messages`} ok />
                    </div>

                    <div className="memory-entry-compose">
                      <textarea
                        value={newMemoryEntry}
                        onChange={(event) => setNewMemoryEntry(event.target.value)}
                        placeholder={t("settings.memory.newEntryPlaceholder")}
                      />
                      <div className="memory-entry-compose-actions">
                        <span>{newMemoryEntry.length} chars</span>
                        <button
                          className="refresh-runtime"
                          disabled={capabilityBusy || !newMemoryEntry.trim()}
                          type="button"
                          onClick={() => void addMemoryEntryFromDraft()}
                        >
                          <Plus size={14} />
                          <span>{t("settings.memory.addMemory")}</span>
                        </button>
                      </div>
                    </div>

                    <div className="memory-entry-list">
                      {(memoryDetails.memory.entries ?? []).length > 0 ? (
                        (memoryDetails.memory.entries ?? []).map((entry) => {
                          const editing = editingMemoryIndex === entry.index;
                          return (
                            <article className="memory-entry-card" key={entry.index}>
                              {editing ? (
                                <>
                                  <textarea
                                    value={editingMemoryDraft}
                                    onChange={(event) => setEditingMemoryDraft(event.target.value)}
                                  />
                                  <div className="memory-entry-actions">
                                    <span>{editingMemoryDraft.length} chars</span>
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveEditingMemoryEntry()}>
                                      <Save size={14} />
                                      <span>{t("common.save")}</span>
                                    </button>
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => {
                                      setEditingMemoryIndex(null);
                                      setEditingMemoryDraft("");
                                    }}>
                                      <span>{t("common.cancel")}</span>
                                    </button>
                                  </div>
                                </>
                              ) : (
                                <>
                                  <p>{entry.content}</p>
                                  <div className="memory-entry-actions">
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => {
                                      setEditingMemoryIndex(entry.index);
                                      setEditingMemoryDraft(entry.content);
                                    }}>
                                      <Settings size={14} />
                                      <span>{t("settings.shared.edit")}</span>
                                    </button>
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => {
                                      if (window.confirm(t("settings.memory.confirmDeleteEntry"))) {
                                        void deleteMemoryEntry(entry.index);
                                      }
                                    }}>
                                      <Trash2 size={14} />
                                      <span>{t("settings.shared.delete")}</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </article>
                          );
                        })
                      ) : (
                        <p className="empty-note">{t("settings.memory.entriesEmpty")}</p>
                      )}
                    </div>

                    <div className="memory-raw-grid">
                      <label>
                        <span>{t("settings.memory.rawTitle")}</span>
                        <textarea
                          value={memoryDraft.memory}
                          onChange={(event) => setMemoryDraft((current) => ({ ...current, memory: event.target.value }))}
                          placeholder="MEMORY.md"
                        />
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMemoryDraft("memory")}>
                          <Save size={14} />
                          <span>{t("settings.memory.saveMemory")}</span>
                        </button>
                      </label>
                      <label>
                        <span>USER.md Profile</span>
                        <textarea
                          value={memoryDraft.user}
                          onChange={(event) => setMemoryDraft((current) => ({ ...current, user: event.target.value }))}
                          placeholder="USER.md"
                        />
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMemoryDraft("user")}>
                          <Save size={14} />
                          <span>{t("settings.memory.saveUser")}</span>
                        </button>
                      </label>
                    </div>
                    {memoryContent && <p className="empty-note">{memoryContent.memoryPath}</p>}

                    <div className="memory-raw-grid">
                      <label>
                        <span>Persona (SOUL.md)</span>
                        <textarea
                          value={personaDraft}
                          onChange={(event) => setPersonaDraft(event.target.value)}
                          placeholder={t("settings.memory.personaPlaceholder")}
                        />
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void savePersonaDraft()}>
                          <Save size={14} />
                          <span>{t("settings.memory.savePersona")}</span>
                        </button>
                      </label>
                    </div>
                    {personaContent && <p className="empty-note">{personaContent.path}</p>}

                    <div className="memory-providers">
                      <div className="memory-providers-head">
                        <h3>{t("settings.memory.providersTitle")}</h3>
                        <p className="empty-note">
                          {t("settings.memory.providersDescPre")}<code>memory.provider</code>{t("settings.memory.providersDescPost")}
                          {memoryProviders?.activeProvider
                            ? t("settings.memory.providersActive", { name: memoryProviders.activeProvider })
                            : t("settings.memory.providersInactive")}
                        </p>
                      </div>
                      {memoryProviders && !memoryProviders.pluginsDirExists && (
                        <p className="empty-note">
                          {t("settings.memory.pluginDirMissing", { dir: memoryProviders.pluginsDir })}
                        </p>
                      )}
                      {memoryProviders && memoryProviders.providers.length > 0 ? (
                        <div className="memory-providers-grid">
                          {memoryProviders.providers.map((provider: MemoryProviderInfo) => {
                            const statusLabel = provider.active
                              ? t("settings.shared.activated")
                              : !provider.installed
                                ? t("settings.memory.statusNotInstalled")
                                : provider.configured
                                  ? t("settings.memory.statusActivatable")
                                  : t("settings.memory.statusNeedKey");
                            return (
                              <article
                                className={`memory-provider-card${provider.active ? " memory-provider-active" : ""}`}
                                key={provider.name}
                              >
                                <div className="memory-provider-card-head">
                                  <div>
                                    <strong>{provider.label}</strong>
                                    <span className={`memory-provider-status memory-provider-status-${provider.active ? "active" : provider.installed ? (provider.configured ? "ready" : "needs") : "missing"}`}>
                                      {statusLabel}
                                    </span>
                                  </div>
                                  {provider.website && (
                                    <button
                                      className="refresh-runtime"
                                      type="button"
                                      title={t("settings.memory.openWebsite")}
                                      onClick={() => void openExternalUrl(provider.website ?? "")}
                                    >
                                      <ExternalLink size={13} />
                                    </button>
                                  )}
                                </div>
                                <p className="memory-provider-desc">{provider.description}</p>
                                {provider.envVars.length > 0 && (
                                  <div className="memory-provider-env">
                                    {provider.envVars.map((envVar) => (
                                      <label key={envVar.key}>
                                        <span>
                                          {envVar.key}
                                          <span className={`memory-provider-env-flag${envVar.present ? " present" : ""}`}>
                                            {envVar.present ? t("settings.shared.configured") : t("settings.shared.notConfigured")}
                                          </span>
                                        </span>
                                        <div className="memory-provider-env-row">
                                          <input
                                            type="password"
                                            value={memoryProviderEnvDraft[envVar.key] ?? ""}
                                            placeholder={envVar.present ? t("settings.memory.envWrittenPlaceholder") : t("settings.memory.envInputPlaceholder", { key: envVar.key })}
                                            onChange={(event) =>
                                              setMemoryProviderEnvDraft((current) => ({
                                                ...current,
                                                [envVar.key]: event.target.value,
                                              }))
                                            }
                                          />
                                          <button
                                            className="refresh-runtime"
                                            type="button"
                                            disabled={memoryProviderBusy !== null || (memoryProviderEnvDraft[envVar.key] ?? "").trim() === ""}
                                            onClick={() => void saveMemoryProviderEnv(envVar.key)}
                                          >
                                            <Save size={13} />
                                            <span>{t("common.save")}</span>
                                          </button>
                                        </div>
                                      </label>
                                    ))}
                                  </div>
                                )}
                                <div className="memory-provider-actions">
                                  {provider.active ? (
                                    <button
                                      className="refresh-runtime"
                                      type="button"
                                      disabled={memoryProviderBusy !== null}
                                      onClick={() => void deactivateMemoryProvider()}
                                    >
                                      <span>{memoryProviderBusy === "__deactivate__" ? t("settings.memory.deactivating") : t("settings.memory.deactivate")}</span>
                                    </button>
                                  ) : (
                                    <button
                                      className="refresh-runtime"
                                      type="button"
                                      disabled={memoryProviderBusy !== null}
                                      onClick={() => void activateMemoryProvider(provider.name)}
                                    >
                                      <span>{memoryProviderBusy === provider.name ? t("settings.memory.activating") : t("settings.shared.activate")}</span>
                                    </button>
                                  )}
                                </div>
                              </article>
                            );
                          })}
                        </div>
                      ) : (
                        <p className="empty-note">{t("settings.memory.providersEmpty")}</p>
                      )}
                    </div>
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.memory.summaryEmpty")}</p>
                )}
              </section>

              <section className={settingsCardClass("update", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Update</p>
                    <h2>{t("settings.update.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <button className="refresh-runtime" disabled={updateBusy} type="button" onClick={() => void checkUpdatesNow()}>
                      <RefreshCw size={14} />
                      <span>{updateBusy ? t("settings.update.checking") : t("settings.update.checkDesktop")}</span>
                    </button>
                    <button className="refresh-runtime" disabled={updateBusy} type="button" onClick={() => void runHermesUpdateNow()}>
                      <Upload size={14} />
                      <span>{updateBusy ? t("settings.update.running") : t("settings.update.runHermesUpdate")}</span>
                    </button>
                  </div>
                </div>
                {updateStatus ? (
                  <div className="update-panel">
                    <div className="settings-rows">
                      <StatusRow label="App Version" value={updateStatus.appVersion} ok />
                      <StatusRow
                        label={t("settings.update.latestVersion")}
                        value={updateStatus.latestVersion ?? (updateStatus.checked ? t("settings.update.unknown") : t("settings.update.notChecked"))}
                        ok={!updateStatus.updateAvailable && updateStatus.checkOk}
                      />
                      <StatusRow label="Hermes CLI" value={updateStatus.hermesVersion ?? t("settings.shared.notFound")} ok={Boolean(updateStatus.hermesVersion)} />
                      <StatusRow label="Last Check" value={formatTime(updateStatus.lastCheckedAt)} ok />
                      <StatusRow label="Update Log" value={updateStatus.logPath} ok />
                    </div>
                    <label className="settings-field">
                      <span>
                        <strong>{t("settings.update.releaseSource")}</strong>
                        <small>{t("settings.update.releaseSourceHint")}</small>
                      </span>
                      <div className="settings-inline-input">
                        <input
                          value={releaseRepoDraft}
                          type="text"
                          spellCheck={false}
                          placeholder="owner/repo"
                          onChange={(event) => setReleaseRepoDraft(event.target.value)}
                          onBlur={() => void saveReleaseRepo()}
                        />
                        <button
                          className="refresh-runtime"
                          disabled={updateBusy || !releaseRepoDraft.trim() || releaseRepoDraft.trim() === updateStatus.releaseRepo}
                          type="button"
                          onClick={() => void saveReleaseRepo()}
                        >
                          <Save size={14} />
                          <span>{t("common.save")}</span>
                        </button>
                      </div>
                    </label>
                    <label className="settings-toggle-row">
                      <span>
                        <strong>{t("settings.update.autoCheck")}</strong>
                        <small>{t("settings.update.autoCheckHint")}</small>
                      </span>
                      <input
                        checked={updateStatus.autoCheck}
                        type="checkbox"
                        onChange={(event) => void toggleAutoCheck(event.target.checked)}
                      />
                    </label>
                    <label className="settings-toggle-row">
                      <span>
                        <strong>Auto upgrade</strong>
                        <small>{t("settings.update.autoUpgradeHint")}</small>
                      </span>
                      <input
                        checked={updateStatus.autoUpgrade}
                        type="checkbox"
                        onChange={(event) => void toggleAutoUpgrade(event.target.checked)}
                      />
                    </label>
                    <p className="empty-note">{updateStatus.message}</p>
                    {updateStatus.checked && (
                      <button
                        className="refresh-runtime"
                        type="button"
                        disabled={updateBusy}
                        onClick={() => setUpdateDialogOpen(true)}
                      >
                        <RefreshCw size={14} />
                        <span>{t("settings.update.viewDetails")}</span>
                      </button>
                    )}
                    {updateOutput && <pre className="update-output">{updateOutput}</pre>}
                  </div>
                ) : (
                  <p className="empty-note">{t("settings.update.empty")}</p>
                )}
              </section>

              <section className={settingsCardClass("logs", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Logs</p>
                    <h2>{t("settings.logs.title")}</h2>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="refresh-runtime"
                      type="button"
                      disabled={bundleBusy}
                      onClick={() => void exportHermesBundle("backup")}
                    >
                      <Save size={14} />
                      <span>{bundleBusy ? t("settings.logs.exporting") : t("settings.logs.genBackup")}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      type="button"
                      disabled={bundleBusy}
                      onClick={() => void exportHermesBundle("debug")}
                    >
                      <Save size={14} />
                      <span>{bundleBusy ? t("settings.logs.exporting") : t("settings.logs.exportDiag")}</span>
                    </button>
                    <button className="refresh-runtime" disabled={logBusy} type="button" onClick={() => void refreshHermesLogs()}>
                      <RefreshCw size={14} />
                      <span>{logBusy ? t("common.loading") : t("settings.logs.refreshLogs")}</span>
                    </button>
                  </div>
                </div>
                <div className="restore-bundle-row">
                  <input
                    ref={restoreBackupInputRef}
                    className="restore-bundle-file"
                    type="file"
                    accept=".json,application/json"
                    onChange={onRestoreBackupFileChange}
                  />
                  <input
                    value={restoreBackupPath}
                    onChange={(event) => {
                      setRestoreBackupPath(event.target.value);
                      setRestoreBackupContent("");
                    }}
                    placeholder={t("settings.logs.pathPlaceholder")}
                  />
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={pickHermesBackupFile}
                    disabled={restoreBusy || bundleBusy || logBusy}
                  >
                    <FolderPlus size={14} />
                    <span>{t("settings.logs.pickFile")}</span>
                  </button>
                  <button
                    className="refresh-runtime"
                    disabled={restoreBusy || !canRestoreBackup || bundleBusy || logBusy}
                    type="button"
                    onClick={() => void restoreHermesBackup()}
                  >
                    <Upload size={14} />
                    <span>{restoreBusy ? t("settings.logs.restoring") : t("settings.logs.restoreBackup")}</span>
                  </button>
                </div>
                <p className="restore-bundle-hint">
                  {canRestoreBackup ? t("settings.logs.restoreSource", { hint: restoreSourceHint }) : t("settings.logs.restoreHint")}
                </p>
                <div className="log-viewer">
                  <div className="log-file-list">
                    {hermesLogs.length > 0 ? (
                      hermesLogs.map((log) => (
                        <button
                          className={selectedLogPath === log.path ? "selected" : ""}
                          key={log.path}
                          type="button"
                          onClick={() => void openHermesLog(log.path)}
                        >
                          <strong>{log.name}</strong>
                          <span>{formatFileSize(log.sizeBytes)} · {formatDateTime(log.modifiedAt)}</span>
                          <small>{log.path}</small>
                        </button>
                      ))
                    ) : (
                      <p className="empty-note">{t("settings.logs.logsEmpty")}</p>
                    )}
                  </div>
                  <div className="log-content-panel">
                    {logContent ? (
                      <>
                        <div className="log-content-head">
                          <div>
                            <strong>{logContent.name}</strong>
                            <span>{logContent.path}</span>
                          </div>
                          {logContent.truncated && <em>tail</em>}
                        </div>
                        <pre>{logContent.content || t("settings.logs.logEmpty")}</pre>
                      </>
                    ) : (
                      <p className="empty-note">{t("settings.logs.selectLog")}</p>
                    )}
                  </div>
                </div>
                {lastBundlePath && <p className="bundle-path">{t("settings.logs.exported", { path: lastBundlePath })}</p>}
              </section>
            </div>
          </>
        ) : activeView === "kanban" ? (
          <KanbanView
            profile={installStatus?.activeProfile}
            t={t}
            onNotice={setNotice}
          />
        ) : activeView === "multiagent" ? (
          <MultiAgentView
            state={state}
            sessions={sessions}
            t={t}
            onCancelTask={(taskId) => void cancelTask(taskId)}
            onMergeChatRunBatch={mergeChatRunBatchToChat}
          />
        ) : activeView === "office" ? (
          <OfficeView profiles={profiles} state={state} t={t} />
        ) : activeView === "discover" ? (
          <DiscoverView
            installedSkills={skills}
            bundledSkills={bundledSkills}
            mcpCatalog={mcpCatalog}
            mcpServerNames={mcpServers.map((server) => server.name)}
            mcpCatalogError={mcpCatalogError}
            mcpCatalogDiagnostics={mcpCatalogDiagnostics}
            registryAgents={registryAgents}
            registryWorkflows={registryWorkflows}
            registryError={registryError}
            registryLoading={registryLoading}
            installedProfileNames={profiles.map((profile) => profile.name)}
            installedWorkflowIds={installedWorkflowIds}
            registryBusyId={registryBusyId}
            skillBusy={skillBusy}
            mcpCatalogBusyName={mcpCatalogBusyName}
            busy={capabilityBusy || registryLoading}
            onRefresh={() => {
              void refreshHermesCapabilities();
              void refreshRegistry(true);
            }}
            onInstallBundledSkill={(skill) => void installBundledSkill(skill)}
            onInstallMcpEntry={(entry) => void installMcpCatalogEntry(entry)}
            onInstallAgent={(item) => void installRegistryAgent(item)}
            onInstallWorkflow={(item) => void installRegistryWorkflow(item)}
            onReadSkillContent={(path) => readHermesSkillContent(path)}
            onFetchRegistryDetail={(kind, item) => fetchRegistryDetail(kind, item)}
          />
        ) : activeView === "sessions" ? (
          <SessionsView
            sessions={sessions}
            formatTime={formatTime}
            onNewChat={() => void createNewSession()}
            onRestore={(session) => void restoreSession(session)}
            onRefresh={() => void refreshLocalSessions()}
            onRename={(sessionId, title) => void renameSession(sessionId, title)}
            onDelete={(sessionId) => void deleteSession(sessionId)}
            onBulkDelete={(sessionIds) => void bulkDeleteSessions(sessionIds)}
            onTogglePin={(sessionId) => void togglePinSession(sessionId)}
            onMoveToFolder={(sessionId, folder) => void moveSessionToFolder(sessionId, folder)}
            onPickFolder={(sessionId) => void pickFolderForSession(sessionId)}
            desktopSessions={desktopSessions}
            desktopBusy={desktopSessionsBusy}
            onRefreshDesktopSessions={() => void refreshDesktopSessions()}
            onSearchDesktopSessions={searchDesktopSessions}
            onImportDesktopSession={(session) => void importDesktopSession(session)}
          />
        ) : (
          <>
        <ChatView
          title={chatTitle}
          description={chatDescription}
          notice={notice}
          messages={messages}
          draft={draft}
          draftAttachments={draftAttachments}
          queuedMessages={queuedMessages}
          isLoading={Boolean(activeTask)}
          activityText={activeRuntimeEvent?.detail}
          profiles={profiles}
          models={models}
          skills={skills}
          contextUsage={
            effectiveModel?.contextLength && tokenUsage?.promptTokens
              ? {
                  used: tokenUsage.promptTokens,
                  window: effectiveModel.contextLength,
                  cacheReadTokens: tokenUsage.cacheReadTokens,
                  cacheWriteTokens: tokenUsage.cacheWriteTokens,
                }
              : null
          }
          readiness={
            runtimeStatus.state === "unavailable"
              ? {
                  ok: false,
                  message: runtimeStatus.message || t("settings.chatReady.runtimeUnavailable"),
                  fixLabel: t("settings.chatReady.openSettings"),
                  onFix: () => {
                    setActiveView("settings");
                    setActiveSettingsPanel("overview");
                  },
                }
              : !effectiveModel?.model
                ? {
                    ok: false,
                    message: t("settings.chatReady.noModelWarn"),
                    fixLabel: t("settings.chatReady.configModel"),
                    onFix: () => {
                      setActiveView("settings");
                      setActiveSettingsPanel("models");
                    },
                  }
                : { ok: true }
          }
          onQuickAsk={() => {
            const text = draft.trim();
            if (!text) return;
            const prefixed = /^\/(?:btw|bg|background)\b/i.test(text) ? text : `/btw ${text}`;
            sendMessage(prefixed);
          }}
          currentProfile={currentChatProfile}
          contextFolder={chatBinding?.workDir ?? null}
          worktreeVisible={worktreeVisible}
          activeModel={effectiveModel}
          reasoningEffort={reasoningEffort}
          fastMode={fastMode}
          modelBusy={modelBusy}
          formatTime={formatTime}
          onDraftChange={setDraft}
          onAddAttachment={addDraftAttachment}
          onAttachFiles={(files) => void attachDroppedOrPastedFiles(files)}
          onPickAttachments={() => void pickDraftAttachments()}
          onRemoveAttachment={removeDraftAttachment}
          onRemoveQueuedMessage={removeQueuedMessage}
          onNewChat={() => void createNewSession()}
          onClearChat={clearChat}
          onPickContextFolder={() => void pickChatContextFolder()}
          onClearContextFolder={() => setChatContextFolder(null)}
          onToggleWorktree={() => setWorktreeVisible((value) => !value)}
          onSelectProfile={selectChatProfile}
          onSelectModel={(model) => selectSessionModel(model)}
          onSelectReasoningEffort={selectReasoningEffort}
          onToggleFastMode={() => void toggleFastMode()}
          onOpenModels={() => {
            setActiveView("settings");
            setActiveSettingsPanel("models");
          }}
          onSend={sendMessage}
          onStop={() => {
            if (activeTask) void cancelTask(activeTask.id);
          }}
          onRegenerateMessage={regenerateFromMessage}
          onBranchMessage={branchFromMessage}
          onAnswerClarify={answerClarify}
          workMode={taskWorkMode}
          workModeDisabled={Boolean(activeTask)}
          onWorkModeChange={setTaskWorkMode}
        />
        {destructivePrompt && (
          <DestructiveConfirmModal
            preview={destructivePrompt.content}
            onCancel={() => setDestructivePrompt(null)}
            onConfirm={confirmDestructiveSend}
          />
        )}
        {webPreviewUrl && (
          <WebPreviewPanel
            url={webPreviewUrl}
            onClose={() => setWebPreviewUrl(null)}
            onOpenExternal={(url) => {
              void openExternalUrl(url).catch((error) => setNotice(t("app.notice.openExternalBrowserFailed", { error: runtimeErrorMessage(error) })));
            }}
            onInspectElement={(payload) => {
              const block = formatInspectInjection(payload);
              setDraft((current) => (current.trim() ? `${current.replace(/\s+$/, "")}\n\n${block}\n` : `${block}\n`));
              setNotice(t("app.notice.pickedElementInjected"));
            }}
          />
        )}
          </>
        )}
      </section>

      {showArtifactPanel && (
        <ArtifactPanel
          artifacts={state.artifacts ?? []}
          workDir={chatBinding?.workDir ?? null}
          onArchive={(artifactId) => {
            setState((current) => archiveArtifact(current, artifactId));
          }}
        />
      )}

      {activeView === "team" && showInspector && (
      <aside className="inspector">
        <nav className="inspector-tabs" aria-label={t("settings.inspector.panelAria")}>
          {inspectorPanels.map((panel) => (
            <button
              className={activeInspectorPanel === panel.id ? "selected" : ""}
              key={panel.id}
              type="button"
              onClick={() => setActiveInspectorPanel(panel.id)}
            >
              {panel.label}
            </button>
          ))}
        </nav>

        <section className={inspectorSectionClass("agents")}>
          <div className="section-title">
            <BrainCircuit size={18} />
            <h2>{t("settings.inspector.agents")}</h2>
          </div>
          <div className="agent-list">
            {agents.map((agent) => {
              const binding = bindings.find((item) => item.agentId === agent.id);
              const currentProfile = binding?.hermesProfile ?? "default";
              const profile = profileByName.get(currentProfile);
              return (
                <article className="agent-card" key={agent.id}>
                  <div className="agent-card-head">
                    <span className="agent-dot" style={{ background: agent.color }} />
                    <div>
                      <strong>{agent.name}</strong>
                      <span>{agent.role}</span>
                    </div>
                  </div>
                  <p>{agent.prompt}</p>
                  <label className="agent-profile-row">
                    <Plug size={14} />
                    <select
                      aria-label={`${agent.name} Hermes profile`}
                      value={currentProfile}
                      onChange={(event) => updateAgentProfile(agent.id, event.target.value)}
                    >
                      {profileOptionsFor(profiles, currentProfile).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={profileStatusClass(profile, profiles.length > 0)}>
                    <AlertTriangle size={13} />
                    <span>{profileStatusText(profile, profiles.length > 0, t)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={inspectorSectionClass("dispatch")}>
          <div className="section-title">
            <GitBranch size={18} />
            <h2>{t("settings.inspector.dispatch")}</h2>
          </div>
          <div className="dispatch-summary">
            <CheckCircle2 size={18} />
            <div>
              <strong>{taskSummary(state, t) || (handoff.kind === "single" ? t("settings.inspector.fastHandoff") : t("settings.inspector.waitingDispatch"))}</strong>
              <span>
                {state.logs[0]
                  ? decisionLabel(state.logs[0].decision.type, t)
                  : handoff.kind === "single"
                  ? t("settings.inspector.nextHop", { name: handoff.targetNames[0] })
                  : t("settings.inspector.standby")}
              </span>
            </div>
          </div>
          <div className="task-action-list">
            {state.tasks
              .filter((task) => task.status === "running" || task.status === "pending")
              .slice(0, 4)
              .map((task) => {
                const agent = agents.find((item) => item.id === task.agentId);
                return (
                  <article className="task-action-card" key={task.id}>
                    <div>
                      <strong>{agent?.name ?? t("app.unknownAgent")}</strong>
                      <span>{task.status} · {task.instruction.slice(0, 54)}</span>
                    </div>
                    <button type="button" onClick={() => void cancelTask(task.id)}>
                      <StopCircle size={14} />
                      <span>{t("settings.inspector.abort")}</span>
                    </button>
                  </article>
                );
              })}
          </div>
        </section>

        <section className={inspectorSectionClass("sessions")}>
          <div className="section-title">
            <History size={18} />
            <h2>{t("settings.inspector.sessions")}</h2>
            <div className="section-title-actions">
              <button className="refresh-runtime" type="button" onClick={() => void createNewSession()}>
                <Plus size={14} />
                <span>{t("settings.inspector.newSession")}</span>
              </button>
            </div>
          </div>
          <div className="log-list">
            {sessions.length === 0 ? (
              <p className="empty-note">{t("settings.inspector.noSnapshot")}</p>
            ) : (
              sessions.slice(0, 4).map((session) => (
                <article className="log-card" key={session.id}>
                  <strong>{session.title}</strong>
                  <span>{formatTime(session.updatedAt)} · {session.messageCount} messages · {session.taskCount} tasks</span>
                  {session.contextFolder && (
                    <span className="session-context-folder" title={session.contextFolder}>
                      <FolderPlus size={12} />
                      {basename(session.contextFolder)}
                    </span>
                  )}
                  <button
                    type="button"
                    className="log-card-action"
                    onClick={() => void restoreSession(session)}
                  >
                    {t("settings.inspector.restoreThis")}
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className={inspectorSectionClass("runtime")}>
          <div className="section-title">
            <Activity size={18} />
            <h2>{t("settings.inspector.runtimeEvents")}</h2>
          </div>
          <div className="log-list">
            {runtimeEvents.length === 0 ? (
              <p className="empty-note">{t("settings.inspector.runtimeEmpty")}</p>
            ) : (
              runtimeEvents.slice(0, 5).map((event) => (
                <article className={`log-card runtime-event ${event.level}`} key={event.id}>
                  <strong>{event.label}</strong>
                  <span>{formatTime(event.createdAt)} · {event.taskId.slice(0, 18)}</span>
                  <p>{event.detail}</p>
                </article>
              ))
            )}
          </div>
        </section>

        <section className={inspectorSectionClass("logs")}>
          <div className="section-title">
            <Activity size={18} />
            <h2>{t("settings.inspector.dispatchLogs")}</h2>
          </div>
          <div className="log-list">
            {state.logs.length === 0 ? (
              <p className="empty-note">{t("settings.inspector.dispatchEmpty")}</p>
            ) : (
              state.logs.slice(0, 5).map((log) => (
                <article className="log-card" key={log.id}>
                  <strong>{decisionLabel(log.decision.type, t)}</strong>
                  <span>{formatTime(log.createdAt)} · {log.status}</span>
                  <p>{decisionDetail(log.decision, t)}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>
      )}

      <footer className="status-bar" aria-label={t("settings.statusbar.aria")}>
        <button
          type="button"
          className={`status-pill status-action status-${runtimeStatus.state}`}
          onClick={() => void refreshRuntime()}
          title={t("settings.statusbar.refreshTitle")}
        >
          <CircleDot size={12} />
          <span>{runtimeStatus.message}</span>
        </button>
        <span className="status-seg">
          <span className="status-key">profile</span>
          <span className="status-val">{profiles.find((item) => item.active)?.name ?? "—"}</span>
        </span>
        <span className="status-seg">
          <span className="status-key">model</span>
          <span className="status-val">
            {activeModel?.model
              ? `${activeModel.provider ? `${activeModel.provider}/` : ""}${activeModel.model}`
              : t("settings.shared.notConfigured")}
          </span>
        </span>
        <ContextUsageStat
          used={tokenUsage?.promptTokens ?? 0}
          window={activeModel?.contextLength ?? 0}
          cacheReadTokens={tokenUsage?.cacheReadTokens}
          cacheWriteTokens={tokenUsage?.cacheWriteTokens}
        />
        <span className="status-spacer" />
        <span className="status-seg" title={t("settings.statusbar.sessionDuration")}>
          <Clock size={12} className="status-ico" />
          <SessionTimer startedAt={sessionStartedAt} />
        </span>
        <button
          type="button"
          className="status-seg status-action"
          disabled={gatewayBusy}
          onClick={() => {
            if (installStatus?.gatewayRunning) void refreshRuntime({ autoStart: false });
            else void startGateway();
          }}
          title={installStatus?.gatewayRunning ? t("settings.statusbar.gatewayUpTitle") : t("settings.statusbar.gatewayDownTitle")}
        >
          <span className={`status-led ${installStatus?.gatewayRunning ? "on" : ""}`} />
          <span className="status-val">
            {gatewayBusy ? t("settings.statusbar.starting") : installStatus?.gatewayRunning ? "gateway up" : "gateway down"}
          </span>
        </button>
        <span className="status-tag" title={t("settings.statusbar.buildTitle")}>
          {buildLabel() || "Hermes Team"}
        </span>
      </footer>
      {showOnboarding && (
        <OnboardingFlow
          installStatus={installStatus}
          providers={providerRegistry}
          busy={onboardingBusy}
          onRecheck={async () => {
            await refreshInstallStatus();
          }}
          onConnectRemote={onboardingConnectRemote}
          onConnectSsh={onboardingConnectSsh}
          onConfigureModel={onboardingConfigureModel}
          onFinish={finishOnboarding}
          onSkip={finishOnboarding}
        />
      )}
      {detailProfileName && (() => {
        const detailProfile = profiles.find((item) => item.name === detailProfileName);
        if (!detailProfile) return null;
        return (
          <ProfileDetailModal
            profile={detailProfile}
            busy={profileBusy}
            onClose={() => setDetailProfileName(null)}
            onProfilesChanged={(next) => {
              if (next.length > 0) setProfiles(next);
            }}
            onRefresh={() => void refreshProfiles()}
            onActivate={(name, openChat) => {
              void activateProfile(name, openChat);
              if (openChat) setDetailProfileName(null);
            }}
            onDeleted={(name) => {
              const target = profiles.find((item) => item.name === name);
              if (target) {
                void deleteProfileByName(target, true);
              }
              setDetailProfileName(null);
            }}
          />
        );
      })()}
      {updateDialogOpen && updateStatus && (
        <UpdateDialog
          status={updateStatus}
          busy={updateBusy}
          onClose={() => setUpdateDialogOpen(false)}
          onRecheck={() => void checkUpdatesNow(true)}
          onOpenRelease={openReleaseLink}
        />
      )}
    </main>
  );
}
