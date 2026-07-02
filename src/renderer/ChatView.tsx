import {
  Activity,
  AlertTriangle,
  ArrowUp,
  AtSign,
  Check,
  ClipboardList,
  ClipboardPaste,
  File as FileIcon,
  FolderOpen,
  FolderTree,
  Image as ImageIcon,
  Link,
  MessageSquarePlus,
  Mic,
  Paperclip,
  Plus,
  Slash,
  Square,
  X,
  XCircle,
} from "lucide-react";
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type ClipboardEvent,
  type DragEvent,
  type KeyboardEvent,
} from "react";
import type { Message, MessageAttachment, WorkMode } from "../core/types";
import type { ReasoningEffort } from "../core/reasoning";
import { useTranslation } from "../i18n";
import { filesFromClipboard } from "./attachmentProcessing";
import { isImeComposing } from "./chatInput/keyboard";
import { SLASH_COMMANDS, type SlashCommand } from "./chatInput/slashCommands";
import { useInputHistory } from "./chatInput/useInputHistory";
import { useVoiceInput } from "./chatInput/useVoiceInput";
import { ChatControls } from "./ChatControls";
import { ClarifyCard } from "./ClarifyCard";
import { MessageRow, ToolCallGroup, TypingIndicator } from "./MessageRow";
import { buildChatTranscript, copyTextToClipboard } from "./chatTranscript";
import { WorktreePanel } from "./WorktreePanel";
import { WorkModePicker } from "./WorkModePicker";
import {
  readDirectory,
  type ActiveModelConfig,
  type DirectoryEntryInfo,
  type HermesProfileInfo,
  type InstalledSkillInfo,
  type SavedModel,
} from "../runtime/hermes-runtime";

interface AtFileEntry {
  name: string;
  path: string;
  rel: string;
}

interface PromptSnippet {
  id: string;
  title: string;
  body: string;
}

const PROMPT_SNIPPETS_KEY = "hermes-team:prompt-snippets";

const PRESET_SNIPPETS: Array<{ id: string; titleKey: string; descriptionKey: string; bodyKey: string }> = [
  {
    id: "preset-review",
    titleKey: "chatView.snippetReviewTitle",
    descriptionKey: "chatView.snippetReviewDesc",
    bodyKey: "chatView.snippetReviewBody",
  },
  {
    id: "preset-plan",
    titleKey: "chatView.snippetPlanTitle",
    descriptionKey: "chatView.snippetPlanDesc",
    bodyKey: "chatView.snippetPlanBody",
  },
  {
    id: "preset-explain",
    titleKey: "chatView.snippetExplainTitle",
    descriptionKey: "chatView.snippetExplainDesc",
    bodyKey: "chatView.snippetExplainBody",
  },
];

function loadPromptSnippets(): PromptSnippet[] {
  try {
    const raw = window.localStorage.getItem(PROMPT_SNIPPETS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (item): item is PromptSnippet =>
        item && typeof item.id === "string" && typeof item.title === "string" && typeof item.body === "string",
    );
  } catch {
    return [];
  }
}

type SlashMenuItem =
  | { kind: "command"; command: SlashCommand }
  | { kind: "skill"; skill: InstalledSkillInfo };

const SLASH_CATEGORY_LABEL_KEYS: Record<SlashCommand["category"], string> = {
  chat: "chatView.slashCategoryChat",
  agent: "chatView.slashCategoryAgent",
  tools: "chatView.slashCategoryTools",
  info: "chatView.slashCategoryInfo",
};

function slashGroupLabel(item: SlashMenuItem, t: (key: string) => string): string {
  return item.kind === "command" ? t(SLASH_CATEGORY_LABEL_KEYS[item.command.category]) : "Skills";
}

function gaugeTokens(n: number): string {
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

function ChatContextGauge({
  used,
  window: ctxWindow,
  cacheReadTokens,
  cacheWriteTokens,
}: {
  used: number;
  window: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}) {
  const t = useTranslation();
  const pct = ctxWindow > 0 ? Math.min(100, Math.round((used / ctxWindow) * 100)) : 0;
  const size = 22;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;
  const hasCache = (cacheReadTokens ?? 0) > 0 || (cacheWriteTokens ?? 0) > 0;
  const cacheHitPct =
    used > 0 && (cacheReadTokens ?? 0) > 0
      ? Math.min(100, Math.round(((cacheReadTokens ?? 0) / used) * 100))
      : 0;
  const cacheTitle = hasCache
    ? `\n${t("chatView.cacheHit", {
        pct: cacheHitPct,
        read: gaugeTokens(cacheReadTokens ?? 0),
        write: gaugeTokens(cacheWriteTokens ?? 0),
      })}`
    : "";
  return (
    <div
      className="chat-ctx-gauge"
      title={`${t("chatView.contextUsage", { pct, used: gaugeTokens(used), window: gaugeTokens(ctxWindow) })}${cacheTitle}`}
      role="img"
      aria-label={t("chatView.contextUsageShort", { pct })}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle
          className="chat-ctx-gauge-track"
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
        />
        <circle
          className={`chat-ctx-gauge-fill ${pct >= 90 ? "hot" : pct >= 70 ? "warm" : ""}`}
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={`${filled} ${circumference}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
        />
      </svg>
      <span className="chat-ctx-gauge-num">{pct}</span>
    </div>
  );
}

function folderName(path: string): string {
  const parts = path.split(/[\\/]/).filter(Boolean);
  return parts.at(-1) || path;
}

function attachmentLabel(attachment: MessageAttachment): string {
  const kind = attachment.kind === "path-ref" || attachment.kind === "file" ? "file" : attachment.kind;
  const size = formatAttachmentSize(attachment.size);
  const original = formatAttachmentSize(attachment.originalSize);
  if (size && original) return `${kind} · ${original} -> ${size}`;
  if (size) return `${kind} · ${size}`;
  return kind;
}

function formatAttachmentSize(size?: number): string {
  if (!size) return "";
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(1)} MB`;
}

export function ChatView({
  title,
  description,
  notice,
  messages,
  draft,
  draftAttachments,
  queuedMessages,
  isLoading,
  activityText,
  profiles,
  models,
  skills,
  contextUsage,
  readiness,
  currentProfile,
  contextFolder,
  worktreeVisible,
  activeModel,
  reasoningEffort,
  fastMode,
  modelBusy,
  formatTime,
  onDraftChange,
  onQuickAsk,
  onAddAttachment,
  onAttachFiles,
  onPickAttachments,
  onRemoveAttachment,
  onRemoveQueuedMessage,
  onNewChat,
  onClearChat,
  onPickContextFolder,
  onClearContextFolder,
  onToggleWorktree,
  onSelectProfile,
  onSelectModel,
  onSelectReasoningEffort,
  onToggleFastMode,
  onOpenModels,
  onSend,
  onStop,
  onRegenerateMessage,
  onBranchMessage,
  onAnswerClarify,
  workMode,
  workModeDisabled,
  onWorkModeChange,
}: {
  title: string;
  description: string;
  notice: string;
  messages: Message[];
  draft: string;
  draftAttachments: MessageAttachment[];
  queuedMessages: Array<{ id: string; text: string; attachments: MessageAttachment[] }>;
  isLoading: boolean;
  activityText?: string;
  profiles: HermesProfileInfo[];
  models: SavedModel[];
  skills: InstalledSkillInfo[];
  contextUsage: {
    used: number;
    window: number;
    cacheReadTokens?: number;
    cacheWriteTokens?: number;
  } | null;
  readiness: { ok: boolean; message?: string; fixLabel?: string; onFix?: () => void };
  currentProfile: string;
  contextFolder: string | null;
  worktreeVisible: boolean;
  activeModel: ActiveModelConfig | null;
  reasoningEffort: ReasoningEffort;
  fastMode: boolean;
  modelBusy: boolean;
  formatTime: (timestamp: number) => string;
  onDraftChange: (value: string) => void;
  onQuickAsk: () => void;
  onAddAttachment: (path?: string) => void;
  onAttachFiles: (files: File[]) => void;
  onPickAttachments: () => void;
  onRemoveAttachment: (id: string) => void;
  onRemoveQueuedMessage: (id: string) => void;
  onNewChat: () => void;
  onClearChat: () => void;
  onPickContextFolder: () => void;
  onClearContextFolder: () => void;
  onToggleWorktree: () => void;
  onSelectProfile: (profile: string) => void;
  onSelectModel: (model: SavedModel) => void;
  onSelectReasoningEffort: (value: ReasoningEffort) => void | Promise<void>;
  onToggleFastMode: () => void | Promise<void>;
  onOpenModels: () => void;
  onSend: (contentOverride?: string) => void;
  onStop: () => void;
  onRegenerateMessage: (messageId: string) => void;
  onBranchMessage: (messageId: string) => void;
  onAnswerClarify: (messageId: string, answer: string) => void;
  workMode: WorkMode;
  workModeDisabled?: boolean;
  onWorkModeChange: (mode: WorkMode) => void;
}) {
  const t = useTranslation();
  const canSend = draft.trim().length > 0 || draftAttachments.length > 0;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const atMenuRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [atMenuOpen, setAtMenuOpen] = useState(false);
  const [atFilter, setAtFilter] = useState("");
  const [atSelectedIndex, setAtSelectedIndex] = useState(0);
  const [atFiles, setAtFiles] = useState<AtFileEntry[]>([]);
  const [atLoading, setAtLoading] = useState(false);
  const snippetMenuRef = useRef<HTMLDivElement>(null);
  const [snippetMenuOpen, setSnippetMenuOpen] = useState(false);
  const [snippets, setSnippets] = useState<PromptSnippet[]>(() => loadPromptSnippets());
  const [snippetForm, setSnippetForm] = useState<{ title: string; body: string } | null>(null);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);
  const [transcriptCopied, setTranscriptCopied] = useState(false);

  const handleCopyTranscript = useCallback(async () => {
    const transcript = buildChatTranscript(messages, "markdown");
    if (!transcript.trim()) return;
    try {
      await copyTextToClipboard(transcript);
      setTranscriptCopied(true);
      window.setTimeout(() => setTranscriptCopied(false), 1800);
    } catch {
      setTranscriptCopied(false);
    }
  }, [messages]);

  const autoResize = useCallback(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, []);

  const applyHistoryText = useCallback(
    (text: string) => {
      onDraftChange(text);
      window.requestAnimationFrame(() => {
        autoResize();
        inputRef.current?.setSelectionRange(text.length, text.length);
      });
    },
    [autoResize, onDraftChange],
  );

  const history = useInputHistory({
    currentInput: draft,
    applyText: applyHistoryText,
  });

  // Voice input. Snapshot whatever was already typed when recording starts
  // (`voiceBaseRef`), then rebuild the field as `base + livetranscript` on every
  // result so the SpeechRecognition path streams in live. The recorder fallback
  // delivers one final result on stop.
  const voiceBaseRef = useRef("");
  const handleVoiceResult = useCallback(
    (text: string, isFinal: boolean) => {
      const base = voiceBaseRef.current;
      const next = base.trim() ? (text ? `${base.trimEnd()} ${text}` : base) : text;
      onDraftChange(next);
      window.requestAnimationFrame(() => {
        autoResize();
        if (isFinal) inputRef.current?.focus();
      });
    },
    [autoResize, onDraftChange],
  );
  const voice = useVoiceInput(handleVoiceResult, currentProfile);

  const filteredSlashItems = useMemo<SlashMenuItem[]>(() => {
    if (!slashMenuOpen) return [];
    const filter = slashFilter.toLowerCase();
    const term = filter.replace(/^\//, "");
    const commands: SlashMenuItem[] = SLASH_COMMANDS.filter((command) =>
      command.name.toLowerCase().startsWith(filter),
    ).map((command) => ({ kind: "command", command }));
    const skillItems: SlashMenuItem[] = skills
      .filter((skill) => {
        if (!term) return true;
        return (
          skill.dirName.toLowerCase().includes(term) ||
          skill.name.toLowerCase().includes(term) ||
          skill.category.toLowerCase().includes(term)
        );
      })
      .map((skill) => ({ kind: "skill", skill }));
    return [...commands, ...skillItems];
  }, [slashMenuOpen, slashFilter, skills]);

  const filteredAtFiles = useMemo<AtFileEntry[]>(() => {
    if (!atMenuOpen) return [];
    const term = atFilter.toLowerCase();
    const matched = term
      ? atFiles.filter((file) => file.rel.toLowerCase().includes(term) || file.name.toLowerCase().includes(term))
      : atFiles;
    return matched.slice(0, 50);
  }, [atMenuOpen, atFilter, atFiles]);
  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (message.authorName === "Runtime activity") return false;
      if (message.kind === "reasoning" || message.kind === "tool" || message.kind === "clarify") return true;
      return message.content.trim().length > 0;
    });
  }, [messages]);

  type RenderItem =
    | { type: "message"; key: string; message: Message; showMeta: boolean; isLast: boolean }
    | { type: "tool-group"; key: string; messages: Message[] }
    | { type: "clarify"; key: string; message: Message };

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (let index = 0; index < visibleMessages.length; index += 1) {
      const message = visibleMessages[index];
      if (message.kind === "clarify") {
        items.push({ type: "clarify", key: message.id, message });
        continue;
      }
      if (message.kind === "tool") {
        const group = [message];
        let cursor = index;
        while (cursor + 1 < visibleMessages.length && visibleMessages[cursor + 1].kind === "tool") {
          cursor += 1;
          group.push(visibleMessages[cursor]);
        }
        items.push({ type: "tool-group", key: message.id, messages: group });
        index = cursor;
        continue;
      }
      const previous = visibleMessages[index - 1];
      const showMeta =
        !previous || previous.authorKind !== message.authorKind || previous.kind !== message.kind;
      items.push({
        type: "message",
        key: message.id,
        message,
        showMeta,
        isLast: index === visibleMessages.length - 1,
      });
    }
    return items;
  }, [visibleMessages]);

  useEffect(() => {
    if (!isLoading) inputRef.current?.focus();
  }, [isLoading]);

  useEffect(() => {
    if (!slashMenuOpen) return undefined;
    function handleClickOutside(event: MouseEvent) {
      if (slashMenuRef.current && !slashMenuRef.current.contains(event.target as Node)) {
        setSlashMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [slashMenuOpen]);

  useEffect(() => {
    if (!slashMenuOpen) return;
    const active = slashMenuRef.current?.querySelector(".slash-menu-item-active");
    active?.scrollIntoView({ block: "nearest" });
  }, [slashSelectedIndex, slashMenuOpen]);

  useEffect(() => {
    if (!addMenuOpen) return undefined;
    function handleClickOutside(event: MouseEvent) {
      if (addMenuRef.current && !addMenuRef.current.contains(event.target as Node)) {
        setAddMenuOpen(false);
      }
    }
    function handleEscape(event: globalThis.KeyboardEvent) {
      if (event.key === "Escape") setAddMenuOpen(false);
    }
    document.addEventListener("mousedown", handleClickOutside);
    document.addEventListener("keydown", handleEscape);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
      document.removeEventListener("keydown", handleEscape);
    };
  }, [addMenuOpen]);

  // Load a flat, capped file list from the bound context folder so `@` can
  // reference real files. Re-runs when the folder changes.
  useEffect(() => {
    let cancelled = false;
    if (!contextFolder) {
      setAtFiles([]);
      return undefined;
    }
    setAtLoading(true);
    (async () => {
      const out: AtFileEntry[] = [];
      const maxFiles = 800;
      const maxDepth = 4;
      const skipDirs = new Set([".git", "node_modules", "target", "dist", ".next", ".venv", "__pycache__"]);
      async function walk(dir: string, depth: number) {
        if (cancelled || out.length >= maxFiles || depth > maxDepth) return;
        let entries: DirectoryEntryInfo[] = [];
        try {
          entries = await readDirectory(dir);
        } catch {
          return;
        }
        for (const entry of entries) {
          if (cancelled || out.length >= maxFiles) return;
          if (entry.isDir) {
            if (skipDirs.has(entry.name) || entry.name.startsWith(".")) continue;
            await walk(entry.path, depth + 1);
          } else if (entry.isFile) {
            const rel = entry.path.startsWith(contextFolder!)
              ? entry.path.slice(contextFolder!.length).replace(/^[\\/]/, "")
              : entry.name;
            out.push({ name: entry.name, path: entry.path, rel });
          }
        }
      }
      await walk(contextFolder, 0);
      if (!cancelled) {
        setAtFiles(out);
        setAtLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contextFolder]);

  useEffect(() => {
    if (!atMenuOpen) return undefined;
    function handleClickOutside(event: MouseEvent) {
      if (atMenuRef.current && !atMenuRef.current.contains(event.target as Node)) {
        setAtMenuOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [atMenuOpen]);

  useEffect(() => {
    if (!atMenuOpen) return;
    const active = atMenuRef.current?.querySelector(".slash-menu-item-active");
    active?.scrollIntoView({ block: "nearest" });
  }, [atSelectedIndex, atMenuOpen]);

  useEffect(() => {
    if (!snippetMenuOpen) return undefined;
    function handleClickOutside(event: MouseEvent) {
      if (snippetMenuRef.current && !snippetMenuRef.current.contains(event.target as Node)) {
        setSnippetMenuOpen(false);
        setSnippetForm(null);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [snippetMenuOpen]);

  const persistSnippets = useCallback((next: PromptSnippet[]) => {
    setSnippets(next);
    try {
      window.localStorage.setItem(PROMPT_SNIPPETS_KEY, JSON.stringify(next));
    } catch {
      // Ignore persistence failures (e.g. storage disabled); in-memory still works.
    }
  }, []);

  function insertSnippet(snippet: PromptSnippet) {
    setSnippetMenuOpen(false);
    setSnippetForm(null);
    const el = inputRef.current;
    const value = draft;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const needsLead = before.length > 0 && !before.endsWith("\n") && !before.endsWith(" ");
    const insertText = `${needsLead ? "\n" : ""}${snippet.body}`;
    const next = before + insertText + after;
    const newCaret = before.length + insertText.length;
    onDraftChange(next);
    window.requestAnimationFrame(() => {
      autoResize();
      el?.focus();
      el?.setSelectionRange(newCaret, newCaret);
    });
  }

  function saveSnippet() {
    if (!snippetForm) return;
    const title = snippetForm.title.trim();
    const body = snippetForm.body.trim();
    if (!title || !body) return;
    const next: PromptSnippet = {
      id: `snippet-${Date.now()}-${Math.random().toString(16).slice(2)}`,
      title,
      body,
    };
    persistSnippets([...snippets, next]);
    setSnippetForm(null);
  }

  function deleteSnippet(id: string) {
    persistSnippets(snippets.filter((item) => item.id !== id));
  }

  function sendCurrentDraft() {
    const text = draft.trim();
    if (text) history.push(text);
    onSend();
  }

  function insertDraftPrefix(prefix: string) {
    onDraftChange(prefix);
    window.requestAnimationFrame(() => {
      autoResize();
      inputRef.current?.focus();
    });
  }

  function handleSlashSelect(item: SlashMenuItem) {
    setSlashMenuOpen(false);
    if (item.kind === "skill") {
      // Mirror the `/name` convention: drop the skill slug into the draft and
      // let the user describe the task before sending.
      insertDraftPrefix(`/${item.skill.dirName} `);
      return;
    }
    const command = item.command;
    if (command.name === "/new") {
      onNewChat();
      return;
    }
    if (command.name === "/clear") {
      onClearChat();
      return;
    }
    if (command.local || command.category === "info") {
      onSend(command.name);
      return;
    }
    insertDraftPrefix(`${command.name} `);
  }

  function handleInputChange(event: ChangeEvent<HTMLTextAreaElement>) {
    const value = event.target.value;
    const caret = event.target.selectionStart ?? value.length;
    onDraftChange(value);
    window.requestAnimationFrame(autoResize);

    if (value.startsWith("/") && !value.includes(" ")) {
      setSlashMenuOpen(true);
      setSlashFilter(value.split(" ")[0]);
      setSlashSelectedIndex(0);
    } else if (slashMenuOpen) {
      setSlashMenuOpen(false);
    }

    const atMatch = /(?:^|\s)@([^@\s]*)$/.exec(value.slice(0, caret));
    if (atMatch) {
      setAtMenuOpen(true);
      setAtFilter(atMatch[1]);
      setAtSelectedIndex(0);
    } else if (atMenuOpen) {
      setAtMenuOpen(false);
    }
  }

  function handleAtSelect(file: AtFileEntry) {
    setAtMenuOpen(false);
    const el = inputRef.current;
    const value = draft;
    const caret = el?.selectionStart ?? value.length;
    const before = value.slice(0, caret);
    const after = value.slice(caret);
    const atMatch = /(?:^|\s)@([^@\s]*)$/.exec(before);
    const insertText = `@${file.rel || file.name} `;
    let next: string;
    let newCaret: number;
    if (atMatch) {
      const start = caret - atMatch[1].length - 1;
      next = value.slice(0, start) + insertText + after;
      newCaret = start + insertText.length;
    } else {
      next = before + insertText + after;
      newCaret = before.length + insertText.length;
    }
    onDraftChange(next);
    onAddAttachment(file.path);
    window.requestAnimationFrame(() => {
      autoResize();
      el?.focus();
      el?.setSelectionRange(newCaret, newCaret);
    });
  }

  function handlePaste(event: ClipboardEvent<HTMLTextAreaElement>) {
    const { files, hasText } = filesFromClipboard(event);
    if (files.length === 0) return;
    if (!hasText) event.preventDefault();
    onAttachFiles(files);
  }

  async function pasteImageFromClipboard() {
    setAttachmentError(null);
    try {
      const clipboard = navigator.clipboard as Clipboard & {
        read?: () => Promise<ClipboardItem[]>;
      };
      if (!clipboard?.read) {
        setAttachmentError(t("chatView.clipboardUnsupported"));
        return;
      }
      const items = await clipboard.read();
      const files: File[] = [];
      for (const item of items) {
        const type = item.types.find((value) => value.startsWith("image/"));
        if (!type) continue;
        const blob = await item.getType(type);
        const ext = type.split("/")[1] || "png";
        files.push(new File([blob], `clipboard-${Date.now()}.${ext}`, { type }));
      }
      if (files.length === 0) {
        setAttachmentError(t("chatView.clipboardNoImage"));
        return;
      }
      onAttachFiles(files);
    } catch {
      setAttachmentError(t("chatView.clipboardReadFailed"));
    }
  }

  function handleDrop(event: DragEvent<HTMLElement>) {
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    setAttachmentError(null);
    onAttachFiles(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isImeComposing(event) || composingRef.current) return;

    if (atMenuOpen && filteredAtFiles.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setAtSelectedIndex((index) => (index < filteredAtFiles.length - 1 ? index + 1 : 0));
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setAtSelectedIndex((index) => (index > 0 ? index - 1 : filteredAtFiles.length - 1));
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        handleAtSelect(filteredAtFiles[atSelectedIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setAtMenuOpen(false);
        return;
      }
    }

    if (slashMenuOpen && filteredSlashItems.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashSelectedIndex((index) =>
          index < filteredSlashItems.length - 1 ? index + 1 : 0,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashSelectedIndex((index) =>
          index > 0 ? index - 1 : filteredSlashItems.length - 1,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        handleSlashSelect(filteredSlashItems[slashSelectedIndex]);
        return;
      }
      if (event.key === "Escape") {
        event.preventDefault();
        setSlashMenuOpen(false);
        return;
      }
    }

    if (!slashMenuOpen && (history.isNavigating() || !draft.includes("\n"))) {
      if (event.key === "ArrowUp" && history.size() > 0 && history.recallPrev()) {
        event.preventDefault();
        return;
      }
      if (event.key === "ArrowDown" && history.isNavigating() && history.recallNext()) {
        event.preventDefault();
        return;
      }
    }

    if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
      event.preventDefault();
      if (!isLoading && draft.trim().length > 0) {
        history.push(draft.trim());
        onQuickAsk();
      }
      return;
    }

    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (isLoading) {
        onStop();
      } else if (canSend) {
        sendCurrentDraft();
      }
    }
  }

  return (
    <>
      <header className="workspace-header chat-header">
        <div className="chat-header-titles">
          <h1>{title}</h1>
          {description && <span className="chat-header-sub">{description}</span>}
        </div>
        <div className="workspace-header-right">
          <div className="status-card">
            <Activity size={15} />
            <span>{notice}</span>
          </div>
          {visibleMessages.length > 0 && (
            <button
              className="refresh-runtime"
              type="button"
              onClick={() => void handleCopyTranscript()}
              title={t("chatView.copyTranscriptTitle")}
            >
              {transcriptCopied ? <Check size={14} /> : <ClipboardList size={14} />}
              <span>{transcriptCopied ? t("messageRow.copied") : t("chatView.copyTranscript")}</span>
            </button>
          )}
          <button className="refresh-runtime" type="button" onClick={onNewChat}>
            <Plus size={14} />
            <span>{t("nav.newChat")}</span>
          </button>
        </div>
      </header>

      <div className="task-header" aria-label={t("taskHeader.workModeLabel")}>
        <span className="task-actor-chip">{t("taskHeader.actorSingleExpert")}</span>
        <WorkModePicker
          value={workMode}
          disabled={workModeDisabled}
          onChange={onWorkModeChange}
        />
      </div>

      <div className={`message-list ${visibleMessages.length === 0 ? "message-list-empty" : ""}`} aria-label={t("chatView.messageStream")}>
        {visibleMessages.length === 0 ? (
          <section className="chat-empty-state">
            <strong>Hermes</strong>
            <span>Ask anything, build anything.</span>
          </section>
        ) : (
          <>
            {renderItems.map((item) => {
              if (item.type === "tool-group") {
                return <ToolCallGroup key={item.key} messages={item.messages} />;
              }
              if (item.type === "clarify") {
                return (
                  <ClarifyCard
                    key={item.key}
                    message={item.message}
                    formatTime={formatTime}
                    onAnswer={(answer) => onAnswerClarify(item.message.id, answer)}
                  />
                );
              }
              const { message, isLast, showMeta } = item;
              return (
                <MessageRow
                  key={item.key}
                  message={message}
                  isLast={isLast}
                  isLoading={isLoading && isLast && message.authorKind === "agent"}
                  showMeta={showMeta}
                  formatTime={formatTime}
                  onApprove={() => onSend("/approve")}
                  onDeny={() => onSend("/deny")}
                  onRegenerate={() => onRegenerateMessage(message.id)}
                  onBranch={() => onBranchMessage(message.id)}
                  onCopyTranscript={() => void handleCopyTranscript()}
                />
              );
            })}
            {isLoading && visibleMessages.at(-1)?.authorKind !== "agent" && (
              <TypingIndicator detail={activityText} />
            )}
          </>
        )}
      </div>

      {contextFolder && worktreeVisible && (
        <WorktreePanel rootPath={contextFolder} onAttachFile={onAddAttachment} />
      )}

      <footer
        className="composer chat-composer"
        onDragOver={(event) => {
          if (event.dataTransfer.types.includes("Files")) event.preventDefault();
        }}
        onDrop={handleDrop}
      >
        {slashMenuOpen && filteredSlashItems.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              Commands &amp; Skills
            </div>
            <div className="slash-menu-list">
              {filteredSlashItems.map((item, index) => {
                const group = slashGroupLabel(item, t);
                const showGroup = index === 0 || slashGroupLabel(filteredSlashItems[index - 1], t) !== group;
                const name = item.kind === "command" ? item.command.name : `/${item.skill.dirName}`;
                const desc =
                  item.kind === "command"
                    ? item.command.description
                    : item.skill.description || item.skill.category || "Skill";
                return (
                  <div key={item.kind === "command" ? item.command.name : `skill-${item.skill.dirName}`}>
                    {showGroup && <div className="slash-menu-group">{group}</div>}
                    <button
                      className={`slash-menu-item ${index === slashSelectedIndex ? "slash-menu-item-active" : ""}`}
                      type="button"
                      onClick={() => handleSlashSelect(item)}
                      onMouseEnter={() => setSlashSelectedIndex(index)}
                    >
                      <span className="slash-menu-item-name">
                        {name}
                        {item.kind === "skill" && <span className="slash-menu-item-badge">skill</span>}
                      </span>
                      <span className="slash-menu-item-desc">{desc}</span>
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        )}
        {atMenuOpen && (
          <div className="slash-menu at-menu" ref={atMenuRef}>
            <div className="slash-menu-header">
              <AtSign size={12} />
              {t("chatView.referenceFile")}
            </div>
            {!contextFolder ? (
              <div className="at-menu-empty">
                {t("chatView.bindFolderHintPrefix")} <Plus size={12} /> {t("chatView.bindFolderHintSuffix")}
              </div>
            ) : atLoading && atFiles.length === 0 ? (
              <div className="at-menu-empty">{t("chatView.readingFiles")}</div>
            ) : filteredAtFiles.length === 0 ? (
              <div className="at-menu-empty">{t("chatView.noMatchingFiles")}</div>
            ) : (
              <div className="slash-menu-list">
                {filteredAtFiles.map((file, index) => (
                  <button
                    className={`slash-menu-item ${index === atSelectedIndex ? "slash-menu-item-active" : ""}`}
                    key={file.path}
                    type="button"
                    onClick={() => handleAtSelect(file)}
                    onMouseEnter={() => setAtSelectedIndex(index)}
                  >
                    <span className="slash-menu-item-name at-menu-item-name">
                      <FileIcon size={13} />
                      {file.name}
                    </span>
                    <span className="slash-menu-item-desc">{file.rel}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {draftAttachments.length > 0 && (
          <div className="draft-attachments">
            {draftAttachments.map((attachment) => (
              <span key={attachment.id} title={attachment.path || attachment.mime || attachment.kind}>
                <Paperclip size={13} />
                {attachment.name}
                <small>{attachmentLabel(attachment)}</small>
                <button type="button" onClick={() => onRemoveAttachment(attachment.id)}>
                  <XCircle size={13} />
                </button>
              </span>
            ))}
          </div>
        )}
        {attachmentError && (
          <div className="chat-attachment-error" role="alert">
            {attachmentError}
          </div>
        )}
        {queuedMessages.length > 0 && (
          <div className="chat-queue-indicator">
            <span>{t("chatView.queuedCount", { count: queuedMessages.length })}</span>
            <div className="chat-queue-list">
              {queuedMessages.map((item) => (
                <button
                  key={item.id}
                  className="chat-queue-item"
                  type="button"
                  title={t("chatView.removeQueued")}
                  onClick={() => onRemoveQueuedMessage(item.id)}
                >
                  <span>{item.text.trim() || t("chatView.attachmentCount", { count: item.attachments.length })}</span>
                  <X size={12} />
                </button>
              ))}
            </div>
          </div>
        )}
        {!readiness.ok && (
          <div className="chat-readiness" role="status">
            <AlertTriangle size={14} />
            <span className="chat-readiness-msg">{readiness.message}</span>
            {readiness.fixLabel && readiness.onFix && (
              <button type="button" className="chat-readiness-fix" onClick={readiness.onFix}>
                {readiness.fixLabel}
              </button>
            )}
          </div>
        )}
        <div className="chat-input-wrapper">
          <textarea
            ref={inputRef}
            className="chat-input"
            aria-label={t("chatView.sendMessage")}
            placeholder="Message Hermes..."
            value={draft}
            onChange={handleInputChange}
            onPaste={handlePaste}
            onKeyDown={handleKeyDown}
            onCompositionStart={() => {
              composingRef.current = true;
            }}
            onCompositionEnd={() => {
              composingRef.current = false;
            }}
            rows={1}
          />
          <div className="chat-input-toolbar">
            <div className="composer-add" ref={addMenuRef}>
              <button
                className={`chat-attach-btn composer-add-btn ${addMenuOpen ? "open" : ""}`}
                disabled={isLoading}
                title={t("chatView.attach")}
                aria-label={t("chatView.attach")}
                aria-haspopup="menu"
                aria-expanded={addMenuOpen}
                type="button"
                onClick={() => {
                  setAttachmentError(null);
                  setAddMenuOpen((value) => !value);
                }}
              >
                <Plus size={18} />
              </button>
              {addMenuOpen && (
                <div className="composer-add-menu" role="menu">
                  <div className="composer-add-menu-label">{t("chatView.attach")}</div>
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onPickAttachments();
                    }}
                  >
                    <Paperclip size={15} />
                    <span>{t("chatView.file")}</span>
                  </button>
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onPickAttachments();
                    }}
                  >
                    <ImageIcon size={15} />
                    <span>{t("chatView.image")}</span>
                  </button>
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      void pasteImageFromClipboard();
                    }}
                  >
                    <ClipboardPaste size={15} />
                    <span>{t("chatView.pasteImage")}</span>
                  </button>
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      insertDraftPrefix("/browse ");
                    }}
                  >
                    <Link size={15} />
                    <span>{t("chatView.urlBrowse")}</span>
                  </button>
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      setSnippetForm(null);
                      setSnippetMenuOpen(true);
                    }}
                  >
                    <MessageSquarePlus size={15} />
                    <span>{t("chatView.promptSnippets")}</span>
                  </button>
                  <div className="composer-add-menu-sep" />
                  <button
                    className="composer-add-menu-item"
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setAddMenuOpen(false);
                      onPickContextFolder();
                    }}
                  >
                    <FolderOpen size={15} />
                    <span>{contextFolder ? t("chatView.changeContextFolder") : t("chatView.contextFolder")}</span>
                  </button>
                  {contextFolder && (
                    <>
                      <button
                        className="composer-add-menu-item"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddMenuOpen(false);
                          onToggleWorktree();
                        }}
                      >
                        <FolderTree size={15} />
                        <span>{worktreeVisible ? t("chatView.hideTree") : t("chatView.showTree")}</span>
                      </button>
                      <div className="composer-add-menu-sep" />
                      <button
                        className="composer-add-menu-item composer-add-menu-danger"
                        type="button"
                        role="menuitem"
                        onClick={() => {
                          setAddMenuOpen(false);
                          onClearContextFolder();
                        }}
                      >
                        <X size={15} />
                        <span>{t("chatView.clearContextFolder")}</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
            {voice.supported && (
              <button
                className={`chat-mic-btn ${voice.recording ? "recording" : ""}`}
                type="button"
                disabled={isLoading || voice.transcribing}
                aria-pressed={voice.recording}
                title={
                  voice.transcribing
                    ? t("chatView.transcribing")
                    : voice.recording
                      ? t("chatView.stopRecording")
                      : voice.error
                        ? t("chatView.voiceInputError", { error: voice.error })
                        : t("chatView.voiceInput")
                }
                aria-label={voice.recording ? t("chatView.stopRecording") : t("chatView.voiceInput")}
                onClick={() => {
                  if (!voice.recording && !voice.transcribing) {
                    voiceBaseRef.current = draft;
                  }
                  voice.toggle();
                }}
              >
                <Mic size={16} />
              </button>
            )}
            {contextFolder && (
              <button
                className="chat-meta-chip chat-meta-chip-active"
                type="button"
                title={contextFolder}
                onClick={onPickContextFolder}
              >
                <FolderOpen size={13} />
                <span>{folderName(contextFolder)}</span>
              </button>
            )}
            <ChatControls
              profiles={profiles}
              models={models}
              currentProfile={currentProfile}
              activeModel={activeModel}
              reasoningEffort={reasoningEffort}
              fastMode={fastMode}
              busy={modelBusy}
              onSelectProfile={onSelectProfile}
              onSelectModel={onSelectModel}
              onSelectReasoningEffort={onSelectReasoningEffort}
              onToggleFastMode={onToggleFastMode}
              onOpenModels={onOpenModels}
            />
            <div className="chat-input-toolbar-spacer" />
            {contextUsage && contextUsage.window > 0 && contextUsage.used > 0 && (
              <ChatContextGauge
                used={contextUsage.used}
                window={contextUsage.window}
                cacheReadTokens={contextUsage.cacheReadTokens}
                cacheWriteTokens={contextUsage.cacheWriteTokens}
              />
            )}
            <button
              className="chat-quickask-btn"
              disabled={isLoading || !canSend}
              title={t("chatView.quickAskTitle")}
              aria-label={t("chatView.quickAsk")}
              type="button"
              onClick={() => {
                if (draft.trim()) {
                  history.push(draft.trim());
                  onQuickAsk();
                }
              }}
            >
              <MessageSquarePlus size={16} />
            </button>
            <button
              className={`chat-send-btn ${isLoading ? "chat-stop-btn" : ""}`}
              disabled={!isLoading && !canSend}
              title={isLoading ? t("chatView.stop") : t("chatView.send")}
              aria-label={isLoading ? t("chatView.stop") : t("chatView.send")}
              type="button"
              onClick={isLoading ? onStop : sendCurrentDraft}
            >
              {isLoading ? <Square size={14} /> : <ArrowUp size={20} />}
            </button>
          </div>
        </div>
      </footer>

      {snippetMenuOpen && (
        <div
          className="snippet-modal-overlay"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              setSnippetMenuOpen(false);
              setSnippetForm(null);
            }
          }}
        >
          <div className="snippet-modal" ref={snippetMenuRef} role="dialog" aria-modal="true">
            <div className="snippet-modal-head">
              <div>
                <h2>{t("chatView.promptSnippetsTitle")}</h2>
                <p>{t("chatView.promptSnippetsSubtitle")}</p>
              </div>
              <button
                type="button"
                className="snippet-modal-close"
                aria-label={t("common.close")}
                onClick={() => {
                  setSnippetMenuOpen(false);
                  setSnippetForm(null);
                }}
              >
                <X size={18} />
              </button>
            </div>
            {snippetForm ? (
              <div className="snippet-form">
                <input
                  className="snippet-form-title"
                  placeholder={t("chatView.snippetNamePlaceholder")}
                  value={snippetForm.title}
                  autoFocus
                  onChange={(event) =>
                    setSnippetForm((form) => (form ? { ...form, title: event.target.value } : form))
                  }
                />
                <textarea
                  className="snippet-form-body"
                  placeholder={t("chatView.snippetBodyPlaceholder")}
                  rows={5}
                  value={snippetForm.body}
                  onChange={(event) =>
                    setSnippetForm((form) => (form ? { ...form, body: event.target.value } : form))
                  }
                />
                <div className="snippet-form-actions">
                  <button type="button" className="snippet-form-cancel" onClick={() => setSnippetForm(null)}>
                    {t("common.cancel")}
                  </button>
                  <button
                    type="button"
                    className="snippet-form-save"
                    disabled={!snippetForm.title.trim() || !snippetForm.body.trim()}
                    onClick={saveSnippet}
                  >
                    {t("common.save")}
                  </button>
                </div>
              </div>
            ) : (
              <div className="snippet-modal-body">
                {PRESET_SNIPPETS.map((preset) => (
                  <button
                    className="snippet-card"
                    key={preset.id}
                    type="button"
                    onClick={() => insertSnippet({ id: preset.id, title: t(preset.titleKey), body: t(preset.bodyKey) })}
                  >
                    <MessageSquarePlus size={18} />
                    <span className="snippet-card-text">
                      <span className="snippet-card-title">{t(preset.titleKey)}</span>
                      <span className="snippet-card-desc">{t(preset.descriptionKey)}</span>
                    </span>
                  </button>
                ))}
                {snippets.length > 0 && <div className="snippet-modal-divider">{t("chatView.mySnippets")}</div>}
                {snippets.map((snippet) => (
                  <div className="snippet-card-row" key={snippet.id}>
                    <button className="snippet-card" type="button" onClick={() => insertSnippet(snippet)}>
                      <MessageSquarePlus size={18} />
                      <span className="snippet-card-text">
                        <span className="snippet-card-title">{snippet.title}</span>
                        <span className="snippet-card-desc">{snippet.body}</span>
                      </span>
                    </button>
                    <button
                      className="snippet-delete"
                      type="button"
                      title={t("chatView.deleteSnippet")}
                      aria-label={t("chatView.deleteSnippet")}
                      onClick={() => deleteSnippet(snippet.id)}
                    >
                      <X size={14} />
                    </button>
                  </div>
                ))}
                <button
                  className="snippet-add-row"
                  type="button"
                  onClick={() => setSnippetForm({ title: "", body: draft.trim() })}
                >
                  <Plus size={16} />
                  {t("chatView.newSnippet")}{draft.trim() ? t("chatView.newSnippetWithInput") : ""}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
