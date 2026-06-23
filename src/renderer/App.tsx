import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CheckCircle2,
  CircleDot,
  GitBranch,
  FolderPlus,
  History,
  MessageSquareText,
  Plus,
  Power,
  Plug,
  RefreshCw,
  Save,
  Upload,
  Search,
  Settings,
  StopCircle,
  TerminalSquare,
  Trash2,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, type ChangeEvent } from "react";
import { classifyAssistantHandoff } from "../core/handoff";
import { parseMentions } from "../core/mention-parser";
import {
  appendSystemMessage,
  appendTask,
  completeTaskWithAgentMessage,
  cancelTaskWithSystemMessage,
  failTaskWithSystemMessage,
  handleUserMessage,
  markTaskRunning,
  type OrchestrationState,
} from "../core/orchestrator";
import { ParallelBatchTracker } from "../core/parallel-batch-tracker";
import { SerialChainTracker } from "../core/serial-chain-tracker";
import { seedAgents, seedBindings, seedMessages, seedWorkspace } from "../core/seed";
import type { MessageAttachment, WorkspaceMode } from "../core/types";
import { processDroppedOrPastedFiles } from "./attachmentProcessing";
import { ChatView } from "./ChatView";
import { SessionsView } from "./SessionsView";
import { SidebarRecentSessions } from "./SidebarRecentSessions";
import { useReasoningEffort } from "./useReasoningEffort";
import {
  addCredentialPoolEntry,
  activateHermesModel,
  buildSessionSummary,
  cancelHermesTask,
  deleteHermesTeamSession,
  discoverProviderModels,
  ensureHermesGateway,
  createHermesBackupFile,
  createHermesDebugDump,
  restoreHermesBackupFile,
  generateApiServerKey,
  getHermesModelConfig,
  getRemoteConnectionConfig,
  getRemoteConnectionStatus,
  inspectHermesInstall,
  installHermesSkill,
  isTauriRuntimeAvailable,
  listCredentialPool,
  listHermesLogs,
  listHermesMcpServers,
  listHermesModels,
  listHermesProfiles,
  listHermesSkills,
  listHermesToolsets,
  listProviderKeys,
  listenHermesAgentStream,
  loadHermesTeamSessions,
  loadHermesTeamState,
  probeHermesGateway,
  readHermesMemorySummary,
  readHermesLog,
  readHermesMemoryContent,
  removeCredentialPoolEntry,
  removeHermesMcpServer,
  removeHermesSkill,
  runHermesTaskStream,
  saveHermesMcpServer,
  saveHermesTeamSession,
  saveHermesTeamState,
  saveHermesModel,
  saveProviderKey,
  saveRemoteConnectionConfig,
  selectAttachmentFiles,
  selectContextFolder,
  removeHermesModel,
  searchHermesSkills,
  setHermesToolsetEnabled,
  startSshTunnel,
  stopHermesGateway,
  stopSshTunnel,
  testRemoteConnection,
  updateHermesTeamSessionTitle,
  writeHermesMemoryContent,
  TAURI_UNAVAILABLE_MESSAGE,
  type ActiveModelConfig,
  type CredentialPoolGroup,
  type HermesInstallStatus,
  type HermesLogContent,
  type HermesLogInfo,
  type HermesProfileInfo,
  type HermesRestoreResult,
  type RestoreHermesBackupInput,
  type HermesTeamSessionSummary,
  type InstalledSkillInfo,
  type McpServerInfo,
  type MemoryContent,
  type MemorySummary,
  type ProviderDiscoveryResult,
  type ProviderKeyInfo,
  type RemoteConnectionConfig,
  type RemoteConnectionStatus,
  type RuntimeStreamEvent,
  type SavedModel,
  type ToolsetInfo,
} from "../runtime/hermes-runtime";

type ActiveView = "team" | "sessions" | "settings";
type SettingsPanel = "overview" | "providers" | "models" | "gateway" | "capabilities" | "skills" | "memory" | "logs";
type InspectorPanel = "agents" | "dispatch" | "sessions" | "runtime" | "logs";
type ModelForm = {
  id?: string;
  name: string;
  provider: string;
  model: string;
  baseUrl: string;
  contextLength: string;
};
type ProviderKeyDrafts = Record<string, string>;
type PoolForm = {
  provider: string;
  apiKey: string;
  label: string;
};
type McpForm = {
  name: string;
  transport: "http" | "stdio";
  url: string;
  command: string;
  args: string;
  env: string;
  auth: string;
  enabled: boolean;
};
type SkillInstallForm = {
  sourcePath: string;
  category: string;
  name: string;
};
type RuntimeEvent = {
  id: string;
  taskId: string;
  label: string;
  detail: string;
  createdAt: number;
  level: "info" | "ok" | "warning";
};

const LEGACY_PRODUCT_RD_WORKSPACE_NAME = "产品研发协作室";
const LEGACY_AGENT_WORKSPACE_NAME = "Agent 编排工作区";
const LEGACY_PRODUCT_RD_WORKSPACE_DESCRIPTION = "用于把需求、设计、实现、验证放进同一个 Agent 团队流程。";
const LEGACY_AGENT_WORKSPACE_DESCRIPTION = "用于组织多个 Agent 的并行、串行与接力协作。";
const LEGACY_SEED_MESSAGE_CONTENTS = new Set([
  "@产品经理 帮我把这个想法拆成可执行的研发任务。",
  "我会先收敛目标、用户场景和验收标准，然后交给 @架构师 做模块边界设计。",
]);
const DEFAULT_WORKSPACE_NAME = seedWorkspace.name;
const DEFAULT_WORKSPACE_DESCRIPTION = seedWorkspace.description;

const emptyModelForm: ModelForm = {
  name: "",
  provider: "",
  model: "",
  baseUrl: "",
  contextLength: "",
};

const emptyPoolForm: PoolForm = {
  provider: "",
  apiKey: "",
  label: "",
};

const emptyMcpForm: McpForm = {
  name: "",
  transport: "http",
  url: "",
  command: "",
  args: "",
  env: "",
  auth: "",
  enabled: true,
};

const emptySkillInstallForm: SkillInstallForm = {
  sourcePath: "",
  category: "custom",
  name: "",
};

const defaultRemoteConnectionConfig: RemoteConnectionConfig = {
  mode: "local",
  remoteUrl: "http://127.0.0.1:8642",
  apiKey: "",
  ssh: {
    host: "",
    port: 22,
    username: "",
    keyPath: "",
    remotePort: 8642,
    localPort: 18642,
  },
};

function formatTime(timestamp: number): string {
  return new Intl.DateTimeFormat("zh-CN", {
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatDateTime(timestamp: number): string {
  if (!timestamp) return "unknown";
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(timestamp);
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function buildFreshOrchestrationState(workspaceMode: WorkspaceMode = "smart"): OrchestrationState {
  const baseTime = Date.now();
  const workspaceId = `workspace-${baseTime}`;
  const agentIdMap = new Map<string, string>();
  const agents = seedAgents.map((agent) => {
    const nextAgentId = `${agent.id}-${baseTime}`;
    agentIdMap.set(agent.id, nextAgentId);
    return {
      ...agent,
      id: nextAgentId,
      workspaceId,
    };
  });

  return {
    workspace: {
      ...seedWorkspace,
      id: workspaceId,
      mode: workspaceMode,
      defaultAgentId: seedWorkspace.defaultAgentId
        ? agentIdMap.get(seedWorkspace.defaultAgentId) ?? seedWorkspace.defaultAgentId
        : undefined,
    },
    agents,
    bindings: seedBindings.map((binding) => ({
      ...binding,
      agentId: agentIdMap.get(binding.agentId) ?? binding.agentId,
    })),
    messages: [],
    tasks: [],
    logs: [],
  };
}

function isScratchSession(state: OrchestrationState): boolean {
  return (
    state.messages.length === 0 &&
    state.tasks.every((task) => task.status !== "pending" && task.status !== "running")
  );
}

function hasActiveSessionTasks(state: OrchestrationState): boolean {
  return state.tasks.some((task) => task.status === "pending" || task.status === "running");
}

export function App() {
  const [state, setState] = useState<OrchestrationState>({
    workspace: seedWorkspace,
    agents: seedAgents,
    bindings: seedBindings,
    messages: seedMessages,
    tasks: [],
    logs: [],
  });
  const [mode, setModeState] = useState<WorkspaceMode>(seedWorkspace.mode);
  const [activeView, setActiveView] = useState<ActiveView>("team");
  const [activeSettingsPanel, setActiveSettingsPanel] = useState<SettingsPanel>("overview");
  const [activeInspectorPanel, setActiveInspectorPanel] = useState<InspectorPanel>("agents");
  const [draft, setDraft] = useState("");
  const [attachmentPathDraft, setAttachmentPathDraft] = useState("");
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>([]);
  const [worktreeVisible, setWorktreeVisible] = useState(false);
  const [notice, setNotice] = useState("编排核心已就绪。");
  const [sessions, setSessions] = useState<HermesTeamSessionSummary[]>([]);
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
  }>({ state: "checking", message: "正在探测 Hermes Gateway..." });
  const [remoteConfig, setRemoteConfig] = useState<RemoteConnectionConfig>(defaultRemoteConnectionConfig);
  const [remoteStatus, setRemoteStatus] = useState<RemoteConnectionStatus | null>(null);
  const [profiles, setProfiles] = useState<HermesProfileInfo[]>([]);
  const [installStatus, setInstallStatus] = useState<HermesInstallStatus | null>(null);
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [skills, setSkills] = useState<InstalledSkillInfo[]>([]);
  const [memorySummary, setMemorySummary] = useState<MemorySummary | null>(null);
  const [memoryContent, setMemoryContent] = useState<MemoryContent | null>(null);
  const [memoryDraft, setMemoryDraft] = useState({ memory: "", user: "" });
  const [skillQuery, setSkillQuery] = useState("");
  const [skillInstallForm, setSkillInstallForm] = useState<SkillInstallForm>(emptySkillInstallForm);
  const [models, setModels] = useState<SavedModel[]>([]);
  const [activeModel, setActiveModel] = useState<ActiveModelConfig | null>(null);
  const [modelForm, setModelForm] = useState<ModelForm>(emptyModelForm);
  const [providerKeys, setProviderKeys] = useState<ProviderKeyInfo[]>([]);
  const [providerKeyDrafts, setProviderKeyDrafts] = useState<ProviderKeyDrafts>({});
  const [credentialPool, setCredentialPool] = useState<CredentialPoolGroup[]>([]);
  const [poolForm, setPoolForm] = useState<PoolForm>(emptyPoolForm);
  const [mcpForm, setMcpForm] = useState<McpForm>(emptyMcpForm);
  const [providerDiscovery, setProviderDiscovery] = useState<ProviderDiscoveryResult | null>(null);
  const [modelBusy, setModelBusy] = useState(false);
  const [providerBusy, setProviderBusy] = useState(false);
  const [capabilityBusy, setCapabilityBusy] = useState(false);
  const [skillBusy, setSkillBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [gatewayBusy, setGatewayBusy] = useState(false);
  const [remoteBusy, setRemoteBusy] = useState(false);
  const [logBusy, setLogBusy] = useState(false);
  const [keyBusy, setKeyBusy] = useState(false);
  const [stateReady, setStateReady] = useState(false);
  const saveTimerRef = useRef<number | undefined>(undefined);
  const sessionsRef = useRef<HermesTeamSessionSummary[]>([]);
  const cancelledTaskIdsRef = useRef<Set<string>>(new Set());
  const parallelTrackerRef = useRef(new ParallelBatchTracker());
  const serialTrackerRef = useRef(new SerialChainTracker());
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
  const settingsPanels: Array<{ id: SettingsPanel; label: string }> = [
    { id: "overview", label: "概览" },
    { id: "providers", label: "Provider" },
    { id: "models", label: "Models" },
    { id: "gateway", label: "Gateway" },
    { id: "capabilities", label: "Capabilities" },
    { id: "skills", label: "Skills" },
    { id: "memory", label: "Memory" },
    { id: "logs", label: "Logs" },
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

  function addRuntimeEvent(event: Omit<RuntimeEvent, "id" | "createdAt">) {
    setRuntimeEvents((current) => [
      {
        id: `event-${Date.now()}-${Math.random().toString(16).slice(2)}`,
        createdAt: Date.now(),
        ...event,
      },
      ...current,
    ].slice(0, 20));
  }

  function handleStreamEvent(event: RuntimeStreamEvent) {
    if (event.kind === "start") {
      addRuntimeEvent({
        taskId: event.taskId,
        label: "stream",
        detail: "Hermes Gateway 已进入流式输出。",
        level: "info",
      });
      return;
    }
    if (event.kind === "error") {
      const message = event.message || "Hermes 流式输出失败。";
      addRuntimeEvent({
        taskId: event.taskId,
        label: "stream error",
        detail: message,
        level: "warning",
      });
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
    if (event.kind === "reasoning") {
      setState((current) => {
        const task = current.tasks.find((item) => item.id === event.taskId);
        if (!task || task.status === "cancelled") return current;
        const agent = current.agents.find((item) => item.id === task.agentId);
        const messageId = `reasoning-${event.taskId}`;
        const existing = current.messages.find((message) => message.id === messageId);
        const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
        if (!nextContent.trim()) return current;
        const nextMessage = {
          id: messageId,
          workspaceId: task.workspaceId,
          kind: "reasoning" as const,
          authorKind: "agent" as const,
          authorId: agent?.id,
          authorName: agent?.name ?? "Hermes",
          content: nextContent,
          createdAt: existing?.createdAt ?? Date.now(),
          replyToMessageId: task.triggerMessageId,
        };
        return {
          ...current,
          messages: existing
            ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
            : [...current.messages, nextMessage],
        };
      });
      return;
    }
    setState((current) => {
      const task = current.tasks.find((item) => item.id === event.taskId);
      if (!task || task.status === "cancelled") return current;
      const agent = current.agents.find((item) => item.id === task.agentId);
      const messageId = `stream-${event.taskId}`;
      const existing = current.messages.find((message) => message.id === messageId);
      const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
      const nextMessage = {
        id: messageId,
        workspaceId: task.workspaceId,
        authorKind: "agent" as const,
        authorId: agent?.id,
        authorName: agent?.name ?? "未知 Agent",
        content: nextContent || "正在生成...",
        createdAt: existing?.createdAt ?? Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      return {
        ...current,
        messages: existing
          ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
          : [...current.messages, nextMessage],
        tasks: event.kind === "done"
          ? current.tasks.map((item) =>
              item.id === task.id ? { ...item, status: "completed" as const, completedAt: Date.now() } : item,
            )
          : current.tasks,
      };
    });
    if (event.kind === "done") {
      addRuntimeEvent({
        taskId: event.taskId,
        label: "stream done",
        detail: "Hermes token 流式输出已完成。",
        level: "ok",
      });
    }
  }

  const refreshInstallStatus = async () => {
    if (!isTauriRuntimeAvailable()) {
      setInstallStatus(null);
      return null;
    }
    setInstallBusy(true);
    try {
      const status = await inspectHermesInstall();
      setInstallStatus(status);
      return status;
    } catch (error) {
      setInstallStatus(null);
      setNotice(`Hermes 安装检测失败：${runtimeErrorMessage(error)}`);
      return null;
    } finally {
      setInstallBusy(false);
    }
  };

  const refreshHermesCapabilities = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setToolsets([]);
      setMcpServers([]);
      setSkills([]);
      setMemorySummary(null);
      setMemoryContent(null);
      setMemoryDraft({ memory: "", user: "" });
      setModels([]);
      setActiveModel(null);
      setProviderKeys([]);
      setCredentialPool([]);
      return;
    }
    const targetProfile = profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;
    try {
      const [
        nextToolsets,
        nextMcpServers,
        nextSkills,
        nextMemory,
        nextMemoryContent,
        nextModels,
        nextActiveModel,
        nextProviderKeys,
        nextCredentialPool,
      ] = await Promise.all([
        listHermesToolsets({ profile: targetProfile }),
        listHermesMcpServers({ profile: targetProfile }),
        listHermesSkills({ profile: targetProfile }),
        readHermesMemorySummary({ profile: targetProfile }),
        readHermesMemoryContent({ profile: targetProfile }),
        listHermesModels(),
        getHermesModelConfig({ profile: targetProfile }),
        listProviderKeys({ profile: targetProfile }),
        listCredentialPool({ profile: targetProfile }),
      ]);
      setToolsets(nextToolsets);
      setMcpServers(nextMcpServers);
      setSkills(nextSkills);
      setMemorySummary(nextMemory);
      setMemoryContent(nextMemoryContent);
      setMemoryDraft({
        memory: nextMemoryContent.memory,
        user: nextMemoryContent.user,
      });
      setModels(nextModels);
      setActiveModel(nextActiveModel);
      setProviderKeys(nextProviderKeys);
      setCredentialPool(nextCredentialPool);
    } catch (error) {
      setNotice(`读取 Hermes 能力失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`读取 Hermes 日志失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`读取日志失败：${runtimeErrorMessage(error)}`);
    } finally {
      setLogBusy(false);
    }
  };

  const exportHermesBundle = async (kind: "backup" | "debug") => {
    if (!isTauriRuntimeAvailable()) {
      setNotice("当前非 Tauri 运行环境，不能导出文件。");
      return;
    }
    setBundleBusy(true);
    setNotice(`正在生成 Hermes ${kind === "backup" ? "备份" : "诊断"} 文件...`);
    try {
      const nextPath =
        kind === "backup" ? await createHermesBackupFile() : await createHermesDebugDump();
      setLastBundlePath(nextPath);
      setNotice(`已生成文件：${nextPath}`);
    } catch (error) {
      setNotice(`生成 ${kind === "backup" ? "备份" : "诊断"} 文件失败：${runtimeErrorMessage(error)}`);
    } finally {
      setBundleBusy(false);
    }
  };

  const restoreHermesBackup = async () => {
    if (!isTauriRuntimeAvailable()) {
      setNotice("当前非 Tauri 运行环境，不能恢复 Hermes 备份。");
      return;
    }
    const path = restoreBackupPath.trim();
    const hasUploadedContent = restoreBackupContent.trim().length > 0;
    if (!path && !hasUploadedContent) {
      setNotice("请输入要恢复的 Hermes 备份文件路径。");
      return;
    }
    const confirmed = window.confirm(
      "恢复将覆盖当前 Hermes 配置与会话状态（可通过导出先备份）。确认继续？",
    );
    if (!confirmed) {
      setNotice("已取消恢复操作。");
      return;
    }
    setRestoreBusy(true);
    setNotice("正在恢复 Hermes 备份...");
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
        `已恢复 Hermes 备份（${result.targetPath}）：恢复 ${result.restored} 项，跳过 ${result.skipped} 项。`,
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
      void refreshHermesLogs();
    } catch (error) {
      setNotice(`恢复 Hermes 备份失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRestoreBusy(false);
    }
  };

  const pickHermesBackupFile = () => {
    restoreBackupInputRef.current?.click();
  };

  const canRestoreBackup = restoreBackupContent.trim().length > 0 || restoreBackupPath.trim().length > 0;
  const restoreSourceHint = restoreBackupContent.trim().length > 0
    ? "本地上传内容（文本内存）"
    : restoreBackupPath.trim()
      ? `文件路径：${restoreBackupPath.trim()}`
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
        setNotice(`已选择备份文件：${file.name}`);
      })
      .catch((error) => {
        setNotice(`读取备份文件失败：${runtimeErrorMessage(error)}`);
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
    setRuntimeStatus({ state: "checking", message: "正在探测 Hermes Gateway..." });
    return getRemoteConnectionConfig()
      .then(async (connection) => {
        setRemoteConfig(connection);
        if (connection.mode !== "local") {
          const status = await testRemoteConnection(connection);
          setRemoteStatus(status);
          setRuntimeStatus({
            state: status.ok ? "ready" : "unavailable",
            message: `${status.mode} · ${status.baseUrl} · ${status.message}`,
          });
          return null;
        }
        return Promise.all([listHermesProfiles(), inspectHermesInstall().catch(() => null)])
      .then(([items, install]) => {
        setProfiles(items);
        setInstallStatus(install);
        const active = items.find((item) => item.active) ?? items[0];
        const profileName = active?.name ?? "default";
        return probeHermesGateway({ profile: profileName }).catch(async (error: unknown) => {
          if (!isConnectionRefused(error)) throw error;
          if (!autoStart) throw error;
          setRuntimeStatus({
            state: "checking",
            message: `${profileName} · Gateway 未运行，正在自动启动...`,
          });
          const started = await ensureHermesGateway({ profile: profileName });
          if (!started.ok) {
            throw new Error(
              started.logPath
                ? `${started.message} 日志：${started.logPath}`
                : started.message,
            );
          }
          return probeHermesGateway({ profile: profileName });
        });
        });
      })
      .then((result) => {
        if (!result) return;
        setRuntimeStatus({
          state: result.ok ? "ready" : "unavailable",
          message: `${result.profile} · ${result.baseUrl} · ${result.message}`,
        });
        void refreshHermesCapabilities(result.profile);
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
    let cancelled = false;
    if (!isTauriRuntimeAvailable()) {
      setStateReady(true);
      setRuntimeStatus({
        state: "unavailable",
        message: TAURI_UNAVAILABLE_MESSAGE,
      });
      setNotice("当前是浏览器预览，只能查看界面；真实 Agent 需要 Tauri 桌面运行。");
      return () => {
        cancelled = true;
      };
    }
    loadHermesTeamState()
      .then((saved) => {
        if (!cancelled && saved) {
          setState(normalizeLoadedState(saved));
          setModeState(saved.workspace.mode);
          setNotice("已恢复上次工作台状态。");
        }
      })
      .catch(() => {
        setNotice("编排核心已就绪。");
      })
      .finally(() => {
        if (cancelled) return;
        setStateReady(true);
        void refreshRemoteConnection();
        void loadHermesTeamSessions()
          .then((items) => setSessions(normalizeLoadedSessions(items)))
          .catch(() => undefined);
        void refreshRuntime();
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    sessionsRef.current = sessions;
  }, [sessions]);

  useEffect(() => {
    if (!stateReady) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void saveHermesTeamState(state).catch(() => undefined);
      if (state.messages.length > 0) {
        void saveHermesTeamSession(sessionSummaryForSave(state, sessionsRef.current))
          .then((items) => setSessions(normalizeLoadedSessions(items)))
          .catch(() => undefined);
      }
    }, 250);
    return () => window.clearTimeout(saveTimerRef.current);
  }, [state, stateReady]);

  useEffect(() => {
    if (!isTauriRuntimeAvailable()) return undefined;
    let disposed = false;
    let unlisten: (() => void) | undefined;
    void listenHermesAgentStream((event) => {
      if (!disposed) handleStreamEvent(event);
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
  }, []);

  const createNewSession = async () => {
    if (hasActiveSessionTasks(state)) {
      setActiveView("team");
      setActiveInspectorPanel("dispatch");
      setNotice("当前会话仍有运行中的 Agent，请先等待完成或终止任务后再新建会话。");
      return;
    }

    if (isScratchSession(state)) {
      setActiveView("team");
      setDraft("");
      setDraftAttachments([]);
      setAttachmentPathDraft("");
      setNotice("当前已经是空白新会话。");
      return;
    }

    const previousWorkspaceId = state.workspace.id;
    const nextState = buildFreshOrchestrationState(mode);

    parallelTrackerRef.current.clear(previousWorkspaceId);
    serialTrackerRef.current.clear(previousWorkspaceId);
    cancelledTaskIdsRef.current.clear();

    setModeState(nextState.workspace.mode);
    setState(nextState);
    setDraft("");
    setDraftAttachments([]);
    setAttachmentPathDraft("");
    setRuntimeEvents([]);
    setActiveView("team");
    setNotice("已打开新会话。发送第一条消息后会进入 Session 历史。");

    if (!isTauriRuntimeAvailable()) {
      return;
    }

    void saveHermesTeamState(nextState).catch(() => undefined);
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
    if (!session.state || !session.state.workspace) {
      setNotice("该会话缺少可恢复的状态。");
      return;
    }

    const previousWorkspaceId = state.workspace.id;
    const nextState = normalizeLoadedState(session.state);
    parallelTrackerRef.current.clear(previousWorkspaceId);
    serialTrackerRef.current.clear(previousWorkspaceId);
    cancelledTaskIdsRef.current.clear();

    setModeState(nextState.workspace.mode);
    setState(nextState);
    setDraft("");
    setDraftAttachments([]);
    setAttachmentPathDraft("");
    setRuntimeEvents([]);
    setActiveView("team");
    setNotice(`已恢复会话：${session.title}`);
  };

  const renameSession = async (sessionId: string, title: string) => {
    const trimmed = title.trim();
    if (!trimmed) {
      setNotice("Session 标题不能为空。");
      return;
    }
    const previous = sessionsRef.current;
    setSessions((current) =>
      current.map((session) =>
        session.id === sessionId ? { ...session, title: trimmed, titleEdited: true } : session,
      ),
    );
    try {
      const next = await updateHermesTeamSessionTitle(sessionId, trimmed);
      setSessions(normalizeLoadedSessions(next));
      setNotice("Session 标题已更新。");
    } catch (error) {
      setSessions(previous);
      setNotice(`重命名 Session 失败：${runtimeErrorMessage(error)}`);
    }
  };

  const deleteSession = async (sessionId: string) => {
    if (sessionId === state.workspace.id && hasActiveSessionTasks(state)) {
      setNotice("当前会话仍有运行中的 Agent，请先等待完成或终止任务后再删除。");
      return;
    }
    const previous = sessionsRef.current;
    setSessions((current) => current.filter((session) => session.id !== sessionId));
    try {
      const next = await deleteHermesTeamSession(sessionId);
      setSessions(normalizeLoadedSessions(next));
      if (sessionId === state.workspace.id) {
        const nextState = buildFreshOrchestrationState(mode);
        parallelTrackerRef.current.clear(state.workspace.id);
        serialTrackerRef.current.clear(state.workspace.id);
        cancelledTaskIdsRef.current.clear();
        setModeState(nextState.workspace.mode);
        setState(nextState);
        setDraft("");
        setDraftAttachments([]);
        setAttachmentPathDraft("");
        setRuntimeEvents([]);
        setActiveView("team");
        void saveHermesTeamState(nextState).catch(() => undefined);
      }
      setNotice("Session 已删除。");
    } catch (error) {
      setSessions(previous);
      setNotice(`删除 Session 失败：${runtimeErrorMessage(error)}`);
    }
  };

  const updateAgentProfile = (agentId: string, hermesProfile: string) => {
    setState((current) => ({
      ...current,
      bindings: current.bindings.map((binding) =>
        binding.agentId === agentId ? { ...binding, hermesProfile } : binding,
      ),
    }));
  };

  const profileOptionsFor = (currentProfile: string) => {
    const names = new Set(profiles.map((profile) => profile.name));
    names.add(currentProfile);
    return Array.from(names).sort((left, right) => {
      if (left === "default") return -1;
      if (right === "default") return 1;
      return left.localeCompare(right);
    });
  };

  const refreshRemoteConnection = async () => {
    if (!isTauriRuntimeAvailable()) return;
    try {
      const [config, status] = await Promise.all([
        getRemoteConnectionConfig(),
        getRemoteConnectionStatus().catch(() => null),
      ]);
      setRemoteConfig(config);
      setRemoteStatus(status);
    } catch (error) {
      setNotice(`读取远程连接配置失败：${runtimeErrorMessage(error)}`);
    }
  };

  const saveRemoteConfig = async () => {
    setRemoteBusy(true);
    try {
      const saved = await saveRemoteConnectionConfig(remoteConfig);
      setRemoteConfig(saved);
      const status = await getRemoteConnectionStatus().catch(() => null);
      setRemoteStatus(status);
      setNotice("远程连接配置已保存。");
      await refreshRuntime({ autoStart: saved.mode === "local" });
    } catch (error) {
      setNotice(`保存远程连接配置失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRemoteBusy(false);
    }
  };

  const testRemoteConfig = async () => {
    setRemoteBusy(true);
    try {
      const status = await testRemoteConnection(remoteConfig);
      setRemoteStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(`远程连接测试失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRemoteBusy(false);
    }
  };

  const connectSsh = async () => {
    setRemoteBusy(true);
    try {
      const status = await startSshTunnel(remoteConfig);
      setRemoteStatus(status);
      setRemoteConfig((current) => ({ ...current, mode: "ssh" }));
      setRuntimeStatus({
        state: status.ok ? "ready" : "unavailable",
        message: `${status.mode} · ${status.baseUrl} · ${status.message}`,
      });
      setNotice(status.message);
    } catch (error) {
      setNotice(`SSH 隧道启动失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRemoteBusy(false);
    }
  };

  const disconnectSsh = async () => {
    setRemoteBusy(true);
    try {
      const status = await stopSshTunnel();
      setRemoteStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(`停止 SSH 隧道失败：${runtimeErrorMessage(error)}`);
    } finally {
      setRemoteBusy(false);
    }
  };

  const startGateway = async (profileName?: string) => {
    const targetProfile =
      profileName ?? profiles.find((profile) => profile.active)?.name ?? profiles[0]?.name ?? "default";
    setGatewayBusy(true);
    setRuntimeStatus({
      state: "checking",
      message: `${targetProfile} · 正在启动 Hermes Gateway...`,
    });
    try {
      const result = await ensureHermesGateway({ profile: targetProfile });
      setRuntimeStatus({
        state: result.ok ? "ready" : "unavailable",
        message: `${result.profile} · ${result.baseUrl} · ${result.message}`,
      });
      setNotice(
        result.ok
          ? "Hermes Gateway 已就绪。"
          : result.logPath
          ? `Gateway 启动未完成，日志：${result.logPath}`
          : "Gateway 启动未完成。",
      );
      await refreshRuntime();
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setRuntimeStatus({ state: "unavailable", message });
      setNotice("Hermes Gateway 启动失败。");
      return false;
    } finally {
      setGatewayBusy(false);
    }
  };

  const stopGateway = async (profileName?: string) => {
    const targetProfile =
      profileName ?? profiles.find((profile) => profile.active)?.name ?? profiles[0]?.name ?? "default";
    setGatewayBusy(true);
    setRuntimeStatus({
      state: "checking",
      message: `${targetProfile} · 正在停止 Hermes Gateway...`,
    });
    try {
      const result = await stopHermesGateway({ profile: targetProfile });
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
      setNotice("Hermes Gateway 停止失败。");
      return false;
    } finally {
      setGatewayBusy(false);
    }
  };

  const createApiKey = async (profileName?: string) => {
    const targetProfile =
      profileName ?? profiles.find((profile) => profile.active)?.name ?? profiles[0]?.name ?? "default";
    setKeyBusy(true);
    setNotice(`${targetProfile} 正在生成 API_SERVER_KEY...`);
    try {
      const result = await generateApiServerKey({ profile: targetProfile });
      setNotice(result.message);
      if (result.ok) {
        setRuntimeStatus({
          state: "checking",
          message: `${targetProfile} · 正在重启 Gateway 以加载 API key...`,
        });
        await ensureHermesGateway({ profile: targetProfile, replace: true });
      }
      await refreshRuntime();
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setNotice(`生成 API_SERVER_KEY 失败：${message}`);
      return false;
    } finally {
      setKeyBusy(false);
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
      setNotice(`模型已保存：${saved.name}`);
      resetModelForm();
      await refreshHermesCapabilities(installStatus?.activeProfile);
    } catch (error) {
      setNotice(`保存模型失败：${runtimeErrorMessage(error)}`);
    } finally {
      setModelBusy(false);
    }
  };

  const deleteModel = async (model: SavedModel) => {
    setModelBusy(true);
    try {
      const removed = await removeHermesModel(model.id);
      setNotice(removed ? `模型已删除：${model.name}` : `未找到模型：${model.name}`);
      await refreshHermesCapabilities(installStatus?.activeProfile);
    } catch (error) {
      setNotice(`删除模型失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`已激活 ${model.name} 到 ${targetProfile}。`);
      if (runtimeStatus.state === "ready") {
        await ensureHermesGateway({ profile: targetProfile, replace: true });
        await refreshRuntime({ autoStart: false });
      } else {
        await refreshHermesCapabilities(targetProfile);
      }
    } catch (error) {
      setNotice(`激活模型失败：${runtimeErrorMessage(error)}`);
    } finally {
      setModelBusy(false);
    }
  };

  const selectChatProfile = (profileName: string) => {
    const agent = state.agents[0];
    if (!agent) return;
    updateAgentProfile(agent.id, profileName);
    setNotice(`聊天 Profile 已切换为 ${profileName}。`);
    void refreshHermesCapabilities(profileName);
  };

  const activateChatModel = async (model: SavedModel) => {
    const agent = state.agents[0];
    const binding = agent
      ? state.bindings.find((item) => item.agentId === agent.id)
      : undefined;
    const targetProfile = binding?.hermesProfile ?? "default";
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
      setNotice(`已激活 ${model.name} 到聊天 Profile「${targetProfile}」。`);
      if (runtimeStatus.state === "ready") {
        await ensureHermesGateway({ profile: targetProfile, replace: true });
        await refreshRuntime({ autoStart: false });
      }
      await refreshHermesCapabilities(targetProfile);
    } catch (error) {
      setNotice(`激活聊天模型失败：${runtimeErrorMessage(error)}`);
    } finally {
      setModelBusy(false);
    }
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
      setNotice(`${saved.label} API key 已保存到 ${targetProfile}。`);
      if (runtimeStatus.state === "ready") {
        await ensureHermesGateway({ profile: targetProfile, replace: true });
        await refreshRuntime({ autoStart: false });
      }
    } catch (error) {
      setNotice(`保存 Provider API key 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`Credential pool 已添加到 ${targetProfile}。`);
    } catch (error) {
      setNotice(`添加 Credential pool 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`Credential pool 已删除。`);
    } catch (error) {
      setNotice(`删除 Credential pool 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setProviderBusy(false);
    }
  };

  const diagnoseProvider = async (model?: SavedModel) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const provider = model?.provider ?? activeModel?.provider ?? "";
    const baseUrl = model?.baseUrl ?? activeModel?.baseUrl ?? "";
    if (!provider) {
      setNotice("当前没有可诊断的 provider。");
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
      setNotice(`Provider 诊断失败：${runtimeErrorMessage(error)}`);
    } finally {
      setDiscoveryBusy(false);
    }
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
      setNotice(`${toolset.label} 已${toolset.enabled ? "关闭" : "开启"}。`);
    } catch (error) {
      setNotice(`更新 Toolset 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`MCP server 已保存：${mcpForm.name}`);
    } catch (error) {
      setNotice(`保存 MCP server 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`MCP server 已删除：${server.name}`);
    } catch (error) {
      setNotice(`删除 MCP server 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setCapabilityBusy(false);
    }
  };

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
      setNotice(`${kind === "memory" ? "MEMORY.md" : "USER.md"} 已保存。`);
    } catch (error) {
      setNotice(`保存 Memory 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setCapabilityBusy(false);
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
      setNotice(skillQuery.trim() ? `Skills 搜索完成：${next.length} 个结果。` : `Skills 已刷新：${next.length} 个。`);
    } catch (error) {
      setNotice(`搜索 Skills 失败：${runtimeErrorMessage(error)}`);
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
      setSkillInstallForm(emptySkillInstallForm);
      setSkillQuery("");
      setNotice(`Skill 已安装到 ${targetProfile}。`);
    } catch (error) {
      setNotice(`安装 Skill 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`Skill 已删除：${skill.name}`);
    } catch (error) {
      setNotice(`删除 Skill 失败：${runtimeErrorMessage(error)}`);
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
    const path = (pathOverride ?? attachmentPathDraft).trim();
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
    if (!pathOverride) setAttachmentPathDraft("");
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
      setNotice(`已添加 ${selected.filter((item) => item.isFile).length} 个附件。`);
    } catch (error) {
      setNotice(`选择附件失败：${runtimeErrorMessage(error)}`);
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
        result.attachments.length > 0 ? `已添加 ${result.attachments.length} 个附件。` : "",
        ...result.errors,
      ].filter(Boolean);
      if (detail.length > 0) setNotice(detail.join(" "));
    } catch (error) {
      setNotice(`处理附件失败：${runtimeErrorMessage(error)}`);
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
    setNotice(path ? `Context folder 已设置：${path}` : "Context folder 已清除。");
    if (!path) setWorktreeVisible(false);
  };

  const pickChatContextFolder = async () => {
    try {
      const selected = await selectContextFolder();
      if (!selected) return;
      setChatContextFolder(selected.path);
    } catch (error) {
      setNotice(`选择 Context folder 失败：${runtimeErrorMessage(error)}`);
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
        reason: "用户主动终止",
      }),
    );
    addRuntimeEvent({
      taskId,
      label: "aborted",
      detail: "用户已终止任务，迟到的 Hermes 响应会被忽略。",
      level: "warning",
    });
    setNotice("任务已取消。");
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
        nextNotice = "串行链已推进到下一位 Agent。";
        return appended.state;
      }
      if (serialAdvance.kind === "last") {
        nextNotice = "串行链已完成。";
        return appendSystemMessage({
          state: current,
          content: "串行链已完成，所有步骤都已返回真实 Hermes 输出。",
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (serialAdvance.kind === "last_user_intervened") {
        nextNotice = "串行链因用户介入已静默收口。";
        return appendSystemMessage({
          state: current,
          content: "串行链已收口：用户介入后不再自动推进后续步骤。",
          replyToMessageId: task.triggerMessageId,
        });
      }

      const batchResult = parallelTrackerRef.current.markComplete(task.workspaceId, task.agentId);
      if (batchResult === "last") {
        nextNotice = "并行批次已汇合。";
        return appendSystemMessage({
          state: current,
          content: "并行批次已汇合，所有参与 Agent 都已完成真实 Hermes 输出。",
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (batchResult === "last_user_intervened") {
        nextNotice = "并行批次因用户介入已静默收口。";
        return appendSystemMessage({
          state: current,
          content: "并行批次已收口：用户介入后不再自动派发汇合后的下一步。",
          replyToMessageId: task.triggerMessageId,
        });
      }
      if (batchResult === "pending") {
        nextNotice = `${agent?.name ?? "Agent"} 已完成，等待并行批次其它成员。`;
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
      setNotice("当前会话仍有运行中的 Agent，请先停止任务后再清空。");
      return;
    }
    setState((current) => ({
      ...current,
      messages: [],
      tasks: [],
      logs: [],
    }));
    setDraft("");
    setDraftAttachments([]);
    setAttachmentPathDraft("");
    setRuntimeEvents([]);
    setNotice("当前会话已清空。");
  };

  const sendMessage = (contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim();
    if (!content && draftAttachments.length === 0) return;
    parallelTrackerRef.current.markUserIntervention(state.workspace.id);
    serialTrackerRef.current.markUserIntervention(state.workspace.id);
    const result = handleUserMessage(state, content || "请查看附件并处理。", draftAttachments);
    setState(result.state);
    setNotice(result.notice);
    setDraft("");
    setDraftAttachments([]);
    setAttachmentPathDraft("");
    const latestDecision = result.state.logs[0]?.decision;
    if (latestDecision?.type === "dispatch" && latestDecision.mode === "parallel") {
      parallelTrackerRef.current.start(
        result.state.workspace.id,
        latestDecision.assignments.map((assignment) => assignment.agentId),
      );
    }
    if (latestDecision?.type === "dispatch" && latestDecision.mode === "serial" && result.createdTaskIds[0]) {
      serialTrackerRef.current.start({
        workspaceId: result.state.workspace.id,
        triggerMessageId: result.state.tasks.find((task) => task.id === result.createdTaskIds[0])?.triggerMessageId ?? result.state.messages.at(-1)?.id ?? "",
        firstTaskId: result.createdTaskIds[0],
        assignments: latestDecision.assignments,
      });
    }
    for (const taskId of result.createdTaskIds) {
      void runDispatchedTask(result.state, taskId);
    }
  };

  const runDispatchedTask = async (baseState: OrchestrationState, taskId: string) => {
    const task = baseState.tasks.find((item) => item.id === taskId);
    if (!task) return;
    const agent = baseState.agents.find((item) => item.id === task.agentId);
    if (!agent) return;
    const binding = baseState.bindings.find((item) => item.agentId === agent.id);
    const profileName = binding?.hermesProfile ?? "default";
    const selectedProfile = profileByName.get(profileName);

    setState((current) => markTaskRunning(current, taskId));
    setNotice(`${agent.name} 正在通过真实 Hermes Runtime 执行...`);
    addRuntimeEvent({
      taskId,
      label: "running",
      detail: `${agent.name} 已开始调用 Hermes Gateway。`,
      level: "info",
    });

    try {
      if (profiles.length > 0 && !selectedProfile) {
        throw new Error(
          `Agent 绑定的 Hermes profile「${profileName}」未在本机发现。请刷新 Runtime 或重新选择 profile。`,
        );
      }
      if (selectedProfile && !selectedProfile.hasApiKey) {
        const created = await createApiKey(profileName);
        if (!created) {
          throw new Error(`Hermes profile「${profileName}」没有 API_SERVER_KEY，无法执行真实 Agent 任务。`);
        }
      }
      if (runtimeStatus.state !== "ready") {
        setNotice(`${agent.name} 等待 Hermes Gateway 启动...`);
        const ready = await startGateway(profileName);
        if (!ready) {
          throw new Error("Hermes Gateway 未就绪，无法执行真实 Agent 任务。");
        }
      }
      const content = await runHermesTaskStream({
        task,
        agent,
        binding,
        messages: baseState.messages,
      });
      if (cancelledTaskIdsRef.current.has(taskId)) {
        addRuntimeEvent({
          taskId,
          label: "ignored",
          detail: `${agent.name} 返回了迟到响应，因任务已取消未写入消息流。`,
          level: "warning",
        });
        return;
      }
      setState((current) => {
        const streamMessageId = `stream-${taskId}`;
        const hasStreamMessage = current.messages.some((message) => message.id === streamMessageId);
        if (!hasStreamMessage) {
          return completeTaskWithAgentMessage({
            state: current,
            taskId,
            content,
          });
        }
        return {
          ...current,
          tasks: current.tasks.map((item) =>
            item.id === taskId ? { ...item, status: "completed", completedAt: Date.now() } : item,
          ),
        };
      });
      addRuntimeEvent({
        taskId,
        label: "completed",
        detail: `${agent.name} 已完成流式 Hermes 输出。`,
        level: "ok",
      });
      setNotice(`${agent.name} 已返回真实 Hermes 输出。`);
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
                reason: "用户主动终止",
              }),
        );
        addRuntimeEvent({
          taskId,
          label: "aborted",
          detail: `${agent.name} 的运行请求已取消。`,
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
      setNotice("Hermes Runtime 调用失败。");
    }
  };

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
  const chatTitle = scratchSession ? "新建聊天" : "Hermes Chat";
  const chatDescription = scratchSession
    ? "输入消息开始一次新的 Hermes 聊天。"
    : seedWorkspace.description;
  const activeTask = state.tasks.find((task) => task.status === "running" || task.status === "pending");
  const chatAgent = state.agents[0];
  const chatBinding = chatAgent
    ? state.bindings.find((binding) => binding.agentId === chatAgent.id)
    : undefined;
  const currentChatProfile = chatBinding?.hermesProfile ?? "default";
  const { reasoningEffort, setReasoningEffort } = useReasoningEffort(currentChatProfile);
  const selectReasoningEffort = async (value: typeof reasoningEffort) => {
    await setReasoningEffort(value);
    setNotice(`Reasoning effort 已保存到聊天 Profile「${currentChatProfile}」：${value}。`);
  };
  const activeRuntimeEvent = activeTask
    ? runtimeEvents.find((event) => event.taskId === activeTask.id)
    : undefined;
  const activeRuntimeEvents = activeTask
    ? runtimeEvents
        .filter((event) => event.taskId === activeTask.id)
        .slice(0, 6)
        .reverse()
    : [];

  return (
    <main className={`app-shell ${activeView !== "team" || !showInspector ? "app-shell-utility" : ""}`}>
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">HT</div>
          <div>
            <strong>Hermes Team</strong>
            <span>Hermes Desktop 迁移版</span>
          </div>
        </div>

        <nav className="workspace-list" aria-label="主导航">
          <button
            className={`workspace-item workspace-new-chat ${
              activeView === "team" && scratchSession ? "active" : ""
            }`}
            type="button"
            onClick={() => void createNewSession()}
            title="新建聊天"
            aria-label="新建聊天"
          >
            <Plus size={18} />
            <span>新建聊天</span>
          </button>
          <button
            className={`workspace-item ${
              activeView === "team" && !scratchSession ? "active" : ""
            }`}
            type="button"
            onClick={() => setActiveView("team")}
          >
            <MessageSquareText size={18} />
            <span>聊天</span>
          </button>
          <button
            className={`workspace-item ${activeView === "settings" ? "active" : ""}`}
            type="button"
            onClick={() => {
              setActiveView("settings");
              void refreshInstallStatus();
              void refreshHermesCapabilities();
              void refreshHermesLogs();
            }}
          >
            <Settings size={18} />
            <span>设置</span>
          </button>
        </nav>

        <SidebarRecentSessions
          sessions={sessions}
          formatTime={formatTime}
          onRestore={(session) => void restoreSession(session)}
          onShowAll={() => setActiveView("sessions")}
        />

        {false && (
        <section className="sidebar-panel">
          <p className="panel-label">当前模式</p>
          <div className="mode-toggle">
            <button
              className={mode === "smart" ? "selected" : ""}
              type="button"
              onClick={() => setMode("smart")}
            >
              智能协作
            </button>
            <button
              className={mode === "manual" ? "selected" : ""}
              type="button"
              onClick={() => setMode("manual")}
            >
              手动
            </button>
          </div>
        </section>
        )}

        <section className="sidebar-panel">
          <p className="panel-label">Hermes Runtime</p>
          <div className={`runtime-badge ${runtimeStatus.state}`}>
            <CircleDot size={14} />
            <span>{runtimeStatus.message}</span>
          </div>
          <button className="refresh-runtime" type="button" onClick={() => void refreshRuntime()}>
            <RefreshCw size={14} />
            <span>刷新 Runtime</span>
          </button>
          <button
            className="refresh-runtime"
            disabled={gatewayBusy}
            type="button"
            onClick={() => void startGateway()}
          >
            <Plug size={14} />
            <span>{gatewayBusy ? "启动中..." : "启动 Gateway"}</span>
          </button>
          <button
            className="refresh-runtime"
            disabled={keyBusy}
            type="button"
            onClick={() => void createApiKey()}
          >
            <Settings size={14} />
            <span>{keyBusy ? "生成中..." : "生成 API key"}</span>
          </button>
          {profiles.length > 0 && (
            <div className="profile-list">
              {profiles.map((profile) => (
                <span className={profile.active ? "active" : ""} key={profile.name}>
                  {profile.name}
                  {profile.hasApiKey ? "" : " · no key"}
                </span>
              ))}
            </div>
          )}
        </section>
      </aside>

      <section className={`timeline ${activeView !== "team" ? "utility-view" : ""}`}>
        {activeView === "settings" ? (
          <>
            <header className="workspace-header">
              <div>
                <p className="panel-label">Settings</p>
                <h1>Hermes 运行环境</h1>
                <p>安装检测、profile 配置、API Server key 与 Gateway 进程状态。</p>
              </div>
              <div className="status-card">
                <TerminalSquare size={18} />
                <span>{installStatus?.installed ? "Hermes CLI 已发现" : "等待安装检测"}</span>
              </div>
            </header>

            <div className="settings-content">
              <nav className="settings-section-tabs" aria-label="设置分组">
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
                    <h2>安装检测</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={installBusy}
                    type="button"
                    onClick={() => void refreshInstallStatus()}
                  >
                    <RefreshCw size={14} />
                    <span>{installBusy ? "检测中..." : "重新检测"}</span>
                  </button>
                </div>
                {installStatus ? (
                  <div className="settings-rows">
                    <StatusRow label="Hermes CLI" value={installStatus.command ?? "未找到"} ok={installStatus.installed} />
                    <StatusRow label="版本" value={installStatus.version ?? "未返回"} ok={Boolean(installStatus.version)} />
                    <StatusRow label="Hermes Home" value={installStatus.hermesHome} ok />
                    <StatusRow label="当前 Profile" value={installStatus.activeProfile} ok />
                  </div>
                ) : (
                  <p className="empty-note">尚未完成安装检测。请在 Tauri 桌面应用中刷新。</p>
                )}
              </section>

              <section className={settingsCardClass("overview")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Config</p>
                    <h2>配置状态</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={keyBusy}
                    type="button"
                    onClick={() => void createApiKey(installStatus?.activeProfile)}
                  >
                    <Settings size={14} />
                    <span>{keyBusy ? "生成中..." : "生成 API key"}</span>
                  </button>
                </div>
                {installStatus ? (
                  <div className="settings-rows">
                    <StatusRow label="config.yaml" value={installStatus.configExists ? "已存在" : "未发现"} ok={installStatus.configExists} />
                    <StatusRow label=".env" value={installStatus.envExists ? "已存在" : "未发现"} ok={installStatus.envExists} />
                    <StatusRow label="API_SERVER_KEY" value={installStatus.apiServerKeyPresent ? "已配置" : "未配置"} ok={installStatus.apiServerKeyPresent} />
                    <StatusRow label="api_server" value={installStatus.apiServerConfigured ? "已启用" : "未启用"} ok={installStatus.apiServerConfigured} />
                  </div>
                ) : (
                  <p className="empty-note">配置状态需要 Tauri Runtime 读取本机 Hermes 目录。</p>
                )}
              </section>

              <section className={settingsCardClass("providers", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Provider Keys</p>
                    <h2>API Key 与 Credential Pool</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>刷新密钥</span>
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
                          {item.present ? item.masked : "未配置"}
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
                          placeholder="输入新 API key"
                        />
                        <button
                          disabled={providerBusy || !(providerKeyDrafts[item.envKey] ?? "").trim()}
                          type="button"
                          onClick={() => void saveProviderKeyDraft(item.envKey)}
                        >
                          <Save size={14} />
                          <span>保存</span>
                        </button>
                      </div>
                    </article>
                  ))}
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
                      placeholder="标签，可选"
                    />
                    <button
                      className="refresh-runtime"
                      disabled={providerBusy || !poolForm.provider.trim() || !poolForm.apiKey.trim()}
                      type="button"
                      onClick={() => void addPoolEntry()}
                    >
                      <Plus size={14} />
                      <span>添加到 Pool</span>
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
                      <p className="empty-note">当前 profile 未配置 credential pool。</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("models", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Models</p>
                    <h2>模型与 Provider</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>刷新模型</span>
                  </button>
                  <button
                    className="refresh-runtime"
                    disabled={discoveryBusy}
                    type="button"
                    onClick={() => void diagnoseProvider()}
                  >
                    <Plug size={14} />
                    <span>{discoveryBusy ? "诊断中..." : "诊断 Provider"}</span>
                  </button>
                </div>
                <div className="model-panel">
                  <div className="settings-rows">
                    <StatusRow label="当前 Provider" value={activeModel?.provider || "未配置"} ok={Boolean(activeModel?.provider && activeModel.provider !== "auto")} />
                    <StatusRow label="当前 Model" value={activeModel?.model || "未配置"} ok={Boolean(activeModel?.model)} />
                    <StatusRow label="Base URL" value={activeModel?.baseUrl || "使用 provider 默认值"} ok />
                  </div>

                  {providerDiscovery && (
                    <div className={`provider-diagnosis ${providerDiscovery.ok ? "ok" : "warning"}`}>
                      <div>
                        <strong>{providerDiscovery.provider} · {providerDiscovery.status}</strong>
                        <span>{providerDiscovery.message}</span>
                        <small>{providerDiscovery.baseUrl || "no base url"} · {providerDiscovery.envKey || "no env key"}</small>
                      </div>
                      <em>{providerDiscovery.modelCount} models</em>
                    </div>
                  )}

                  <div className="model-form">
                    <label>
                      <span>名称</span>
                      <input
                        value={modelForm.name}
                        onChange={(event) => setModelForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="例如 GPT-4.1"
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
                        placeholder="模型 ID"
                      />
                    </label>
                    <label>
                      <span>Base URL</span>
                      <input
                        value={modelForm.baseUrl}
                        onChange={(event) => setModelForm((current) => ({ ...current, baseUrl: event.target.value }))}
                        placeholder="可选"
                      />
                    </label>
                    <label>
                      <span>Context</span>
                      <input
                        value={modelForm.contextLength}
                        onChange={(event) => setModelForm((current) => ({ ...current, contextLength: event.target.value }))}
                        placeholder="可选 token 数"
                      />
                    </label>
                    <div className="model-form-actions">
                      <button className="refresh-runtime" disabled={modelBusy} type="button" onClick={saveModelFromForm}>
                        <Save size={14} />
                        <span>{modelForm.id ? "更新" : "保存"}</span>
                      </button>
                      <button className="refresh-runtime" type="button" onClick={resetModelForm}>
                        <Plus size={14} />
                        <span>新建</span>
                      </button>
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
                                <span>{isActive ? "已激活" : "激活"}</span>
                              </button>
                              <button disabled={discoveryBusy} type="button" onClick={() => void diagnoseProvider(model)}>
                                <RefreshCw size={14} />
                                <span>诊断</span>
                              </button>
                              <button disabled={modelBusy} type="button" onClick={() => editModel(model)}>
                                <Settings size={14} />
                                <span>编辑</span>
                              </button>
                              <button disabled={modelBusy} type="button" onClick={() => void deleteModel(model)}>
                                <Trash2 size={14} />
                                <span>删除</span>
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <p className="empty-note">模型库为空。可以先新增模型条目。</p>
                    )}
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("gateway", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Gateway</p>
                    <h2>Gateway 控制</h2>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="refresh-runtime"
                      type="button"
                      onClick={() => void refreshRuntime({ autoStart: false })}
                    >
                      <RefreshCw size={14} />
                      <span>刷新</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      disabled={gatewayBusy}
                      type="button"
                      onClick={() => void startGateway(installStatus?.activeProfile)}
                    >
                      <Plug size={14} />
                      <span>{gatewayBusy ? "处理中..." : "启动"}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      disabled={gatewayBusy}
                      type="button"
                      onClick={() => void stopGateway(installStatus?.activeProfile)}
                    >
                      <Power size={14} />
                      <span>停止</span>
                    </button>
                  </div>
                </div>
                <div className="settings-rows">
                  <StatusRow
                    label="健康状态"
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
                  <p className="empty-note">未发现 Hermes profile。请先完成安装检测或刷新 Runtime。</p>
                )}
              </section>

              <section className={settingsCardClass("gateway", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Remote</p>
                    <h2>远程 / SSH 连接</h2>
                  </div>
                  <div className="settings-actions">
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void refreshRemoteConnection()}>
                      <RefreshCw size={14} />
                      <span>刷新</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void saveRemoteConfig()}>
                      <Save size={14} />
                      <span>保存</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void testRemoteConfig()}>
                      <Plug size={14} />
                      <span>测试</span>
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
                        {modeName === "local" ? "本机" : modeName === "remote" ? "远程 URL" : "SSH 隧道"}
                      </button>
                    ))}
                  </div>
                  <div className="settings-rows">
                    <StatusRow label="当前模式" value={remoteConfig.mode} ok />
                    <StatusRow label="连接状态" value={remoteStatus?.message ?? "尚未测试"} ok={Boolean(remoteStatus?.ok)} />
                    <StatusRow label="Base URL" value={remoteStatus?.baseUrl || (remoteConfig.mode === "remote" ? remoteConfig.remoteUrl : "按模式解析")} ok={Boolean(remoteStatus?.baseUrl || remoteConfig.mode !== "remote" || remoteConfig.remoteUrl)} />
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
                        placeholder="远端 Gateway token，可选"
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
                      <span>{remoteBusy ? "连接中..." : "启动 SSH 隧道"}</span>
                    </button>
                    <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void disconnectSsh()}>
                      <Power size={14} />
                      <span>停止 SSH 隧道</span>
                    </button>
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("capabilities", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Capabilities</p>
                    <h2>工具与 MCP</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>刷新能力</span>
                  </button>
                </div>
                <div className="capability-split">
                  <div>
                    <h3>Toolsets</h3>
                    <div className="capability-grid">
                      {toolsets.length > 0 ? (
                        toolsets.map((toolset) => (
                          <article className={`capability-card ${toolset.enabled ? "enabled" : ""}`} key={toolset.key}>
                            <strong>{toolset.label}</strong>
                            <span>{toolset.description}</span>
                            <button
                              className="inline-action"
                              disabled={capabilityBusy}
                              type="button"
                              onClick={() => void toggleToolset(toolset)}
                            >
                              {toolset.enabled ? "关闭" : "开启"}
                            </button>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">未读取到 toolset 配置。</p>
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
                            placeholder="args，每行一个"
                          />
                          <textarea
                            value={mcpForm.env}
                            onChange={(event) => setMcpForm((current) => ({ ...current, env: event.target.value }))}
                            placeholder="ENV=value，每行一个"
                          />
                        </>
                      )}
                      {mcpForm.transport === "http" && (
                        <input
                          value={mcpForm.auth}
                          onChange={(event) => setMcpForm((current) => ({ ...current, auth: event.target.value }))}
                          placeholder="auth，可选"
                        />
                      )}
                      <div className="settings-actions">
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMcpFromForm()}>
                          <Save size={14} />
                          <span>保存 MCP</span>
                        </button>
                        <button className="refresh-runtime" type="button" onClick={() => setMcpForm(emptyMcpForm)}>
                          <Plus size={14} />
                          <span>新建</span>
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
                              <button type="button" onClick={() => editMcpServer(server)}>编辑</button>
                              <button disabled={capabilityBusy} type="button" onClick={() => void deleteMcpServer(server)}>删除</button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">当前 profile 未配置 MCP server。</p>
                      )}
                    </div>
                  </div>
                </div>
              </section>

              <section className={settingsCardClass("skills", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Skills</p>
                    <h2>Skills 管理</h2>
                  </div>
                  <span className="count-pill">{skills.length}</span>
                </div>
                <div className="skill-manager">
                  <div className="skill-search">
                    <input
                      value={skillQuery}
                      onChange={(event) => setSkillQuery(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter") void searchSkills();
                      }}
                      placeholder="搜索 name/category/description"
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void searchSkills()}>
                      <Search size={14} />
                      <span>搜索</span>
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
                      placeholder="name，可选"
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void installSkillFromForm()}>
                      <FolderPlus size={14} />
                      <span>安装</span>
                    </button>
                  </div>
                </div>
                <div className="mini-list">
                  {skills.length > 0 ? (
                    skills.map((skill) => (
                      <article key={skill.path}>
                        <div>
                          <strong>{skill.name}</strong>
                          <span>{skill.category}/{skill.dirName}{skill.description ? ` · ${skill.description}` : ""}</span>
                        </div>
                        <div className="mini-actions">
                          <button disabled={skillBusy} type="button" onClick={() => void deleteSkill(skill)}>
                            删除
                          </button>
                        </div>
                      </article>
                    ))
                  ) : (
                    <p className="empty-note">当前 profile 未发现已安装 Skill。</p>
                  )}
                </div>
              </section>

              <section className={settingsCardClass("memory", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Memory</p>
                    <h2>记忆编辑</h2>
                  </div>
                </div>
                {memorySummary ? (
                  <div className="memory-editor">
                    <StatusRow label="MEMORY.md" value={`${memorySummary.memoryEntries} 条 · ${memorySummary.memoryChars} chars`} ok={memorySummary.memoryExists} />
                    <textarea
                      value={memoryDraft.memory}
                      onChange={(event) => setMemoryDraft((current) => ({ ...current, memory: event.target.value }))}
                      placeholder="MEMORY.md"
                    />
                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMemoryDraft("memory")}>
                      <Save size={14} />
                      <span>保存 MEMORY</span>
                    </button>
                    <StatusRow label="USER.md" value={`${memorySummary.userChars} chars`} ok={memorySummary.userExists} />
                    <textarea
                      value={memoryDraft.user}
                      onChange={(event) => setMemoryDraft((current) => ({ ...current, user: event.target.value }))}
                      placeholder="USER.md"
                    />
                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMemoryDraft("user")}>
                      <Save size={14} />
                      <span>保存 USER</span>
                    </button>
                    {memoryContent && <p className="empty-note">{memoryContent.memoryPath}</p>}
                  </div>
                ) : (
                  <p className="empty-note">尚未读取 Memory 摘要。</p>
                )}
              </section>

              <section className={settingsCardClass("logs", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Logs</p>
                    <h2>日志查看器</h2>
                  </div>
                  <div className="settings-actions">
                    <button
                      className="refresh-runtime"
                      type="button"
                      disabled={bundleBusy}
                      onClick={() => void exportHermesBundle("backup")}
                    >
                      <Save size={14} />
                      <span>{bundleBusy ? "导出中..." : "生成备份"}</span>
                    </button>
                    <button
                      className="refresh-runtime"
                      type="button"
                      disabled={bundleBusy}
                      onClick={() => void exportHermesBundle("debug")}
                    >
                      <Save size={14} />
                      <span>{bundleBusy ? "导出中..." : "导出诊断"}</span>
                    </button>
                    <button className="refresh-runtime" disabled={logBusy} type="button" onClick={() => void refreshHermesLogs()}>
                      <RefreshCw size={14} />
                      <span>{logBusy ? "读取中..." : "刷新日志"}</span>
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
                    placeholder="输入 hermes-team-*.json 的路径"
                  />
                  <button
                    className="refresh-runtime"
                    type="button"
                    onClick={pickHermesBackupFile}
                    disabled={restoreBusy || bundleBusy || logBusy}
                  >
                    <FolderPlus size={14} />
                    <span>选择文件</span>
                  </button>
                  <button
                    className="refresh-runtime"
                    disabled={restoreBusy || !canRestoreBackup || bundleBusy || logBusy}
                    type="button"
                    onClick={() => void restoreHermesBackup()}
                  >
                    <Upload size={14} />
                    <span>{restoreBusy ? "恢复中..." : "恢复备份"}</span>
                  </button>
                </div>
                <p className="restore-bundle-hint">
                  {canRestoreBackup ? `恢复来源：${restoreSourceHint}` : "先选择备份文件或输入备份路径后可恢复"}
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
                      <p className="empty-note">尚未发现 Hermes Team/Hermes 日志文件。</p>
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
                        <pre>{logContent.content || "日志为空。"}</pre>
                      </>
                    ) : (
                      <p className="empty-note">选择一个日志文件查看最近内容。</p>
                    )}
                  </div>
                </div>
                {lastBundlePath && <p className="bundle-path">已导出：{lastBundlePath}</p>}
              </section>
            </div>
          </>
        ) : activeView === "sessions" ? (
          <SessionsView
            sessions={sessions}
            formatTime={formatTime}
            onNewChat={() => void createNewSession()}
            onRestore={(session) => void restoreSession(session)}
            onRename={(sessionId, title) => void renameSession(sessionId, title)}
            onDelete={(sessionId) => void deleteSession(sessionId)}
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
          attachmentPathDraft={attachmentPathDraft}
          isLoading={Boolean(activeTask)}
          activityText={activeRuntimeEvent?.detail}
          activityEvents={activeRuntimeEvents}
          profiles={profiles}
          models={models}
          currentProfile={currentChatProfile}
          contextFolder={chatBinding?.workDir ?? null}
          worktreeVisible={worktreeVisible}
          activeModel={activeModel}
          reasoningEffort={reasoningEffort}
          modelBusy={modelBusy}
          formatTime={formatTime}
          onDraftChange={setDraft}
          onAttachmentPathChange={setAttachmentPathDraft}
          onAddAttachment={addDraftAttachment}
          onAttachFiles={(files) => void attachDroppedOrPastedFiles(files)}
          onPickAttachments={() => void pickDraftAttachments()}
          onRemoveAttachment={removeDraftAttachment}
          onNewChat={() => void createNewSession()}
          onClearChat={clearChat}
          onPickContextFolder={() => void pickChatContextFolder()}
          onClearContextFolder={() => setChatContextFolder(null)}
          onToggleWorktree={() => setWorktreeVisible((value) => !value)}
          onSelectProfile={selectChatProfile}
          onSelectModel={(model) => void activateChatModel(model)}
          onSelectReasoningEffort={selectReasoningEffort}
          onOpenModels={() => {
            setActiveView("settings");
            setActiveSettingsPanel("models");
          }}
          onSend={sendMessage}
          onStop={() => {
            if (activeTask) void cancelTask(activeTask.id);
          }}
        />
          </>
        )}
      </section>

      {activeView === "team" && showInspector && (
      <aside className="inspector">
        <nav className="inspector-tabs" aria-label="右侧面板">
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
            <h2>Agent 名册</h2>
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
                      {profileOptionsFor(currentProfile).map((name) => (
                        <option key={name} value={name}>
                          {name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className={profileStatusClass(profile, profiles.length > 0)}>
                    <AlertTriangle size={13} />
                    <span>{profileStatusText(profile, profiles.length > 0)}</span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className={inspectorSectionClass("dispatch")}>
          <div className="section-title">
            <GitBranch size={18} />
            <h2>调度状态</h2>
          </div>
          <div className="dispatch-summary">
            <CheckCircle2 size={18} />
            <div>
              <strong>{taskSummary(state) || (handoff.kind === "single" ? "检测到快路径接力" : "等待下一次调度")}</strong>
              <span>
                {state.logs[0]
                  ? decisionLabel(state.logs[0].decision.type)
                  : handoff.kind === "single"
                  ? `下一棒：${handoff.targetNames[0]}`
                  : "多 Agent 编排核心处于待命状态"}
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
                      <strong>{agent?.name ?? "未知 Agent"}</strong>
                      <span>{task.status} · {task.instruction.slice(0, 54)}</span>
                    </div>
                    <button type="button" onClick={() => void cancelTask(task.id)}>
                      <StopCircle size={14} />
                      <span>终止</span>
                    </button>
                  </article>
                );
              })}
          </div>
        </section>

        <section className={inspectorSectionClass("sessions")}>
          <div className="section-title">
            <History size={18} />
            <h2>Session 历史</h2>
            <div className="section-title-actions">
              <button className="refresh-runtime" type="button" onClick={() => void createNewSession()}>
                <Plus size={14} />
                <span>新建会话</span>
              </button>
            </div>
          </div>
          <div className="log-list">
            {sessions.length === 0 ? (
              <p className="empty-note">当前还没有本地 session 快照。</p>
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
                    恢复此会话
                  </button>
                </article>
              ))
            )}
          </div>
        </section>

        <section className={inspectorSectionClass("runtime")}>
          <div className="section-title">
            <Activity size={18} />
            <h2>运行事件</h2>
          </div>
          <div className="log-list">
            {runtimeEvents.length === 0 ? (
              <p className="empty-note">Agent 运行时会在这里记录开始、完成、失败或取消事件。</p>
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
            <h2>调度日志</h2>
          </div>
          <div className="log-list">
            {state.logs.length === 0 ? (
              <p className="empty-note">发送一条 @Agent 消息后，这里会记录调度决策。</p>
            ) : (
              state.logs.slice(0, 5).map((log) => (
                <article className="log-card" key={log.id}>
                  <strong>{decisionLabel(log.decision.type)}</strong>
                  <span>{formatTime(log.createdAt)} · {log.status}</span>
                  <p>{decisionDetail(log.decision)}</p>
                </article>
              ))
            )}
          </div>
        </section>
      </aside>
      )}
    </main>
  );
}

function StatusRow({ label, value, ok }: { label: string; value: string; ok: boolean }) {
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <em className={ok ? "ok" : "warning"}>{ok ? "OK" : "需要处理"}</em>
    </div>
  );
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function decisionLabel(type: string): string {
  switch (type) {
    case "dispatch":
      return "已派发";
    case "ask_user":
      return "等待用户";
    case "blocked":
      return "已阻断";
    default:
      return "无需动作";
  }
}

function decisionDetail(decision: OrchestrationState["logs"][number]["decision"]): string {
  if (decision.type === "dispatch") {
    return `${decision.mode} · ${decision.assignments.length} 个目标 · ${decision.reason}`;
  }
  if (decision.type === "ask_user") return decision.question;
  return decision.reason;
}

function taskSummary(state: OrchestrationState): string {
  if (state.tasks.length === 0) return "";
  const running = state.tasks.filter((task) => task.status === "running").length;
  const pending = state.tasks.filter((task) => task.status === "pending").length;
  const completed = state.tasks.filter((task) => task.status === "completed").length;
  const failed = state.tasks.filter((task) => task.status === "failed").length;
  if (running > 0) return `${running} 个任务运行中`;
  if (pending > 0) return `${pending} 个任务等待执行`;
  if (failed > 0) return `${failed} 个任务失败`;
  return `已完成 ${completed} 个任务`;
}

function normalizeLoadedState(saved: OrchestrationState): OrchestrationState {
  const workspaceName =
    saved.workspace.name === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
    saved.workspace.name === LEGACY_AGENT_WORKSPACE_NAME
      ? DEFAULT_WORKSPACE_NAME
      : saved.workspace.name;
  const workspaceDescription =
    saved.workspace.description === LEGACY_PRODUCT_RD_WORKSPACE_DESCRIPTION ||
    saved.workspace.description === LEGACY_AGENT_WORKSPACE_DESCRIPTION
      ? DEFAULT_WORKSPACE_DESCRIPTION
      : saved.workspace.description;
  const hasLegacyWorkspace =
    saved.workspace.name === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
    saved.workspace.name === LEGACY_AGENT_WORKSPACE_NAME;
  const normalizedAgents = hasLegacyWorkspace
    ? seedAgents.map((agent) => ({ ...agent, workspaceId: saved.workspace.id }))
    : saved.agents;
  const normalizedBindings = hasLegacyWorkspace ? seedBindings : saved.bindings;

  return {
    ...saved,
    workspace: {
      ...saved.workspace,
      name: workspaceName,
      description: workspaceDescription,
      defaultAgentId: hasLegacyWorkspace ? seedWorkspace.defaultAgentId : saved.workspace.defaultAgentId,
    },
    agents: normalizedAgents,
    bindings: normalizedBindings,
    messages: saved.messages.filter((message) => !LEGACY_SEED_MESSAGE_CONTENTS.has(message.content)),
    tasks: saved.tasks.map((task) =>
      task.status === "running" || task.status === "pending"
        ? { ...task, status: "failed", completedAt: Date.now() }
        : task,
    ),
  };
}

function normalizeLoadedSessions(sessions: HermesTeamSessionSummary[]): HermesTeamSessionSummary[] {
  return sessions.map((session) => {
    const state = normalizeLoadedState(session.state);
    const defaultAgentId = state.workspace.defaultAgentId ?? state.agents[0]?.id;
    const contextFolder =
      session.contextFolder ??
      state.bindings.find((binding) => binding.agentId === defaultAgentId)?.workDir?.trim() ??
      null;
    return {
      ...session,
      title:
        session.title === LEGACY_PRODUCT_RD_WORKSPACE_NAME ||
        session.title === LEGACY_AGENT_WORKSPACE_NAME
          ? DEFAULT_WORKSPACE_NAME
          : session.title,
      contextFolder,
      state,
      messageCount: state.messages.length,
      taskCount: state.tasks.length,
    };
  });
}

function sessionSummaryForSave(
  state: OrchestrationState,
  sessions: HermesTeamSessionSummary[],
): HermesTeamSessionSummary {
  const summary = buildSessionSummary(state);
  const existing = sessions.find((session) => session.id === summary.id);
  if (!existing?.titleEdited) return summary;
  return {
    ...summary,
    title: existing.title,
    titleEdited: true,
  };
}

function runtimeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("__TAURI") ||
    message.includes("ipc") ||
    message.includes("Tauri") ||
    message.includes("not a function")
  ) {
    return TAURI_UNAVAILABLE_MESSAGE;
  }
  if (message === "undefined" || message === "[object Object]") {
    return "无法调用 Tauri Hermes Gateway 探测命令。请确认当前运行的是 Tauri 桌面应用，而不是浏览器预览页。";
  }
  return message;
}

function isConnectionRefused(error: unknown): boolean {
  const message = runtimeErrorMessage(error);
  return message.includes("Connection refused") || message.includes("连接 127.0.0.1");
}

function profileStatusClass(
  profile: HermesProfileInfo | undefined,
  discoveryReady: boolean,
): string {
  if (!discoveryReady) return "profile-status muted";
  if (!profile) return "profile-status warning";
  if (!profile.hasApiKey) return "profile-status warning";
  return "profile-status ok";
}

function profileStatusText(
  profile: HermesProfileInfo | undefined,
  discoveryReady: boolean,
): string {
  if (!discoveryReady) return "等待 Tauri Runtime 发现本机 profile";
  if (!profile) return "本机未发现该 profile";
  if (!profile.hasApiKey) return `${profile.gatewayUrl} · 未发现 API_SERVER_KEY`;
  return `${profile.gatewayUrl} · 已发现 API_SERVER_KEY`;
}
