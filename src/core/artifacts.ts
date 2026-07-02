import type { Artifact, ArtifactChange, ArtifactKind } from "./types";
import type { OrchestrationState } from "./orchestrator";

const WRITE_ARTIFACT_TOOL_NAMES = new Set([
  "write",
  "write_file",
  "edit",
  "edit",
  "edit_file",
  "patch",
  "apply_patch",
  "create_file",
]);

const DOC_EXTENSIONS = new Set(["md", "txt", "rst", "adoc", "markdown"]);
const REPORT_EXTENSIONS = new Set(["pdf", "html", "htm"]);
const CODE_EXTENSIONS = new Set([
  "ts",
  "tsx",
  "js",
  "jsx",
  "py",
  "rs",
  "go",
  "java",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "css",
  "scss",
  "json",
  "yaml",
  "yml",
  "toml",
  "sql",
  "sh",
  "bash",
  "zsh",
]);

export interface ParsedWriteToolEvent {
  status: "completed" | "failed" | "running";
  toolName: string;
  pathHint: string | null;
  detail: string;
}

export function classifyArtifactKind(filePath: string): ArtifactKind {
  const name = filePath.split(/[\\/]/).filter(Boolean).at(-1) ?? filePath;
  const index = name.lastIndexOf(".");
  const ext = index >= 0 ? name.slice(index + 1).toLowerCase() : "";
  if (DOC_EXTENSIONS.has(ext)) return "doc";
  if (REPORT_EXTENSIONS.has(ext)) return "report";
  if (CODE_EXTENSIONS.has(ext)) return "code";
  return "other";
}

export function resolveArtifactPath(path: string, workDir?: string | null): string {
  const trimmed = path.trim();
  if (!trimmed) return trimmed;
  if (trimmed.startsWith("~/")) {
    return trimmed;
  }
  if (trimmed.startsWith("/") || /^[A-Za-z]:[\\/]/.test(trimmed)) {
    return trimmed;
  }
  if (workDir?.trim()) {
    const base = workDir.trim().replace(/[\\/]+$/, "");
    return `${base}/${trimmed.replace(/^\.?[\\/]/, "")}`;
  }
  return trimmed;
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function extractPathFromDetail(detail: string): string | null {
  const jsonMatch = detail.match(/"path"\s*:\s*"([^"]+)"/);
  if (jsonMatch?.[1]) return jsonMatch[1];
  for (const line of detail.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("duration:")) continue;
    if (trimmed.includes("/") || trimmed.includes("\\")) return trimmed;
  }
  return null;
}

export function parseWriteToolEvent(content: string): ParsedWriteToolEvent | null {
  const lines = content.split("\n");
  const firstRaw = (lines[0] ?? "").trim();
  if (!firstRaw) return null;

  let status: ParsedWriteToolEvent["status"] = "running";
  let titleRaw = firstRaw;
  const sep = firstRaw.indexOf(" · ");
  if (sep >= 0) {
    const maybeStatus = firstRaw.slice(0, sep).trim();
    if (maybeStatus === "completed" || maybeStatus === "failed" || maybeStatus === "running") {
      status = maybeStatus;
      titleRaw = firstRaw.slice(sep + 3).trim();
    }
  }

  let toolName = normalizeToolName(titleRaw);
  let pathHint: string | null = null;
  const colon = titleRaw.match(/^([A-Za-z][\w .-]*?):\s+(.+)$/);
  if (colon) {
    toolName = normalizeToolName(colon[1]);
    pathHint = colon[2].trim();
  }

  if (!WRITE_ARTIFACT_TOOL_NAMES.has(toolName)) return null;

  const detail = lines.slice(1).filter((line) => !line.trim().startsWith("duration:")).join("\n").trim();
  if (!pathHint) {
    pathHint = extractPathFromDetail(detail);
  }
  return { status, toolName, pathHint, detail };
}

export function isWriteArtifactToolContent(content: string): boolean {
  return parseWriteToolEvent(content) != null;
}

export function registerArtifactFromToolEvent(
  state: OrchestrationState,
  input: {
    taskId: string;
    callId: string;
    content: string;
    workDir?: string | null;
    now?: number;
  },
): OrchestrationState {
  const parsed = parseWriteToolEvent(input.content);
  if (!parsed || parsed.status !== "completed" || !parsed.pathHint) {
    return state;
  }

  const path = resolveArtifactPath(parsed.pathHint, input.workDir);
  if (!path) return state;

  const now = input.now ?? Date.now();
  const source = `tool-${input.taskId}-${input.callId}`;
  const artifacts = [...(state.artifacts ?? [])];
  const existingIndex = artifacts.findIndex(
    (item) => item.taskId === input.taskId && item.path === path && item.status === "active",
  );

  if (existingIndex >= 0) {
    const existing = artifacts[existingIndex];
    artifacts[existingIndex] = {
      ...existing,
      source,
      kind: classifyArtifactKind(path),
      updatedAt: now,
    };
  } else {
    artifacts.push({
      id: `artifact-${input.taskId}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
      taskId: input.taskId,
      path,
      kind: classifyArtifactKind(path),
      source,
      status: "active",
      createdAt: now,
      updatedAt: now,
    });
  }

  return { ...state, artifacts };
}

export function applyArtifactsFromToolEvents(
  state: OrchestrationState,
  events: Array<{ taskId: string; kind: string; content: string; message?: string }>,
  workDir?: string | null,
): OrchestrationState {
  return events.reduce((current, event) => {
    if (event.kind !== "tool") return current;
    return registerArtifactFromToolEvent(current, {
      taskId: event.taskId,
      callId: event.message ?? "",
      content: event.content,
      workDir,
    });
  }, state);
}

export function updateArtifactChange(
  state: OrchestrationState,
  artifactId: string,
  change: ArtifactChange,
): OrchestrationState {
  const artifacts = state.artifacts ?? [];
  if (!artifacts.some((item) => item.id === artifactId)) return state;
  return {
    ...state,
    artifacts: artifacts.map((item) =>
      item.id === artifactId ? { ...item, change, updatedAt: Date.now() } : item,
    ),
  };
}

export function archiveArtifact(state: OrchestrationState, artifactId: string): OrchestrationState {
  const artifacts = state.artifacts ?? [];
  if (!artifacts.some((item) => item.id === artifactId)) return state;
  return {
    ...state,
    artifacts: artifacts.map((item) =>
      item.id === artifactId ? { ...item, status: "archived", updatedAt: Date.now() } : item,
    ),
  };
}

export function activeArtifactsForTask(state: OrchestrationState, taskId?: string | null): Artifact[] {
  const artifacts = (state.artifacts ?? []).filter((item) => item.status === "active");
  if (!taskId) return artifacts;
  return artifacts.filter((item) => item.taskId === taskId);
}

export function formatArtifactChangeLabel(change?: ArtifactChange): string | null {
  if (!change) return null;
  if (change.added <= 0 && change.removed <= 0) return null;
  if (change.removed > 0) return `+${change.added} −${change.removed}`;
  return `+${change.added}`;
}
