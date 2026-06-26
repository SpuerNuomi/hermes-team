import {
  Activity,
  AlertTriangle,
  BrainCircuit,
  CalendarClock,
  CheckCircle2,
  CircleDot,
  Clock,
  GitBranch,
  FolderPlus,
  History,
  Pause,
  Pencil,
  Play,
  Repeat,
  X,
  MessageSquareText,
  PanelLeftClose,
  PanelLeftOpen,
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
  WandSparkles,
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
import type { Message, MessageAttachment, WorkspaceMode } from "../core/types";
import { processDroppedOrPastedFiles } from "./attachmentProcessing";
import { buildLabel } from "./buildInfo";
import {
  isLocalReplyCommand,
  runLocalReplyCommand,
  slashCommandName,
} from "./chatInput/localCommands";
import { SLASH_COMMANDS } from "./chatInput/slashCommands";
import { ChatView } from "./ChatView";
import { SessionsView } from "./SessionsView";
import { SidebarRecentSessions } from "./SidebarRecentSessions";
import { WebPreviewPanel } from "./WebPreviewPanel";
import { useReasoningEffort } from "./useReasoningEffort";
import {
  addHermesMemoryEntry,
  addCredentialPoolEntry,
  activateHermesModel,
  autofixConfigIssue,
  buildSessionSummary,
  cancelHermesTask,
  checkForAppUpdates,
  createHermesCronJob,
  editHermesCronJob,
  createHermesProfile,
  deleteHermesTeamSession,
  deleteHermesProfile,
  discoverProviderModels,
  ensureHermesGateway,
  createHermesBackupFile,
  createHermesDebugDump,
  restoreHermesBackupFile,
  generateApiServerKey,
  getAppSettings,
  getConfigHealth,
  getHermesModelConfig,
  getNetworkSettings,
  getRemoteConnectionConfig,
  getRemoteConnectionStatus,
  getUpdateStatus,
  inspectHermesInstall,
  installHermesSkill,
  installHermesMcpCatalogEntry,
  isTauriRuntimeAvailable,
  listAuxiliaryModelConfigs,
  listCredentialPool,
  listHermesBundledSkills,
  listHermesCronJobs,
  listHermesLogs,
  listHermesMcpCatalog,
  listHermesStateSessions,
  listHermesMcpServers,
  listHermesModels,
  listHermesProfiles,
  listHermesSkills,
  listHermesToolsets,
  listMessagingPlatforms,
  listProviderKeys,
  listProviderRegistry,
  listRegistryModelLibrary,
  listenHermesAgentStream,
  loadHermesTeamSessions,
  loadHermesStateSession,
  openExternalUrl,
  loadHermesTeamState,
  probeHermesGateway,
  readHermesMemorySummary,
  readHermesMemoryDetails,
  readHermesLog,
  readHermesMemoryContent,
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
  runHermesTaskStream,
  saveAppSettings,
  saveAuxiliaryModelConfig,
  saveHermesMcpServer,
  saveHermesTeamSession,
  saveHermesTeamState,
  saveHermesModel,
  saveNetworkSettings,
  saveProviderKey,
  saveRemoteConnectionConfig,
  selectAttachmentFiles,
  selectContextFolder,
  removeHermesModel,
  searchHermesSkills,
  setActiveHermesProfile,
  setAutoUpgradeEnabled,
  setHermesToolsetEnabled,
  resumeHermesCronJob,
  runOAuthProviderLogin,
  startSshTunnel,
  stopHermesGateway,
  stopSshTunnel,
  testHermesMcpServer,
  testRemoteConnection,
  testMessagingPlatform,
  triggerHermesCronJob,
  updateMessagingPlatform,
  updateHermesMemoryEntry,
  updateHermesTeamSessionTitle,
  writeHermesMemoryContent,
  TAURI_UNAVAILABLE_MESSAGE,
  type ActiveModelConfig,
  type AppSettings,
  type AuxiliaryModelConfig,
  type BundledSkillInfo,
  type ConfigHealthIssue,
  type ConfigHealthReport,
  type CronJobActionResult,
  type CronJobInfo,
  type CredentialPoolGroup,
  type HermesInstallStatus,
  type HermesLogContent,
  type HermesLogInfo,
  type HermesProfileInfo,
  type HermesRestoreResult,
  type RestoreHermesBackupInput,
  type HermesTeamSessionSummary,
  type HermesStateMessage,
  type HermesStateSessionSummary,
  type InstalledSkillInfo,
  type McpCatalogEntry,
  type McpOperationResult,
  type McpServerInfo,
  type MemoryContent,
  type PersonaContent,
  type MemoryDetails,
  type MemorySummary,
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
  type RuntimeStreamEvent,
  type SavedModel,
  type ToolsetInfo,
  type UpdateStatus,
} from "../runtime/hermes-runtime";

type ActiveView = "team" | "sessions" | "settings";
type SettingsPanel = "overview" | "appearance" | "network" | "profiles" | "providers" | "models" | "gateway" | "messaging" | "schedules" | "capabilities" | "skills" | "memory" | "update" | "logs";
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
type ProfileForm = {
  name: string;
  cloneConfig: boolean;
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
type CronFrequency = "minutes" | "hourly" | "daily" | "weekly" | "custom";
type CronJobForm = {
  name: string;
  prompt: string;
  deliverTargets: string[];
  repeatTimes: string;
  skills: string[];
  freq: CronFrequency;
  minuteInterval: number;
  hour: number;
  minute: number;
  weekdays: number[];
  customCron: string;
};
type MessagingEnvDrafts = Record<string, Record<string, string>>;
type RuntimeEvent = {
  id: string;
  taskId: string;
  label: string;
  detail: string;
  createdAt: number;
  level: "info" | "ok" | "warning";
};
type QueuedChatMessage = {
  id: string;
  text: string;
  attachments: MessageAttachment[];
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
const themeOptions = [
  { id: "light", name: "Light", appearance: "light" },
  { id: "dark", name: "Dark", appearance: "dark" },
  { id: "github-light", name: "GitHub Light", appearance: "light" },
  { id: "github-dark", name: "GitHub Dark", appearance: "dark" },
  { id: "dracula", name: "Dracula", appearance: "dark" },
  { id: "nord", name: "Nord", appearance: "dark" },
  { id: "one-dark", name: "One Dark", appearance: "dark" },
];
const fontOptions = [
  { id: "system", name: "System", stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: "serif", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace" },
];
const defaultAppSettings: AppSettings = {
  theme: "light",
  roundedCorners: true,
  font: "system",
};
const defaultNetworkSettings: NetworkSettings = {
  forceIpv4: false,
  proxy: "",
  remoteChatTransport: "auto",
  sshChatTransport: "auto",
};
const chatTransportOptions: Array<{ id: "auto" | "dashboard" | "legacy"; label: string; detail: string }> = [
  { id: "auto", label: "Auto", detail: "优先 Dashboard，失败后回退旧传输" },
  { id: "dashboard", label: "Dashboard", detail: "只使用 Hermes dashboard transport" },
  { id: "legacy", label: "Legacy", detail: "保持旧 remote/SSH transport" },
];

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

const emptyProfileForm: ProfileForm = {
  name: "",
  cloneConfig: true,
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

const emptyCronJobForm: CronJobForm = {
  name: "",
  prompt: "",
  deliverTargets: ["local"],
  repeatTimes: "",
  skills: [],
  freq: "daily",
  minuteInterval: 30,
  hour: 9,
  minute: 0,
  weekdays: [1, 2, 3, 4, 5],
  customCron: "*/30 * * * *",
};

const CRON_DELIVER_OPTIONS: { id: string; label: string }[] = [
  { id: "origin", label: "origin" },
  { id: "local", label: "local" },
  { id: "telegram", label: "telegram" },
  { id: "discord", label: "discord" },
  { id: "slack", label: "slack" },
];

const defaultRemoteConnectionConfig: RemoteConnectionConfig = {
  mode: "local",
  remoteUrl: "http://127.0.0.1:8642",
  apiKey: "",
  remoteChatTransport: "auto",
  sshChatTransport: "auto",
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

function formatCronDate(value?: string | null): string {
  if (!value) return "未排定";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat("zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function formatCronRelative(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  const diff = date.getTime() - Date.now();
  const past = diff < 0;
  const suffix = past ? "前" : "后";
  const minutes = Math.round(Math.abs(diff) / 60000);
  if (minutes < 1) return past ? "刚刚" : "即将";
  if (minutes < 60) return `${minutes} 分钟${suffix}`;
  const hours = Math.floor(minutes / 60);
  const remMinutes = minutes % 60;
  if (hours < 24) return `${hours}h${remMinutes ? ` ${remMinutes}m` : ""}${suffix}`;
  const days = Math.floor(hours / 24);
  return `${days} 天${suffix}`;
}

const CRON_STATE_META: Record<string, { label: string; cls: string }> = {
  active: { label: "Active", cls: "schedule-state-active" },
  paused: { label: "Paused", cls: "schedule-state-paused" },
  completed: { label: "Completed", cls: "schedule-state-completed" },
};

function cronStateMeta(state: string): { label: string; cls: string } {
  return CRON_STATE_META[state] ?? { label: state || "Unknown", cls: "schedule-state-paused" };
}

const CRON_FREQ_OPTIONS: { id: CronFrequency; label: string }[] = [
  { id: "minutes", label: "分钟" },
  { id: "hourly", label: "小时" },
  { id: "daily", label: "每天" },
  { id: "weekly", label: "每周" },
  { id: "custom", label: "自定义 Cron" },
];

const CRON_WEEKDAYS: { value: number; short: string; long: string }[] = [
  { value: 1, short: "一", long: "周一" },
  { value: 2, short: "二", long: "周二" },
  { value: 3, short: "三", long: "周三" },
  { value: 4, short: "四", long: "周四" },
  { value: 5, short: "五", long: "周五" },
  { value: 6, short: "六", long: "周六" },
  { value: 0, short: "日", long: "周日" },
];

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

function clampInt(raw: string, min: number, max: number, fallback: number): number {
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, Math.round(parsed)));
}

function parseCronField(field: string, min: number, max: number): Set<number> | null {
  const result = new Set<number>();
  for (const part of field.split(",")) {
    if (!part) return null;
    let step = 1;
    let range = part;
    const slash = part.split("/");
    if (slash.length === 2) {
      range = slash[0];
      step = Number(slash[1]);
      if (!Number.isInteger(step) || step < 1) return null;
    } else if (slash.length > 2) {
      return null;
    }
    let lo: number;
    let hi: number;
    if (range === "*") {
      lo = min;
      hi = max;
    } else if (range.includes("-")) {
      const [a, b] = range.split("-");
      lo = Number(a);
      hi = Number(b);
    } else {
      const value = Number(range);
      lo = value;
      hi = value;
    }
    if (!Number.isInteger(lo) || !Number.isInteger(hi) || lo < min || hi > max || lo > hi) {
      return null;
    }
    for (let i = lo; i <= hi; i += step) result.add(i);
  }
  return result.size ? result : null;
}

function validateCronExpression(expr: string): string | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return "Cron 需为 5 段（分 时 日 月 周）";
  const specs: [number, number][] = [
    [0, 59],
    [0, 23],
    [1, 31],
    [1, 12],
    [0, 7],
  ];
  for (let i = 0; i < 5; i += 1) {
    if (!parseCronField(fields[i], specs[i][0], specs[i][1])) {
      return `第 ${i + 1} 段无效：${fields[i]}`;
    }
  }
  return null;
}

function nextCronRun(expr: string, from: Date = new Date()): Date | null {
  const fields = expr.trim().split(/\s+/);
  if (fields.length !== 5) return null;
  const minute = parseCronField(fields[0], 0, 59);
  const hour = parseCronField(fields[1], 0, 23);
  const dom = parseCronField(fields[2], 1, 31);
  const month = parseCronField(fields[3], 1, 12);
  const dow = parseCronField(fields[4], 0, 7);
  if (!minute || !hour || !dom || !month || !dow) return null;
  if (dow.has(7)) dow.add(0);
  const domRestricted = fields[2] !== "*";
  const dowRestricted = fields[4] !== "*";
  const cursor = new Date(from.getTime());
  cursor.setSeconds(0, 0);
  cursor.setMinutes(cursor.getMinutes() + 1);
  for (let i = 0; i < 535680; i += 1) {
    const matchDom = dom.has(cursor.getDate());
    const matchDow = dow.has(cursor.getDay());
    const dayOk =
      domRestricted && dowRestricted ? matchDom || matchDow : matchDom && matchDow;
    if (
      month.has(cursor.getMonth() + 1) &&
      dayOk &&
      hour.has(cursor.getHours()) &&
      minute.has(cursor.getMinutes())
    ) {
      return new Date(cursor.getTime());
    }
    cursor.setMinutes(cursor.getMinutes() + 1);
  }
  return null;
}

function serializeCronSchedule(form: CronJobForm): { value: string; error: string | null } {
  switch (form.freq) {
    case "minutes": {
      const n = form.minuteInterval;
      if (!Number.isInteger(n) || n < 1 || n > 59) {
        return { value: "", error: "分钟间隔需在 1–59 之间" };
      }
      return { value: `*/${n} * * * *`, error: null };
    }
    case "hourly": {
      const m = form.minute;
      if (!Number.isInteger(m) || m < 0 || m > 59) {
        return { value: "", error: "分钟需在 0–59 之间" };
      }
      return { value: `${m} * * * *`, error: null };
    }
    case "daily": {
      if (form.hour < 0 || form.hour > 23 || form.minute < 0 || form.minute > 59) {
        return { value: "", error: "时间无效" };
      }
      return { value: `${form.minute} ${form.hour} * * *`, error: null };
    }
    case "weekly": {
      if (!form.weekdays.length) {
        return { value: "", error: "请至少选择一天" };
      }
      if (form.hour < 0 || form.hour > 23 || form.minute < 0 || form.minute > 59) {
        return { value: "", error: "时间无效" };
      }
      const days = [...form.weekdays].sort((a, b) => a - b).join(",");
      return { value: `${form.minute} ${form.hour} * * ${days}`, error: null };
    }
    case "custom":
    default: {
      const expr = form.customCron.trim();
      if (!expr) return { value: "", error: "请输入 Cron 表达式" };
      const error = validateCronExpression(expr);
      return { value: error ? "" : expr, error };
    }
  }
}

function describeCronSchedule(form: CronJobForm): string {
  switch (form.freq) {
    case "minutes":
      return `每 ${form.minuteInterval} 分钟`;
    case "hourly":
      return `每小时第 ${form.minute} 分钟`;
    case "daily":
      return `每天 ${pad2(form.hour)}:${pad2(form.minute)}`;
    case "weekly": {
      const names = CRON_WEEKDAYS.filter((day) => form.weekdays.includes(day.value)).map(
        (day) => day.long,
      );
      return `${names.join("、")} ${pad2(form.hour)}:${pad2(form.minute)}`;
    }
    case "custom":
    default:
      return "自定义 Cron 表达式";
  }
}

function parseCronToForm(schedule: string): Partial<CronJobForm> {
  const fields = schedule.trim().split(/\s+/);
  if (fields.length === 5) {
    const [mi, h, dom, mon, dow] = fields;
    if (dom === "*" && mon === "*") {
      const minuteMatch = /^\*\/(\d+)$/.exec(mi);
      if (minuteMatch && h === "*" && dow === "*") {
        return { freq: "minutes", minuteInterval: Number(minuteMatch[1]) };
      }
      if (/^\d+$/.test(mi) && h === "*" && dow === "*") {
        return { freq: "hourly", minute: Number(mi) };
      }
      if (/^\d+$/.test(mi) && /^\d+$/.test(h) && dow === "*") {
        return { freq: "daily", hour: Number(h), minute: Number(mi) };
      }
      if (/^\d+$/.test(mi) && /^\d+$/.test(h) && /^[0-7](,[0-7])*$/.test(dow)) {
        const weekdays = Array.from(
          new Set(dow.split(",").map((value) => (Number(value) === 7 ? 0 : Number(value)))),
        );
        return { freq: "weekly", hour: Number(h), minute: Number(mi), weekdays };
      }
    }
  }
  return { freq: "custom", customCron: schedule };
}

function cronFormFromJob(job: CronJobInfo): CronJobForm {
  return {
    ...emptyCronJobForm,
    name: job.name && job.name !== "(unnamed)" ? job.name : "",
    prompt: job.prompt ?? "",
    deliverTargets: job.deliver.length ? job.deliver : ["local"],
    repeatTimes: job.repeat?.times != null ? String(job.repeat.times) : "",
    skills: job.skills ?? [],
    ...parseCronToForm(job.schedule),
  };
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
  const [draftAttachments, setDraftAttachments] = useState<MessageAttachment[]>([]);
  const [queuedMessages, setQueuedMessages] = useState<QueuedChatMessage[]>([]);
  const [worktreeVisible, setWorktreeVisible] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [webPreviewUrl, setWebPreviewUrl] = useState<string | null>(null);
  const [notice, setNotice] = useState("Hermes Chat 已就绪。");
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
  }>({ state: "checking", message: "正在探测 Hermes Gateway..." });
  const [remoteConfig, setRemoteConfig] = useState<RemoteConnectionConfig>(defaultRemoteConnectionConfig);
  const [remoteStatus, setRemoteStatus] = useState<RemoteConnectionStatus | null>(null);
  const [profiles, setProfiles] = useState<HermesProfileInfo[]>([]);
  const [installStatus, setInstallStatus] = useState<HermesInstallStatus | null>(null);
  const [configHealth, setConfigHealth] = useState<ConfigHealthReport | null>(null);
  const [appSettings, setAppSettings] = useState<AppSettings>(defaultAppSettings);
  const [networkSettings, setNetworkSettings] = useState<NetworkSettings>(defaultNetworkSettings);
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus | null>(null);
  const [updateOutput, setUpdateOutput] = useState("");
  const [toolsets, setToolsets] = useState<ToolsetInfo[]>([]);
  const [mcpServers, setMcpServers] = useState<McpServerInfo[]>([]);
  const [mcpCatalog, setMcpCatalog] = useState<McpCatalogEntry[]>([]);
  const [mcpCatalogDiagnostics, setMcpCatalogDiagnostics] = useState<string[]>([]);
  const [mcpCatalogError, setMcpCatalogError] = useState("");
  const [mcpCatalogQuery, setMcpCatalogQuery] = useState("");
  const [mcpTestResult, setMcpTestResult] = useState<{ name: string; result: McpOperationResult } | null>(null);
  const [skills, setSkills] = useState<InstalledSkillInfo[]>([]);
  const [bundledSkills, setBundledSkills] = useState<BundledSkillInfo[]>([]);
  const [memorySummary, setMemorySummary] = useState<MemorySummary | null>(null);
  const [memoryDetails, setMemoryDetails] = useState<MemoryDetails | null>(null);
  const [memoryContent, setMemoryContent] = useState<MemoryContent | null>(null);
  const [memoryDraft, setMemoryDraft] = useState({ memory: "", user: "" });
  const [personaContent, setPersonaContent] = useState<PersonaContent | null>(null);
  const [personaDraft, setPersonaDraft] = useState("");
  const [newMemoryEntry, setNewMemoryEntry] = useState("");
  const [editingMemoryIndex, setEditingMemoryIndex] = useState<number | null>(null);
  const [editingMemoryDraft, setEditingMemoryDraft] = useState("");
  const [skillQuery, setSkillQuery] = useState("");
  const [skillCatalogQuery, setSkillCatalogQuery] = useState("");
  const [skillDetail, setSkillDetail] = useState<InstalledSkillInfo | BundledSkillInfo | null>(null);
  const [skillDetailContent, setSkillDetailContent] = useState("");
  const [skillInstallForm, setSkillInstallForm] = useState<SkillInstallForm>(emptySkillInstallForm);
  const [models, setModels] = useState<SavedModel[]>([]);
  const [activeModel, setActiveModel] = useState<ActiveModelConfig | null>(null);
  const [tokenUsage, setTokenUsage] = useState<{ promptTokens: number; totalTokens: number } | null>(null);
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
  const [mcpForm, setMcpForm] = useState<McpForm>(emptyMcpForm);
  const [cronJobs, setCronJobs] = useState<CronJobInfo[]>([]);
  const [cronForm, setCronForm] = useState<CronJobForm>(emptyCronJobForm);
  const [messagingResponse, setMessagingResponse] = useState<MessagingPlatformsResponse | null>(null);
  const [messagingEnvDrafts, setMessagingEnvDrafts] = useState<MessagingEnvDrafts>({});
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
  const cronNameInputRef = useRef<HTMLInputElement>(null);
  const cronSchedulePreview = useMemo(() => serializeCronSchedule(cronForm), [cronForm]);
  const cronNextRun = useMemo(
    () => (cronSchedulePreview.value ? nextCronRun(cronSchedulePreview.value) : null),
    [cronSchedulePreview.value],
  );
  const [messagingBusy, setMessagingBusy] = useState(false);
  const [discoveryBusy, setDiscoveryBusy] = useState(false);
  const [installBusy, setInstallBusy] = useState(false);
  const [configHealthBusy, setConfigHealthBusy] = useState(false);
  const [configFixingCode, setConfigFixingCode] = useState<string | null>(null);
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
  const sessionsRef = useRef<HermesTeamSessionSummary[]>([]);
  const cancelledTaskIdsRef = useRef<Set<string>>(new Set());
  const parallelTrackerRef = useRef(new ParallelBatchTracker());
  const serialTrackerRef = useRef(new SerialChainTracker());
  const streamEventHandlerRef = useRef<(event: RuntimeStreamEvent) => void>(() => undefined);
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
    { id: "overview", label: "概览" },
    { id: "appearance", label: "Appearance" },
    { id: "network", label: "Network" },
    { id: "profiles", label: "Profiles" },
    { id: "providers", label: "Provider" },
    { id: "models", label: "Models" },
    { id: "gateway", label: "Gateway" },
    { id: "messaging", label: "Messaging" },
    { id: "schedules", label: "Schedules" },
    { id: "capabilities", label: "Capabilities" },
    { id: "skills", label: "Skills" },
    { id: "memory", label: "Memory" },
    { id: "update", label: "Update" },
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

  function ensureTaskAnswerMessage(current: OrchestrationState, taskId: string, content = "正在生成...") {
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
      content: existing?.content && existing.content !== "正在生成..." ? existing.content : content,
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

  function upsertProcessMessageBeforeAnswer(
    messages: Message[],
    processMessage: Message,
    answerPlaceholder: Message,
    answerMessageId: string,
  ) {
    const processExists = messages.some((message) => message.id === processMessage.id);
    const answerExists = messages.some((message) => message.id === answerMessageId);
    if (processExists) {
      return messages.map((message) => (message.id === processMessage.id ? processMessage : message));
    }
    if (answerExists) {
      const nextMessages: Message[] = [];
      for (const message of messages) {
        if (message.id === answerMessageId) nextMessages.push(processMessage);
        nextMessages.push(message);
      }
      return nextMessages;
    }
    return [...messages, processMessage, answerPlaceholder];
  }

  function normalizeProcessText(value: string) {
    return value.replace(/\s+/g, " ").trim();
  }

  function isDuplicateProcessSnapshot(processText: string, answerText: string) {
    const process = normalizeProcessText(processText);
    const answer = normalizeProcessText(answerText);
    return Boolean(
      process &&
        answer &&
        (process === answer || process.startsWith(answer) || answer.startsWith(process)),
    );
  }

  function mergeToolEventContent(existingContent: string | undefined, nextContent: string) {
    if (!existingContent?.trim()) return nextContent;
    if (!nextContent.trim()) return existingContent;
    const existingLines = existingContent.split("\n").filter((line) => line.trim());
    const nextLines = nextContent.split("\n").filter((line) => line.trim());
    if (nextLines.length < existingLines.length) return existingContent;
    if (nextLines.length === existingLines.length && nextContent.length < existingContent.length) {
      return existingContent;
    }
    return nextContent;
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
    if (event.kind === "usage") {
      const promptTokens = Number(event.content) || 0;
      const totalTokens = Number(event.message) || 0;
      if (promptTokens > 0 || totalTokens > 0) {
        setTokenUsage({ promptTokens, totalTokens });
      }
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
        const isThinkingProgress = event.message === "thinking";
        const messageId = isThinkingProgress ? `reasoning-${event.taskId}-thinking` : `reasoning-${event.taskId}`;
        const existing = current.messages.find((message) => message.id === messageId);
        const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
        if (!nextContent.trim()) return current;
        const streamMessageId = `stream-${event.taskId}`;
        const streamExisting = current.messages.find((message) => message.id === streamMessageId);
        if (
          !isThinkingProgress &&
          streamExisting &&
          streamExisting.content !== "正在生成..." &&
          isDuplicateProcessSnapshot(nextContent, streamExisting.content)
        ) {
          return {
            ...current,
            messages: current.messages.filter((message) => message.id !== messageId),
          };
        }
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
        const streamMessage = {
          id: streamMessageId,
          workspaceId: task.workspaceId,
          authorKind: "agent" as const,
          authorId: agent?.id,
          authorName: agent?.name ?? "Hermes",
          content: "正在生成...",
          createdAt: Date.now(),
          replyToMessageId: task.triggerMessageId,
        };
        const updatedMessages = upsertProcessMessageBeforeAnswer(
          current.messages,
          nextMessage,
          streamMessage,
          streamMessageId,
        );
        return {
          ...current,
          messages: updatedMessages,
        };
      });
      return;
    }
    if (event.kind === "tool") {
      setState((current) => {
        const task = current.tasks.find((item) => item.id === event.taskId);
        if (!task || task.status === "cancelled") return current;
        const agent = current.agents.find((item) => item.id === task.agentId);
        const callId = event.message || "tool";
        const messageId = `tool-${event.taskId}-${callId}`;
        const existing = current.messages.find((message) => message.id === messageId);
        const nextRawContent = event.content || `${existing?.content ?? ""}${event.delta}`;
        const nextContent = mergeToolEventContent(existing?.content, nextRawContent);
        if (!nextContent.trim()) return current;
        const nextMessage = {
          id: messageId,
          workspaceId: task.workspaceId,
          kind: "tool" as const,
          authorKind: "agent" as const,
          authorId: agent?.id,
          authorName: agent?.name ?? "Hermes",
          content: nextContent,
          createdAt: existing?.createdAt ?? Date.now(),
          replyToMessageId: task.triggerMessageId,
        };
        const streamMessageId = `stream-${event.taskId}`;
        const streamMessage = {
          id: streamMessageId,
          workspaceId: task.workspaceId,
          authorKind: "agent" as const,
          authorId: agent?.id,
          authorName: agent?.name ?? "Hermes",
          content: "正在生成...",
          createdAt: Date.now(),
          replyToMessageId: task.triggerMessageId,
        };
        const updatedMessages = upsertProcessMessageBeforeAnswer(
          current.messages,
          nextMessage,
          streamMessage,
          streamMessageId,
        );
        return {
          ...current,
          messages: updatedMessages,
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
      const nextMessage: Message = {
        id: messageId,
        workspaceId: task.workspaceId,
        authorKind: "agent" as const,
        authorId: agent?.id,
        authorName: agent?.name ?? "未知 Agent",
        content: nextContent || "正在生成...",
        createdAt: existing?.createdAt ?? Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      const nextMessages = existing
        ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
        : [...current.messages, nextMessage];
        const filteredMessages =
        event.kind === "done"
          ? nextMessages.filter(
              (message) =>
                !(
                  message.kind === "reasoning" &&
                  message.id === `reasoning-${event.taskId}` &&
                  message.replyToMessageId === task.triggerMessageId &&
                  isDuplicateProcessSnapshot(message.content, nextMessage.content)
                ),
            )
          : nextMessages;
      return {
        ...current,
        messages: filteredMessages,
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

  streamEventHandlerRef.current = handleStreamEvent;

  function applyStreamEventSnapshot(current: OrchestrationState, event: RuntimeStreamEvent): OrchestrationState {
    if (event.kind === "start" || event.kind === "error") return current;
    const task = current.tasks.find((item) => item.id === event.taskId);
    if (!task || task.status === "cancelled") return current;
    const agent = current.agents.find((item) => item.id === task.agentId);
    if (event.kind === "reasoning") {
      const isThinkingProgress = event.message === "thinking";
      const messageId = isThinkingProgress ? `reasoning-${event.taskId}-thinking` : `reasoning-${event.taskId}`;
      const existing = current.messages.find((message) => message.id === messageId);
      const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
      if (!nextContent.trim()) return current;
      const streamMessageId = `stream-${event.taskId}`;
      const streamExisting = current.messages.find((message) => message.id === streamMessageId);
      if (
        !isThinkingProgress &&
        streamExisting &&
        streamExisting.content !== "正在生成..." &&
        isDuplicateProcessSnapshot(nextContent, streamExisting.content)
      ) {
        return {
          ...current,
          messages: current.messages.filter((message) => message.id !== messageId),
        };
      }
      const nextMessage: Message = {
        id: messageId,
        workspaceId: task.workspaceId,
        kind: "reasoning",
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: nextContent,
        createdAt: existing?.createdAt ?? Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      const streamMessage: Message = {
        id: streamMessageId,
        workspaceId: task.workspaceId,
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: "正在生成...",
        createdAt: Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      return {
        ...current,
        messages: upsertProcessMessageBeforeAnswer(current.messages, nextMessage, streamMessage, streamMessageId),
      };
    }
    if (event.kind === "tool") {
      const callId = event.message || "tool";
      const messageId = `tool-${event.taskId}-${callId}`;
      const existing = current.messages.find((message) => message.id === messageId);
      const nextRawContent = event.content || `${existing?.content ?? ""}${event.delta}`;
      const nextContent = mergeToolEventContent(existing?.content, nextRawContent);
      if (!nextContent.trim()) return current;
      const streamMessageId = `stream-${event.taskId}`;
      const nextMessage: Message = {
        id: messageId,
        workspaceId: task.workspaceId,
        kind: "tool",
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: nextContent,
        createdAt: existing?.createdAt ?? Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      const streamMessage: Message = {
        id: streamMessageId,
        workspaceId: task.workspaceId,
        authorKind: "agent",
        authorId: agent?.id,
        authorName: agent?.name ?? "Hermes",
        content: "正在生成...",
        createdAt: Date.now(),
        replyToMessageId: task.triggerMessageId,
      };
      return {
        ...current,
        messages: upsertProcessMessageBeforeAnswer(current.messages, nextMessage, streamMessage, streamMessageId),
      };
    }

    const messageId = `stream-${event.taskId}`;
    const existing = current.messages.find((message) => message.id === messageId);
    const nextContent = event.content || `${existing?.content ?? ""}${event.delta}`;
    const nextMessage: Message = {
      id: messageId,
      workspaceId: task.workspaceId,
      authorKind: "agent",
      authorId: agent?.id,
      authorName: agent?.name ?? "Hermes",
      content: nextContent || "正在生成...",
      createdAt: existing?.createdAt ?? Date.now(),
      replyToMessageId: task.triggerMessageId,
    };
    const messages = existing
      ? current.messages.map((message) => (message.id === messageId ? nextMessage : message))
      : [...current.messages, nextMessage];
    return {
      ...current,
      messages:
        event.kind === "done"
          ? messages.filter(
              (message) =>
                !(
                  message.kind === "reasoning" &&
                  message.id === `reasoning-${event.taskId}` &&
                  message.replyToMessageId === task.triggerMessageId &&
                  isDuplicateProcessSnapshot(message.content, nextMessage.content)
                ),
            )
          : messages,
    };
  }

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
      setNotice(`读取外观设置失败：${runtimeErrorMessage(error)}`);
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
      setNotice("外观设置已保存。");
    } catch (error) {
      setNotice(`保存外观设置失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`读取网络设置失败：${runtimeErrorMessage(error)}`);
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
        remoteChatTransport: saved.remoteChatTransport,
        sshChatTransport: saved.sshChatTransport,
      }));
      setNotice("网络设置已保存。");
    } catch (error) {
      setNotice(`保存网络设置失败：${runtimeErrorMessage(error)}`);
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
      return status;
    } catch (error) {
      setNotice(`读取更新状态失败：${runtimeErrorMessage(error)}`);
      return null;
    } finally {
      setUpdateBusy(false);
    }
  };

  const checkUpdatesNow = async () => {
    setUpdateBusy(true);
    try {
      const status = await checkForAppUpdates();
      setUpdateStatus(status);
      setNotice(status.message);
    } catch (error) {
      setNotice(`检查更新失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`保存更新偏好失败：${runtimeErrorMessage(error)}`);
    } finally {
      setUpdateBusy(false);
    }
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
      setNotice(`运行 hermes update 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`配置健康检查失败：${runtimeErrorMessage(error)}`);
      return null;
    } finally {
      setConfigHealthBusy(false);
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
      const status = await inspectHermesInstall();
      setInstallStatus(status);
      void refreshConfigHealth(status.activeProfile);
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
      setNotice(`读取 Hermes 能力失败：${runtimeErrorMessage(error)}`);
    }
  };

  const refreshCronJobs = async (profileName?: string) => {
    if (!isTauriRuntimeAvailable()) {
      setCronJobs([]);
      return;
    }
    const targetProfile = profileName ?? installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name;
    setCronBusy(true);
    try {
      const jobs = await listHermesCronJobs({
        includeDisabled: true,
        profile: targetProfile,
      });
      setCronJobs(jobs);
    } catch (error) {
      setNotice(`读取 Schedules 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setCronBusy(false);
    }
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
    const { value: schedule, error: scheduleError } = serializeCronSchedule(cronForm);
    const prompt = cronForm.prompt.trim();
    if (scheduleError || !schedule) {
      setNotice(`Schedule 无效：${scheduleError ?? "请检查调度设置"}`);
      return;
    }
    if (!prompt) {
      setNotice("Prompt 不能为空。");
      return;
    }
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const deliver = cronForm.deliverTargets.join(",") || "local";
    const repeatRaw = cronForm.repeatTimes.trim();
    let repeat: number | undefined;
    if (repeatRaw) {
      const parsed = Number(repeatRaw);
      if (!Number.isInteger(parsed) || parsed < 1) {
        setNotice("重复次数需为正整数，或留空表示一直运行。");
        return;
      }
      repeat = parsed;
    }
    const editing = cronEditId;
    setCronBusy(true);
    try {
      const result = editing
        ? await editHermesCronJob({
            profile: targetProfile,
            jobId: editing,
            schedule,
            prompt,
            name: cronForm.name.trim() || undefined,
            deliver,
            repeat,
            skills: cronForm.skills,
          })
        : await createHermesCronJob({
            profile: targetProfile,
            schedule,
            prompt,
            name: cronForm.name.trim() || undefined,
            deliver,
            repeat,
            skills: cronForm.skills.length ? cronForm.skills : undefined,
          });
      handleCronActionResult(result, editing ? "Schedule 已更新。" : "Schedule 已创建。");
      if (result.success) {
        setCronEditId(null);
        setCronForm(emptyCronJobForm);
        setCronSkillDraft("");
        await refreshCronJobs(targetProfile);
      }
    } catch (error) {
      setNotice(`${editing ? "更新" : "创建"} Schedule 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setCronBusy(false);
    }
  };

  const runCronJobOperation = async (
    job: CronJobInfo,
    operation: "pause" | "resume" | "remove" | "trigger",
  ) => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    const confirmed = operation === "remove" ? window.confirm(`删除 Schedule「${job.name}」？`) : true;
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
          ? "Schedule 已暂停。"
          : operation === "resume"
            ? "Schedule 已恢复。"
            : operation === "trigger"
              ? "Schedule 已触发。"
              : "Schedule 已删除。";
      handleCronActionResult(result, successMessage);
      if (result.success) await refreshCronJobs(targetProfile);
    } catch (error) {
      setNotice(`Schedule 操作失败：${runtimeErrorMessage(error)}`);
    } finally {
      setCronBusy(false);
      setCronOperatingId(null);
    }
  };

  const handleCronActionResult = (result: CronJobActionResult, successMessage: string) => {
    setNotice(result.success ? successMessage : `Schedule 操作失败：${result.error ?? "未知错误"}`);
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
      setNotice(`读取 Messaging Platforms 失败：${runtimeErrorMessage(error)}`);
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
      setNotice("没有新的 Messaging env 值需要保存。");
      return;
    }
    await applyMessagingPlatformUpdate(platform.id, { env }, `${platform.name} 配置已保存。`, () => {
      setMessagingEnvDrafts((current) => ({ ...current, [platform.id]: {} }));
    });
  };

  const clearMessagingEnv = async (platform: MessagingPlatformInfo, key: string) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { clearEnv: [key] },
      `${platform.name} 的 ${key} 已清空。`,
    );
  };

  const toggleMessagingPlatform = async (platform: MessagingPlatformInfo) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { enabled: !platform.enabled },
      `${platform.name} 已${platform.enabled ? "禁用" : "启用"}。`,
    );
  };

  const toggleMessagingToolset = async (platform: MessagingPlatformInfo, toolsetKey: string, enabled: boolean) => {
    await applyMessagingPlatformUpdate(
      platform.id,
      { toolsets: { [toolsetKey]: enabled } },
      `${platform.name} toolset 已更新。`,
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
      setNotice(`更新 Messaging Platform 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`测试 ${platform.name} 失败：${runtimeErrorMessage(error)}`);
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
      void refreshConfigHealth();
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
    let cancelled = false;
    if (!isTauriRuntimeAvailable()) {
      applyAppSettings(defaultAppSettings);
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
          setNotice("已恢复上次聊天状态。");
        }
      })
      .catch(() => {
        setNotice("Hermes Chat 已就绪。");
      })
      .finally(() => {
      if (cancelled) return;
      setStateReady(true);
      void refreshAppSettings();
      void refreshNetworkSettings();
      void refreshUpdateStatus();
      void refreshRemoteConnection();
        void loadHermesTeamSessions()
          .then((items) => setSessions(normalizeLoadedSessions(items)))
          .catch(() => undefined);
        void refreshDesktopSessions();
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
      setRuntimeEvents([]);
      setTokenUsage(null);
      setSessionStartedAt(Date.now());
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
      setRuntimeEvents([]);
      setActiveView("team");
      setNotice(`已恢复会话：${session.title}`);
  };

  const refreshLocalSessions = async () => {
    if (!isTauriRuntimeAvailable()) return;
    try {
      const items = await loadHermesTeamSessions();
      setSessions(normalizeLoadedSessions(items));
      setNotice("本地会话列表已刷新。");
    } catch (error) {
      setNotice(`刷新本地会话失败：${runtimeErrorMessage(error)}`);
    }
  };

  const refreshDesktopSessions = async () => {
    if (!isTauriRuntimeAvailable()) return;
    setDesktopSessionsBusy(true);
    try {
      const targetProfile = currentChatProfile || installStatus?.activeProfile || "default";
      const items = await listHermesStateSessions({ profile: targetProfile });
      setDesktopSessions(items);
    } catch (error) {
      setNotice(`读取本地 state.db 历史失败：${runtimeErrorMessage(error)}`);
    } finally {
      setDesktopSessionsBusy(false);
    }
  };

  const importDesktopSession = async (session: HermesStateSessionSummary) => {
    if (hasActiveSessionTasks(state)) {
      setNotice("当前会话仍有运行中的 Agent，请先停止任务后再导入历史会话。");
      return;
    }
    setDesktopSessionsBusy(true);
    try {
      const rows = await loadHermesStateSession({
        profile: session.profile,
        sessionId: session.id,
      });
      const imported = buildStateFromHermesStateSession(session, rows, mode);
      const previousWorkspaceId = state.workspace.id;
      parallelTrackerRef.current.clear(previousWorkspaceId);
      serialTrackerRef.current.clear(previousWorkspaceId);
      cancelledTaskIdsRef.current.clear();
      setModeState(imported.workspace.mode);
      setState(imported);
      setDraft("");
      setDraftAttachments([]);
      setRuntimeEvents([]);
      setActiveView("team");
      setNotice(`已导入本地历史会话：${session.title}`);
      if (isTauriRuntimeAvailable()) {
        void saveHermesTeamState(imported).catch(() => undefined);
        void saveHermesTeamSession(buildSessionSummary(imported))
          .then((items) => setSessions(normalizeLoadedSessions(items)))
          .catch(() => undefined);
      }
    } catch (error) {
      setNotice(`导入本地历史会话失败：${runtimeErrorMessage(error)}`);
    } finally {
      setDesktopSessionsBusy(false);
    }
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

  const refreshProfiles = async () => {
    if (!isTauriRuntimeAvailable()) {
      setProfiles([]);
      return;
    }
    try {
      const next = await listHermesProfiles();
      setProfiles(next);
    } catch (error) {
      setNotice(`刷新 Profiles 失败：${runtimeErrorMessage(error)}`);
    }
  };

  const createProfileFromForm = async () => {
    const name = profileForm.name.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "");
    if (!name) {
      setNotice("Profile 名称不能为空。");
      return;
    }
    setProfileBusy(true);
    try {
      const next = await createHermesProfile({
        name,
        cloneConfig: profileForm.cloneConfig,
      });
      setProfiles(next);
      setProfileForm(emptyProfileForm);
      setNotice(`Profile 已创建：${name}`);
    } catch (error) {
      setNotice(`创建 Profile 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setProfileBusy(false);
    }
  };

  const activateProfile = async (profileName: string, openChat = false) => {
    setProfileBusy(true);
    try {
      const next = await setActiveHermesProfile({ name: profileName });
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
      setNotice(`已切换到 Profile：${profileName}`);
      if (openChat) {
        setActiveView("team");
      }
    } catch (error) {
      setNotice(`切换 Profile 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setProfileBusy(false);
    }
  };

  const deleteProfileByName = async (profile: HermesProfileInfo) => {
    if (profile.isDefault) {
      setNotice("default profile 不能删除。");
      return;
    }
    const confirmed = window.confirm(`删除 Profile「${profile.name}」？该操作会调用 Hermes CLI 删除对应 profile。`);
    if (!confirmed) return;
    setProfileBusy(true);
    try {
      const next = await deleteHermesProfile({ name: profile.name });
      setProfiles(next);
      if (profile.active || currentChatProfile === profile.name) {
        if (chatAgent) updateAgentProfile(chatAgent.id, "default");
        await activateProfile("default");
      }
      setNotice(`Profile 已删除：${profile.name}`);
    } catch (error) {
      setNotice(`删除 Profile 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setProfileBusy(false);
    }
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
      setNetworkSettings((current) => ({
        ...current,
        remoteChatTransport: saved.remoteChatTransport,
        sshChatTransport: saved.sshChatTransport,
      }));
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
      await refreshInstallStatus();
      await refreshHermesCapabilities(targetProfile);
      await refreshConfigHealth(targetProfile);
      return result.ok;
    } catch (error) {
      const message = runtimeErrorMessage(error);
      setNotice(`生成 API_SERVER_KEY 失败：${message}`);
      return false;
    } finally {
      setKeyBusy(false);
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
      setNotice(`修复配置失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`模型已保存：${saved.name}`);
      resetModelForm();
      await refreshHermesCapabilities(installStatus?.activeProfile);
      await refreshConfigHealth(installStatus?.activeProfile);
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
      await refreshConfigHealth(installStatus?.activeProfile);
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
      await refreshConfigHealth(targetProfile);
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
    void refreshConfigHealth(profileName);
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
      await refreshConfigHealth(targetProfile);
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
      await refreshConfigHealth(targetProfile);
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
      setNotice(`OAuth 登录失败：${runtimeErrorMessage(error)}`);
    } finally {
      setOauthBusyProvider(null);
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
      setNotice(`${item.label} 辅助模型已保存到 ${targetProfile}。`);
      await refreshConfigHealth(targetProfile);
    } catch (error) {
      setNotice(`保存辅助模型失败：${runtimeErrorMessage(error)}`);
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
      setNotice("模型库已刷新。");
    } catch (error) {
      setNotice(`刷新模型库失败：${runtimeErrorMessage(error)}`);
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
    setNotice(`已填入 ${provider.label} · ${model.id}，确认后保存。`);
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

  const refreshMcpCatalog = async () => {
    const targetProfile = installStatus?.activeProfile ?? profiles.find((profile) => profile.active)?.name ?? "default";
    setCapabilityBusy(true);
    try {
      const next = await listHermesMcpCatalog({ profile: targetProfile });
      setMcpCatalog(next.entries);
      setMcpCatalogDiagnostics(next.diagnostics);
      setMcpCatalogError(next.error ?? "");
      setNotice(next.error ? `MCP Catalog 刷新失败：${next.error}` : "MCP Catalog 已刷新。");
    } catch (error) {
      setNotice(`刷新 MCP Catalog 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(result.success ? `${server.name} MCP 测试完成。` : `${server.name} MCP 测试失败：${result.error ?? result.output}`);
    } catch (error) {
      setNotice(`测试 MCP server 失败：${runtimeErrorMessage(error)}`);
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
        setNotice(`${entry.name} 已通过 hermes mcp install 安装。`);
      } else {
        setNotice(`安装 MCP catalog entry 失败：${result.error ?? result.output}`);
      }
    } catch (error) {
      setNotice(`安装 MCP catalog entry 失败：${runtimeErrorMessage(error)}`);
    } finally {
      setMcpCatalogBusyName(null);
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
      setNotice("SOUL.md（Persona）已保存。");
    } catch (error) {
      setNotice(`保存 Persona 失败：${runtimeErrorMessage(error)}`);
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
        setNotice(result.error || "新增 Memory 失败。");
        return;
      }
      setNewMemoryEntry("");
      await refreshHermesCapabilities(targetProfile);
      setNotice("Memory 条目已新增。");
    } catch (error) {
      setNotice(`新增 Memory 失败：${runtimeErrorMessage(error)}`);
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
        setNotice(result.error || "更新 Memory 失败。");
        return;
      }
      setEditingMemoryIndex(null);
      setEditingMemoryDraft("");
      await refreshHermesCapabilities(targetProfile);
      setNotice("Memory 条目已更新。");
    } catch (error) {
      setNotice(`更新 Memory 失败：${runtimeErrorMessage(error)}`);
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
        setNotice(result.error || "删除 Memory 失败。");
        return;
      }
      if (editingMemoryIndex === index) {
        setEditingMemoryIndex(null);
        setEditingMemoryDraft("");
      }
      await refreshHermesCapabilities(targetProfile);
      setNotice("Memory 条目已删除。");
    } catch (error) {
      setNotice(`删除 Memory 失败：${runtimeErrorMessage(error)}`);
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
      setBundledSkills(await listHermesBundledSkills({ profile: targetProfile }));
      setSkillInstallForm(emptySkillInstallForm);
      setSkillQuery("");
      setNotice(`Skill 已安装到 ${targetProfile}。`);
    } catch (error) {
      setNotice(`安装 Skill 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`Skill 已安装：${skill.name}`);
    } catch (error) {
      setNotice(`安装 bundled Skill 失败：${runtimeErrorMessage(error)}`);
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
      setNotice(`读取 Skill 详情失败：${runtimeErrorMessage(error)}`);
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
      setRuntimeEvents([]);
      setNotice("当前会话已清空。");
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
      commands: SLASH_COMMANDS,
    })
      .then((reply) => appendReply(reply ?? "命令无输出。"))
      .catch((error) => appendReply(`命令执行失败：${runtimeErrorMessage(error)}`));
  };

  const sendMessage = (contentOverride?: string) => {
    const content = (contentOverride ?? draft).trim();
    if (!content && draftAttachments.length === 0) return;
    const browseUrl = parseBrowseCommand(content);
    if (browseUrl) {
      setWebPreviewUrl(browseUrl);
      setDraft("");
      setDraftAttachments([]);
      setNotice(`已打开 Web preview：${browseUrl}`);
      return;
    }
    const slashName = slashCommandName(content);
    if (slashName === "/new") {
      setDraft("");
      setDraftAttachments([]);
      void createNewSession();
      return;
    }
    if (slashName === "/clear") {
      setDraft("");
      setDraftAttachments([]);
      clearChat();
      return;
    }
    if (isLocalReplyCommand(content)) {
      runLocalSlashCommand(content);
      return;
    }
    const attachments = contentOverride ? [] : draftAttachments;
    const backgroundQuestion = parseBackgroundCommand(content);
    if (hasActiveSessionTasks(state) && backgroundQuestion === null) {
      setQueuedMessages((current) => [
        ...current,
        {
          id: `queued-${Date.now()}-${Math.random().toString(16).slice(2)}`,
          text: content || "请查看附件并处理。",
          attachments,
        },
      ]);
      setDraft("");
      setDraftAttachments([]);
      setNotice("当前 Agent 正在执行，消息已加入队列。");
      return;
    }
    parallelTrackerRef.current.markUserIntervention(state.workspace.id);
    serialTrackerRef.current.markUserIntervention(state.workspace.id);
    const result = handleUserMessage(
      state,
      backgroundQuestion !== null ? `💭 ${backgroundQuestion || content}` : content || "请查看附件并处理。",
      attachments,
    );
    setState(result.state);
    setNotice(backgroundQuestion !== null ? "旁支问题已启动，不会阻塞主对话。" : result.notice);
    setDraft("");
    setDraftAttachments([]);
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
    scheduleDispatchedTasks(result.state, result.createdTaskIds);
  };

  const regenerateFromMessage = (messageId: string) => {
    if (hasActiveSessionTasks(state)) {
      setNotice("当前会话仍有运行中的 Agent，请先停止后再重新生成。");
      return;
    }
    const index = state.messages.findIndex((message) => message.id === messageId);
    if (index < 0) return;
    const previousUser = [...state.messages.slice(0, index)]
      .reverse()
      .find((message) => message.authorKind === "user");
    if (!previousUser) {
      setNotice("没有找到可重新生成的用户消息。");
      return;
    }
    setDraftAttachments([]);
    sendMessage(previousUser.content);
  };

  const branchFromMessage = (messageId: string) => {
    if (hasActiveSessionTasks(state)) {
      setNotice("当前会话仍有运行中的 Agent，请先停止后再分支。");
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
    };
    parallelTrackerRef.current.clear(state.workspace.id);
    serialTrackerRef.current.clear(state.workspace.id);
    cancelledTaskIdsRef.current.clear();
    setState(nextState);
    setDraft("");
    setDraftAttachments([]);
    setRuntimeEvents([]);
    setActiveView("team");
    setNotice("已在新对话中分支。");
    if (isTauriRuntimeAvailable()) {
      void saveHermesTeamState(nextState).catch(() => undefined);
      void saveHermesTeamSession(buildSessionSummary(nextState))
        .then((items) => setSessions(normalizeLoadedSessions(items)))
        .catch(() => undefined);
    }
  };

  const removeQueuedMessage = (id: string) => {
    setQueuedMessages((current) => current.filter((item) => item.id !== id));
  };

  const scheduleDispatchedTasks = (nextState: OrchestrationState, taskIds: string[]) => {
    window.setTimeout(() => {
      for (const taskId of taskIds) {
        void runDispatchedTask(nextState, taskId);
      }
    }, 0);
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
      const output = await runHermesTaskStream({
        task,
        agent,
        binding,
        messages: baseState.messages,
      });
      const content = output.content;
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
          const replayedState = (output.events ?? []).reduce(
            (nextState, event) => applyStreamEventSnapshot(nextState, event),
            current,
          );
          if (replayedState.messages.some((message) => message.id === streamMessageId)) {
            const shouldReplacePlaceholder = content.trim().length > 0;
            return {
              ...replayedState,
              messages: replayedState.messages.map((message) =>
                message.id === streamMessageId && shouldReplacePlaceholder
                  ? {
                      ...message,
                      content: message.content === "正在生成..." || message.content.trim().length === 0 ? content : message.content,
                    }
                  : message,
              ),
              tasks: replayedState.tasks.map((item) =>
                item.id === taskId ? { ...item, status: "completed", completedAt: Date.now() } : item,
              ),
            };
          }
          return completeTaskWithAgentMessage({
            state: current,
            taskId,
            content,
          });
        }
        const shouldReplacePlaceholder = content.trim().length > 0;
        return {
          ...current,
          messages: current.messages.map((message) =>
            message.id === streamMessageId && shouldReplacePlaceholder
              ? {
                  ...message,
                  content: message.content === "正在生成..." || message.content.trim().length === 0 ? content : message.content,
                }
              : message,
          ),
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

  useEffect(() => {
    if (queuedMessages.length === 0 || hasActiveSessionTasks(state)) return;
    const [next] = queuedMessages;
    if (!next) return;
    setQueuedMessages((current) => current.slice(1));
    const result = handleUserMessage(state, next.text, next.attachments);
    setState(result.state);
    setNotice("正在发送队列中的下一条消息。");
    scheduleDispatchedTasks(result.state, result.createdTaskIds);
  }, [queuedMessages, state]);

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

  return (
    <main
      className={`app-shell ${activeView !== "team" || !showInspector ? "app-shell-utility" : ""} ${
        sidebarCollapsed ? "app-shell-collapsed" : ""
      }`.trim()}
    >
      <aside className={`sidebar ${sidebarCollapsed ? "sidebar-collapsed" : ""}`.trim()}>
        <div className="brand">
          <div className="brand-mark">HT</div>
          <div className="brand-text">
            <strong>Hermes Team</strong>
            <span>Hermes Agent 工作台</span>
          </div>
          <button
            className="sidebar-collapse-btn"
            type="button"
            onClick={() => setSidebarCollapsed((value) => !value)}
            title={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
            aria-label={sidebarCollapsed ? "展开侧栏" : "收起侧栏"}
          >
            {sidebarCollapsed ? <PanelLeftOpen size={18} /> : <PanelLeftClose size={18} />}
          </button>
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

          <div className="nav-group">
            <p className="nav-group-label">工作区</p>
            <button
              className={`workspace-item ${
                activeView === "team" && !scratchSession ? "active" : ""
              }`}
              type="button"
              onClick={() => setActiveView("team")}
              title="聊天"
              aria-label="聊天"
            >
              <MessageSquareText size={18} />
              <span>聊天</span>
            </button>
          </div>

          <div className="nav-group">
            <p className="nav-group-label">自动化</p>
            <button
              className={`workspace-item ${
                activeView === "settings" && activeSettingsPanel === "schedules" ? "active" : ""
              }`}
              type="button"
              onClick={() => {
                setActiveView("settings");
                setActiveSettingsPanel("schedules");
                void refreshInstallStatus();
                void refreshCronJobs();
              }}
              title="定时任务"
              aria-label="定时任务"
            >
              <CalendarClock size={18} />
              <span>定时任务</span>
            </button>
          </div>

          <div className="nav-group">
            <p className="nav-group-label">系统</p>
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
                void refreshHermesLogs();
              }}
              title="设置"
              aria-label="设置"
            >
              <Settings size={18} />
              <span>设置</span>
            </button>
          </div>
        </nav>

        {!sidebarCollapsed && (
          <SidebarRecentSessions
            sessions={sessions}
            formatTime={formatTime}
            onRestore={(session) => void restoreSession(session)}
            onShowAll={() => setActiveView("sessions")}
          />
        )}

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

              <section className={settingsCardClass("overview", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Config Health</p>
                    <h2>配置健康检查</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={configHealthBusy}
                    type="button"
                    onClick={() => void refreshConfigHealth(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{configHealthBusy ? "检查中..." : "重新检查"}</span>
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
                      <p className="empty-note">配置健康检查通过。</p>
                    ) : (
                      <div className="config-health-list">
                        {configHealth.issues.map((issue) => (
                          <article className={`config-health-issue ${issue.severity}`} key={issue.code}>
                            <div>
                              <div className="config-health-title">
                                <strong>{issue.message}</strong>
                                <em>{configSeverityLabel(issue.severity)}</em>
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
                                <span>{configFixingCode === issue.code ? "修复中..." : issue.fixDescription ?? "修复"}</span>
                              </button>
                            )}
                          </article>
                        ))}
                      </div>
                    )}
                  </div>
                ) : (
                  <p className="empty-note">尚未运行配置健康检查。</p>
                )}
              </section>

              <section className={settingsCardClass("appearance", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Appearance</p>
                    <h2>外观设置</h2>
                  </div>
                  <span className="count-pill">{settingsBusy ? "Saving" : "Local"}</span>
                </div>
                <div className="appearance-panel">
                  <div>
                    <h3>Theme</h3>
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
                        <strong>Rounded corners</strong>
                        <small>控制应用界面的圆角显示。</small>
                      </span>
                      <input
                        checked={appSettings.roundedCorners}
                        type="checkbox"
                        onChange={(event) => void updateAppSettings({ roundedCorners: event.target.checked })}
                      />
                    </label>
                    <div>
                      <h3>Font</h3>
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

              <section className={settingsCardClass("network", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Network</p>
                    <h2>网络设置</h2>
                  </div>
                  <button
                    className="refresh-runtime"
                    disabled={networkBusy}
                    type="button"
                    onClick={() => void refreshNetworkSettings(installStatus?.activeProfile)}
                  >
                    <RefreshCw size={14} />
                    <span>{networkBusy ? "读取中..." : "刷新"}</span>
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
                      <span>{profileBusy ? "处理中..." : "刷新"}</span>
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
                      <span>创建 Profile</span>
                    </button>
                  </div>

                  <div className="profile-card-grid">
                    {profiles.length > 0 ? (
                      profiles.map((profile) => (
                        <article className={`profile-card ${profile.active ? "active" : ""}`} key={profile.name}>
                          <div className="profile-card-head">
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
                            <button disabled={profileBusy || profile.active} type="button" onClick={() => void activateProfile(profile.name)}>
                              <Plug size={14} />
                              <span>{profile.active ? "已激活" : "激活"}</span>
                            </button>
                            <button disabled={profileBusy} type="button" onClick={() => void activateProfile(profile.name, true)}>
                              <MessageSquareText size={14} />
                              <span>聊天</span>
                            </button>
                            {!profile.isDefault && (
                              <button disabled={profileBusy} type="button" onClick={() => void deleteProfileByName(profile)}>
                                <Trash2 size={14} />
                                <span>删除</span>
                              </button>
                            )}
                          </div>
                        </article>
                      ))
                    ) : (
                      <p className="empty-note">未读取到 Hermes profile。请先刷新 Runtime。</p>
                    )}
                  </div>
                </div>
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

                <div className="provider-registry-panel">
                  <div className="settings-card-head compact-head">
                    <div>
                      <p className="panel-label">Provider Registry</p>
                      <h3>Provider 注册表诊断</h3>
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
                              <span>{oauthBusyProvider === provider.id ? "登录中..." : "OAuth 登录"}</span>
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
                              <span>探测</span>
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

                  <div className="model-subpanel">
                    <div className="model-subpanel-head">
                      <div>
                        <strong>辅助模型</strong>
                        <span>为 Hermes 的标题、压缩、图片理解等后台任务单独指定模型。</span>
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
                                  placeholder="auto 使用主模型"
                                />
                              </label>
                              <label>
                                <span>Base URL</span>
                                <input
                                  value={item.baseUrl}
                                  onChange={(event) => updateAuxiliaryModelDraft(item.task, { baseUrl: event.target.value })}
                                  placeholder="可选"
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
                                  placeholder="可选"
                                />
                              </label>
                            </div>
                            <div className="model-card-actions">
                              <button disabled={busy} type="button" onClick={() => void saveAuxiliaryModel(item)}>
                                <Save size={14} />
                                <span>{busy ? "保存中..." : "保存"}</span>
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
                        <span>从 Hermes provider registry、默认模型、本地模型和 OAuth registry 聚合。</span>
                      </div>
                      <button className="refresh-runtime" disabled={registryBusy} type="button" onClick={() => void refreshRegistryLibrary()}>
                        <RefreshCw size={14} />
                        <span>{registryBusy ? "刷新中..." : "刷新模型库"}</span>
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
                        <p className="empty-note">模型库暂无可显示模型。可以先刷新 Provider 或保存一个模型。</p>
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

              <section className={settingsCardClass("messaging", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Messaging</p>
                    <h2>消息平台</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{messagingResponse?.platforms.length ?? 0}</span>
                    <button className="refresh-runtime" disabled={messagingBusy} type="button" onClick={() => void refreshMessagingPlatforms(installStatus?.activeProfile)}>
                      <RefreshCw size={14} />
                      <span>{messagingBusy ? "读取中..." : "刷新"}</span>
                    </button>
                  </div>
                </div>

                {messagingResponse ? (
                  <div className="messaging-platform-list">
                    {messagingResponse.platforms.map((platform) => (
                      <article className={`messaging-platform-card ${platform.enabled ? "enabled" : ""}`} key={platform.id}>
                        <div className="messaging-platform-head">
                          <div>
                            <strong>{platform.name}</strong>
                            <span>{platform.description}</span>
                            <small>{platform.state ?? "unknown"} · {platform.configured ? "configured" : "not configured"} · {messagingResponse.source}</small>
                          </div>
                          <div className="model-card-actions">
                            <button disabled={messagingBusy} type="button" onClick={() => void toggleMessagingPlatform(platform)}>
                              <Power size={14} />
                              <span>{platform.enabled ? "禁用" : "启用"}</span>
                            </button>
                            <button disabled={messagingBusy} type="button" onClick={() => void runMessagingPlatformTest(platform)}>
                              <Plug size={14} />
                              <span>测试</span>
                            </button>
                          </div>
                        </div>

                        <div className="messaging-env-grid">
                          {platform.envVars.map((field) => (
                            <label className={field.required ? "required" : ""} key={field.key}>
                              <span>{field.prompt || field.key}</span>
                              <input
                                type={field.isPassword ? "password" : "text"}
                                value={messagingEnvDrafts[platform.id]?.[field.key] ?? ""}
                                onChange={(event) =>
                                  setMessagingEnvDrafts((current) => ({
                                    ...current,
                                    [platform.id]: {
                                      ...(current[platform.id] ?? {}),
                                      [field.key]: event.target.value,
                                    },
                                  }))
                                }
                                placeholder={field.redactedValue ?? field.key}
                              />
                              <small>{field.key}{field.isSet ? ` · ${field.redactedValue}` : ""}</small>
                              {field.isSet && (
                                <button disabled={messagingBusy} type="button" onClick={() => void clearMessagingEnv(platform, field.key)}>
                                  清空
                                </button>
                              )}
                            </label>
                          ))}
                        </div>

                        <div className="settings-actions messaging-actions">
                          <button className="refresh-runtime" disabled={messagingBusy} type="button" onClick={() => void saveMessagingPlatformEnv(platform)}>
                            <Save size={14} />
                            <span>保存 env</span>
                          </button>
                        </div>

                        <div className="messaging-toolset-grid">
                          {platform.toolsets.map((toolset) => (
                            <button
                              className={`${toolset.enabled ? "selected" : ""} ${toolset.risk === "high" ? "high-risk" : ""}`}
                              disabled={messagingBusy}
                              key={toolset.key}
                              type="button"
                              title={toolset.description}
                              onClick={() => void toggleMessagingToolset(platform, toolset.key, !toolset.enabled)}
                            >
                              {toolset.label}
                            </button>
                          ))}
                        </div>
                      </article>
                    ))}
                  </div>
                ) : (
                  <p className="empty-note">尚未读取 Messaging Platforms；这里会绑定真实 Hermes config、env 与 Gateway API。</p>
                )}
              </section>

              <section className={settingsCardClass("schedules", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Schedules</p>
                    <h2>定时任务排程</h2>
                  </div>
                  <div className="settings-actions">
                    <span className="count-pill">{cronJobs.length}</span>
                    <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => void refreshCronJobs(installStatus?.activeProfile)}>
                      <RefreshCw size={14} />
                      <span>{cronBusy ? "读取中..." : "刷新"}</span>
                    </button>
                  </div>
                </div>

                <div className="model-panel">
                  <div className="model-form">
                    {cronEditId && (
                      <div className="cron-edit-banner model-form-wide">
                        <Pencil size={13} />
                        <span>正在编辑任务，保存后将更新现有排程。</span>
                        <button type="button" onClick={cancelCronEdit}>
                          取消
                        </button>
                      </div>
                    )}
                    <label>
                      <span>名称</span>
                      <input
                        ref={cronNameInputRef}
                        value={cronForm.name}
                        onChange={(event) => setCronForm((current) => ({ ...current, name: event.target.value }))}
                        placeholder="每日摘要"
                      />
                    </label>
                    <label>
                      <span>重复次数</span>
                      <input
                        type="number"
                        min={1}
                        value={cronForm.repeatTimes}
                        onChange={(event) => setCronForm((current) => ({ ...current, repeatTimes: event.target.value }))}
                        placeholder="留空 = 一直运行"
                      />
                    </label>
                    <div className="cron-builder model-form-wide">
                      <span className="cron-builder-title">调度频率</span>
                      <div className="cron-freq-tabs">
                        {CRON_FREQ_OPTIONS.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={cronForm.freq === option.id ? "active" : ""}
                            onClick={() => setCronForm((current) => ({ ...current, freq: option.id }))}
                          >
                            {option.label}
                          </button>
                        ))}
                      </div>

                      <div className="cron-builder-controls">
                        {cronForm.freq === "minutes" && (
                          <div className="cron-control-row">
                            <span>每</span>
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
                            <span>分钟执行一次</span>
                          </div>
                        )}
                        {cronForm.freq === "hourly" && (
                          <div className="cron-control-row">
                            <span>每小时第</span>
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
                            <span>分钟执行</span>
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
                                    {day.short}
                                  </button>
                                ))}
                              </div>
                            )}
                            <div className="cron-control-row">
                              <span>时间</span>
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
                            <span className="cron-preview-desc">{describeCronSchedule(cronForm)}</span>
                            {cronNextRun && (
                              <span className="cron-preview-next">
                                下次将在 {formatCronRelative(cronNextRun.toISOString())}（
                                {formatCronDate(cronNextRun.toISOString())}）运行
                              </span>
                            )}
                          </>
                        )}
                      </div>
                    </div>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">投递目标</span>
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
                      <span className="cron-field-hint">未选时默认投递到 local（保存到 cron 输出目录）。</span>
                    </div>

                    <div className="cron-field model-form-wide">
                      <span className="cron-field-label">关联技能（可选）</span>
                      <div className="cron-chip-row">
                        {cronForm.skills.length === 0 && (
                          <span className="cron-field-hint">未关联技能时按默认会话运行。</span>
                        )}
                        {cronForm.skills.map((skill) => (
                          <span key={skill} className="cron-skill-chip">
                            {skill}
                            <button
                              type="button"
                              aria-label={`移除 ${skill}`}
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
                          placeholder="技能名，回车添加"
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
                      <span>Prompt</span>
                      <textarea
                        value={cronForm.prompt}
                        onChange={(event) => setCronForm((current) => ({ ...current, prompt: event.target.value }))}
                        placeholder="定时执行的真实 Hermes prompt"
                      />
                    </label>
                    <div className="model-form-actions">
                      <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => void submitCronForm()}>
                        <Save size={14} />
                        <span>{cronEditId ? "保存修改" : "创建"}</span>
                      </button>
                      {cronEditId ? (
                        <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={cancelCronEdit}>
                          <X size={14} />
                          <span>取消编辑</span>
                        </button>
                      ) : (
                        <button className="refresh-runtime" disabled={cronBusy} type="button" onClick={() => setCronForm(emptyCronJobForm)}>
                          <Plus size={14} />
                          <span>重置</span>
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
                        const nextRelative = formatCronRelative(job.nextRunAt);
                        const lastRelative = formatCronRelative(job.lastRunAt);
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
                                {cronEditId === job.id && <span className="schedule-editing-tag">编辑中</span>}
                              </div>
                              <div className="schedule-card-meta">
                                <span className="schedule-meta-item">
                                  <Clock size={13} />
                                  {job.schedule}
                                </span>
                                {job.repeat?.times != null && (
                                  <span className="schedule-meta-item">
                                    <Repeat size={13} />
                                    已执行 {job.repeat.completed}/{job.repeat.times}
                                  </span>
                                )}
                                <span
                                  className="schedule-meta-item"
                                  title={job.nextRunAt ? formatCronDate(job.nextRunAt) : undefined}
                                >
                                  下次 {nextRelative ?? formatCronDate(job.nextRunAt)}
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
                                  上次 {lastKind === "fail" ? "失败" : lastKind === "ok" ? "成功" : "未运行"}
                                </span>
                              </div>
                              {job.prompt && <p className="schedule-card-prompt">{job.prompt}</p>}
                              <div className="schedule-card-deliver">
                                <span className="schedule-deliver-label">投递</span>
                                {deliverTargets.map((target) => (
                                  <span className="schedule-chip" key={target}>
                                    {target}
                                  </span>
                                ))}
                              </div>
                              {job.lastError && (
                                <details className="schedule-error">
                                  <summary>上次失败原因</summary>
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
                                <span>运行</span>
                              </button>
                              <button
                                className="schedule-action"
                                disabled={cronBusy}
                                type="button"
                                onClick={() => startCronEdit(job)}
                              >
                                <Pencil size={14} />
                                <span>编辑</span>
                              </button>
                              {job.state === "paused" ? (
                                <button
                                  className="schedule-action"
                                  disabled={cronBusy}
                                  type="button"
                                  onClick={() => void runCronJobOperation(job, "resume")}
                                >
                                  <Power size={14} />
                                  <span>恢复</span>
                                </button>
                              ) : (
                                <button
                                  className="schedule-action"
                                  disabled={cronBusy}
                                  type="button"
                                  onClick={() => void runCronJobOperation(job, "pause")}
                                >
                                  <Pause size={14} />
                                  <span>暂停</span>
                                </button>
                              )}
                              <button
                                className="schedule-action schedule-action-danger"
                                disabled={cronBusy}
                                type="button"
                                onClick={() => void runCronJobOperation(job, "remove")}
                              >
                                <Trash2 size={14} />
                                <span>删除</span>
                              </button>
                            </div>
                          </article>
                        );
                      })
                    ) : (
                      <div className="schedule-empty">
                        <Clock size={26} />
                        <strong>还没有定时任务</strong>
                        <span>创建一个排程，让 Hermes 按时自动执行 prompt 并投递结果。</span>
                        <button type="button" onClick={() => cronNameInputRef.current?.focus()}>
                          <Plus size={14} />
                          <span>新建第一个定时任务</span>
                        </button>
                      </div>
                    )}
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
                <div className="tools-remote-pane">
                  <div>
                    <strong>Tools 运行位置</strong>
                    <span>
                      {remoteConfig.mode === "local"
                        ? "本机 Hermes profile"
                        : remoteConfig.mode === "remote"
                          ? "远程 Hermes Gateway"
                          : "SSH 隧道到 Hermes Gateway"}
                    </span>
                  </div>
                  <div>
                    <strong>连接状态</strong>
                    <span>{remoteStatus?.message ?? "尚未测试远程连接"}</span>
                  </div>
                  <div>
                    <strong>Base URL</strong>
                    <span>{remoteStatus?.baseUrl || (remoteConfig.mode === "remote" ? remoteConfig.remoteUrl : "local profile")}</span>
                  </div>
                  <button className="refresh-runtime" disabled={remoteBusy} type="button" onClick={() => void refreshRemoteConnection()}>
                    <RefreshCw size={14} />
                    <span>刷新连接</span>
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
                                    {toolset.enabled ? "关闭" : "开启"}
                                  </button>
                                </article>
                              ))}
                            </div>
                          </section>
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
                              <button disabled={mcpBusyServer === server.name} type="button" onClick={() => void testMcpServer(server)}>
                                {mcpBusyServer === server.name ? "测试中" : "测试"}
                              </button>
                              <button type="button" onClick={() => editMcpServer(server)}>编辑</button>
                              <button disabled={capabilityBusy} type="button" onClick={() => void deleteMcpServer(server)}>删除</button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">当前 profile 未配置 MCP server。</p>
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
                          <p className="empty-note">没有解析到 tools；请查看原始输出。</p>
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
                          <span>刷新 Catalog</span>
                        </button>
                      </div>
                      <div className="session-search">
                        <Search size={14} />
                        <input
                          value={mcpCatalogQuery}
                          onChange={(event) => setMcpCatalogQuery(event.target.value)}
                          placeholder="搜索 MCP catalog"
                        />
                        <button type="button" onClick={() => setMcpCatalogQuery("")}>
                          <StopCircle size={13} />
                        </button>
                      </div>
                      {mcpCatalogError && <p className="warning-text">Catalog 命令失败：{mcpCatalogError}</p>}
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
                                  {entry.installed ? "已安装" : mcpCatalogBusyName === entry.name ? "安装中" : "安装"}
                                </button>
                              </div>
                            </article>
                          ))
                        ) : (
                          <p className="empty-note">未读取到 catalog entry；如果 Hermes CLI 不支持 catalog，会在上方显示真实错误。</p>
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
                    <h2>Skills 管理</h2>
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
                      placeholder="搜索 name/category/description"
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void searchSkills()}>
                      <Search size={14} />
                      <span>搜索</span>
                    </button>
                  </div>
                  <div className="skill-search">
                    <input
                      value={skillCatalogQuery}
                      onChange={(event) => setSkillCatalogQuery(event.target.value)}
                      placeholder="搜索 bundled skills"
                    />
                    <button className="refresh-runtime" disabled={skillBusy} type="button" onClick={() => void refreshHermesCapabilities(installStatus?.activeProfile)}>
                      <RefreshCw size={14} />
                      <span>刷新</span>
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
                                详情
                              </button>
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
                                详情
                              </button>
                              <button disabled={skillBusy || skill.installed} type="button" onClick={() => void installBundledSkill(skill)}>
                                {skill.installed ? "已安装" : "安装"}
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <p className="empty-note">未发现 bundled Skill，确认 Hermes Agent 已安装。</p>
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
                        <span>关闭</span>
                      </button>
                    </div>
                    <pre>{skillDetailContent || "未读取到 SKILL.md 内容。"}</pre>
                  </div>
                  )}
              </section>

              <section className={settingsCardClass("memory", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Memory</p>
                    <h2>记忆管理</h2>
                  </div>
                </div>
                {memoryDetails && memorySummary ? (
                  <div className="memory-editor">
                    <div className="settings-rows memory-summary-grid">
                      <StatusRow label="MEMORY.md" value={`${memorySummary.memoryEntries} 条 · ${memoryDetails.memory.charCount}/${memoryDetails.memory.charLimit} chars`} ok={memorySummary.memoryExists} />
                      <StatusRow label="USER.md" value={`${memoryDetails.user.charCount}/${memoryDetails.user.charLimit} chars`} ok={memorySummary.userExists} />
                      <StatusRow label="state.db" value={`${memoryDetails.stats.totalSessions} sessions · ${memoryDetails.stats.totalMessages} messages`} ok />
                    </div>

                    <div className="memory-entry-compose">
                      <textarea
                        value={newMemoryEntry}
                        onChange={(event) => setNewMemoryEntry(event.target.value)}
                        placeholder="新增一条长期记忆..."
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
                          <span>新增 Memory</span>
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
                                      <span>保存</span>
                                    </button>
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => {
                                      setEditingMemoryIndex(null);
                                      setEditingMemoryDraft("");
                                    }}>
                                      <span>取消</span>
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
                                      <span>编辑</span>
                                    </button>
                                    <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => {
                                      if (window.confirm("删除这条 Memory？")) {
                                        void deleteMemoryEntry(entry.index);
                                      }
                                    }}>
                                      <Trash2 size={14} />
                                      <span>删除</span>
                                    </button>
                                  </div>
                                </>
                              )}
                            </article>
                          );
                        })
                      ) : (
                        <p className="empty-note">当前 MEMORY.md 还没有条目。</p>
                      )}
                    </div>

                    <div className="memory-raw-grid">
                      <label>
                        <span>MEMORY.md 原始内容</span>
                        <textarea
                          value={memoryDraft.memory}
                          onChange={(event) => setMemoryDraft((current) => ({ ...current, memory: event.target.value }))}
                          placeholder="MEMORY.md"
                        />
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void saveMemoryDraft("memory")}>
                          <Save size={14} />
                          <span>保存 MEMORY</span>
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
                          <span>保存 USER</span>
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
                          placeholder="描述该 Agent 的人格、语气与行为准则（写入 profile 的 SOUL.md）"
                        />
                        <button className="refresh-runtime" disabled={capabilityBusy} type="button" onClick={() => void savePersonaDraft()}>
                          <Save size={14} />
                          <span>保存 Persona</span>
                        </button>
                      </label>
                    </div>
                    {personaContent && <p className="empty-note">{personaContent.path}</p>}
                  </div>
                ) : (
                  <p className="empty-note">尚未读取 Memory 摘要。</p>
                )}
              </section>

              <section className={settingsCardClass("update", "settings-card-wide")}>
                <div className="settings-card-head">
                  <div>
                    <p className="panel-label">Update</p>
                    <h2>更新检查</h2>
                  </div>
                  <div className="settings-actions">
                    <button className="refresh-runtime" disabled={updateBusy} type="button" onClick={() => void checkUpdatesNow()}>
                      <RefreshCw size={14} />
                      <span>{updateBusy ? "检查中..." : "检查版本"}</span>
                    </button>
                    <button className="refresh-runtime" disabled={updateBusy} type="button" onClick={() => void runHermesUpdateNow()}>
                      <Upload size={14} />
                      <span>{updateBusy ? "运行中..." : "运行 hermes update"}</span>
                    </button>
                  </div>
                </div>
                {updateStatus ? (
                  <div className="update-panel">
                    <div className="settings-rows">
                      <StatusRow label="App Version" value={updateStatus.appVersion} ok />
                      <StatusRow label="Hermes CLI" value={updateStatus.hermesVersion ?? "未找到"} ok={Boolean(updateStatus.hermesVersion)} />
                      <StatusRow label="Last Check" value={formatTime(updateStatus.lastCheckedAt)} ok />
                      <StatusRow label="Update Log" value={updateStatus.logPath} ok />
                    </div>
                    <label className="settings-toggle-row">
                      <span>
                        <strong>Auto upgrade</strong>
                        <small>保存自动更新偏好；手动更新仍走 hermes update。</small>
                      </span>
                      <input
                        checked={updateStatus.autoUpgrade}
                        type="checkbox"
                        onChange={(event) => void toggleAutoUpgrade(event.target.checked)}
                      />
                    </label>
                    <p className="empty-note">{updateStatus.message}</p>
                    {updateOutput && <pre className="update-output">{updateOutput}</pre>}
                  </div>
                ) : (
                  <p className="empty-note">尚未读取更新状态。</p>
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
            onRefresh={() => void refreshLocalSessions()}
            onRename={(sessionId, title) => void renameSession(sessionId, title)}
            onDelete={(sessionId) => void deleteSession(sessionId)}
            desktopSessions={desktopSessions}
            desktopBusy={desktopSessionsBusy}
            onRefreshDesktopSessions={() => void refreshDesktopSessions()}
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
            activeModel?.contextLength && tokenUsage?.promptTokens
              ? { used: tokenUsage.promptTokens, window: activeModel.contextLength }
              : null
          }
          readiness={
            runtimeStatus.state === "unavailable"
              ? {
                  ok: false,
                  message: runtimeStatus.message || "Hermes 运行时不可用",
                  fixLabel: "打开设置",
                  onFix: () => {
                    setActiveView("settings");
                    setActiveSettingsPanel("overview");
                  },
                }
              : !activeModel?.model
                ? {
                    ok: false,
                    message: "尚未配置模型，发送可能失败",
                    fixLabel: "配置模型",
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
          activeModel={activeModel}
          reasoningEffort={reasoningEffort}
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
          onRegenerateMessage={regenerateFromMessage}
          onBranchMessage={branchFromMessage}
        />
        {webPreviewUrl && (
          <WebPreviewPanel
            url={webPreviewUrl}
            onClose={() => setWebPreviewUrl(null)}
            onOpenExternal={(url) => {
              void openExternalUrl(url).catch((error) => setNotice(`打开外部浏览器失败：${runtimeErrorMessage(error)}`));
            }}
          />
        )}
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
                  : "Hermes Chat 处于待命状态"}
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

      <footer className="status-bar" aria-label="运行状态">
        <button
          type="button"
          className={`status-pill status-action status-${runtimeStatus.state}`}
          onClick={() => void refreshRuntime()}
          title="点击刷新 Hermes Runtime"
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
              : "未配置"}
          </span>
        </span>
        <ContextUsageStat used={tokenUsage?.promptTokens ?? 0} window={activeModel?.contextLength ?? 0} />
        <span className="status-spacer" />
        <span className="status-seg" title="当前会话已运行时长">
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
          title={installStatus?.gatewayRunning ? "Gateway 运行中（点击刷新）" : "点击启动 Gateway"}
        >
          <span className={`status-led ${installStatus?.gatewayRunning ? "on" : ""}`} />
          <span className="status-val">
            {gatewayBusy ? "启动中..." : installStatus?.gatewayRunning ? "gateway up" : "gateway down"}
          </span>
        </button>
        <span className="status-tag" title="版本 / 距最新 tag 的提交数 / commit">
          {buildLabel() || "Hermes Team"}
        </span>
      </footer>
    </main>
  );
}

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const value = (n / 1_000_000).toFixed(1);
    return `${value.endsWith(".0") ? value.slice(0, -2) : value}M`;
  }
  if (n >= 1000) {
    const value = (n / 1000).toFixed(1);
    return `${value.endsWith(".0") ? value.slice(0, -2) : value}k`;
  }
  return String(Math.round(n));
}

function ContextUsageStat({ used, window: ctxWindow }: { used: number; window: number }) {
  const hasWindow = ctxWindow > 0;
  const hasUsed = used > 0;
  const pct = hasWindow && hasUsed ? Math.min(100, Math.round((used / ctxWindow) * 100)) : 0;
  const usedLabel = hasUsed ? formatTokens(used) : "—";
  const windowLabel = hasWindow ? formatTokens(ctxWindow) : "—";
  return (
    <span
      className="status-seg status-ctx"
      title="上下文占用：最近一轮 prompt tokens / 模型上下文窗口"
    >
      <span className="status-key">ctx</span>
      <span className="status-ctx-bar" aria-hidden>
        <span
          className={`status-ctx-fill ${pct >= 90 ? "hot" : pct >= 70 ? "warm" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="status-val">
        {usedLabel}/{windowLabel}
        {hasUsed && hasWindow ? ` · ${pct}%` : ""}
      </span>
    </span>
  );
}

function SessionTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const label = hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return <span className="status-val status-mono">{label}</span>;
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

function TransportSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: "auto" | "dashboard" | "legacy";
  onChange: (value: "auto" | "dashboard" | "legacy") => void;
}) {
  return (
    <div className="transport-selector">
      <strong>{label}</strong>
      <div>
        {chatTransportOptions.map((option) => (
          <button
            className={value === option.id ? "active" : ""}
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={option.detail}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

function configSeverityLabel(severity: string): string {
  switch (severity) {
    case "error":
      return "错误";
    case "warning":
      return "警告";
    case "info":
      return "提示";
    default:
      return severity;
  }
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

function buildStateFromHermesStateSession(
  session: HermesStateSessionSummary,
  rows: HermesStateMessage[],
  workspaceMode: WorkspaceMode,
): OrchestrationState {
  const base = buildFreshOrchestrationState(workspaceMode);
  const importedWorkspaceId = `desktop-${session.id}`;
  const agentId = base.agents[0]?.id ?? "agent-hermes";
  return {
    ...base,
    workspace: {
      ...base.workspace,
      id: importedWorkspaceId,
      name: "Hermes Chat",
      description: `从本地 state.db 导入：${session.title}`,
    },
    agents: base.agents.map((agent) => ({ ...agent, workspaceId: importedWorkspaceId })),
    messages: rows.map((row, index) => {
      const kind = row.kind === "reasoning" ? "reasoning" : row.kind === "tool" ? "tool" : "message";
      return {
        id: `desktop-${session.id}-${row.kind}-${row.id}-${index}`,
        workspaceId: importedWorkspaceId,
        kind,
        authorKind: row.kind === "user" ? "user" : "agent",
        authorId: row.kind === "user" ? undefined : agentId,
        authorName: row.kind === "user" ? "You" : row.kind === "tool" ? row.name || "工具调用" : "Hermes",
        content: decodeHermesStateContent(row.content),
        createdAt: normalizeHermesStateTimestamp(row.timestamp),
      } satisfies Message;
    }),
    tasks: [],
    logs: [],
  };
}

function normalizeHermesStateTimestamp(value: number): number {
  if (!Number.isFinite(value) || value <= 0) return Date.now();
  return value < 10_000_000_000 ? value * 1000 : value;
}

function decodeHermesStateContent(raw: string): string {
  const prefix = "\u0000json:";
  if (!raw.startsWith(prefix)) return raw;
  try {
    const parsed = JSON.parse(raw.slice(prefix.length));
    if (!Array.isArray(parsed)) return typeof parsed === "string" ? parsed : raw;
    const texts = parsed
      .map((item) => {
        if (typeof item === "string") return item;
        if (!item || typeof item !== "object") return "";
        const record = item as Record<string, unknown>;
        const type = String(record.type || "").toLowerCase();
        if (type === "text" || type === "input_text" || type === "output_text") {
          return typeof record.text === "string" ? record.text : "";
        }
        if (type === "image_url" || type === "input_image") return "[image]";
        return "";
      })
      .filter(Boolean);
    return texts.join("\n\n") || raw;
  } catch {
    return raw;
  }
}

function parseBackgroundCommand(text: string): string | null {
  const match = /^\/(?:btw|bg|background)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  return (match[1] ?? "").trim();
}

function parseBrowseCommand(text: string): string | null {
  const match = /^\/browse(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const value = (match[1] ?? "").trim();
  return value || null;
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
