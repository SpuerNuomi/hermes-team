import {
  Activity,
  AlertTriangle,
  ArrowUp,
  ClipboardPaste,
  FolderOpen,
  FolderTree,
  Link,
  MessageSquarePlus,
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
import type { Message, MessageAttachment } from "../core/types";
import type { ReasoningEffort } from "../core/reasoning";
import { filesFromClipboard } from "./attachmentProcessing";
import { isImeComposing } from "./chatInput/keyboard";
import { SLASH_COMMANDS, type SlashCommand } from "./chatInput/slashCommands";
import { useInputHistory } from "./chatInput/useInputHistory";
import { ChatControls } from "./ChatControls";
import { MessageRow, ToolCallGroup, TypingIndicator } from "./MessageRow";
import { WorktreePanel } from "./WorktreePanel";
import type { ActiveModelConfig, HermesProfileInfo, InstalledSkillInfo, SavedModel } from "../runtime/hermes-runtime";

type SlashMenuItem =
  | { kind: "command"; command: SlashCommand }
  | { kind: "skill"; skill: InstalledSkillInfo };

const SLASH_CATEGORY_LABELS: Record<SlashCommand["category"], string> = {
  chat: "会话控制",
  agent: "Agent 指令",
  tools: "工具",
  info: "信息",
};

function slashGroupLabel(item: SlashMenuItem): string {
  return item.kind === "command" ? SLASH_CATEGORY_LABELS[item.command.category] : "Skills";
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

function ChatContextGauge({ used, window: ctxWindow }: { used: number; window: number }) {
  const pct = ctxWindow > 0 ? Math.min(100, Math.round((used / ctxWindow) * 100)) : 0;
  const size = 22;
  const stroke = 3;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const filled = (pct / 100) * circumference;
  return (
    <div
      className="chat-ctx-gauge"
      title={`上下文占用 ${pct}% · ${gaugeTokens(used)}/${gaugeTokens(ctxWindow)} tokens`}
      role="img"
      aria-label={`上下文占用 ${pct}%`}
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
  onOpenModels,
  onSend,
  onStop,
  onRegenerateMessage,
  onBranchMessage,
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
  contextUsage: { used: number; window: number } | null;
  readiness: { ok: boolean; message?: string; fixLabel?: string; onFix?: () => void };
  currentProfile: string;
  contextFolder: string | null;
  worktreeVisible: boolean;
  activeModel: ActiveModelConfig | null;
  reasoningEffort: ReasoningEffort;
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
  onOpenModels: () => void;
  onSend: (contentOverride?: string) => void;
  onStop: () => void;
  onRegenerateMessage: (messageId: string) => void;
  onBranchMessage: (messageId: string) => void;
}) {
  const canSend = draft.trim().length > 0 || draftAttachments.length > 0;
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const slashMenuRef = useRef<HTMLDivElement>(null);
  const addMenuRef = useRef<HTMLDivElement>(null);
  const composingRef = useRef(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
  const [addMenuOpen, setAddMenuOpen] = useState(false);
  const [attachmentError, setAttachmentError] = useState<string | null>(null);

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
  const visibleMessages = useMemo(() => {
    return messages.filter((message) => {
      if (message.authorName === "Runtime activity") return false;
      if (message.kind === "reasoning" || message.kind === "tool") return true;
      return message.content.trim().length > 0;
    });
  }, [messages]);

  type RenderItem =
    | { type: "message"; key: string; message: Message; showMeta: boolean; isLast: boolean }
    | { type: "tool-group"; key: string; messages: Message[] };

  const renderItems = useMemo<RenderItem[]>(() => {
    const items: RenderItem[] = [];
    for (let index = 0; index < visibleMessages.length; index += 1) {
      const message = visibleMessages[index];
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
    onDraftChange(value);
    window.requestAnimationFrame(autoResize);

    if (value.startsWith("/") && !value.includes(" ")) {
      setSlashMenuOpen(true);
      setSlashFilter(value.split(" ")[0]);
      setSlashSelectedIndex(0);
    } else if (slashMenuOpen) {
      setSlashMenuOpen(false);
    }
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
        setAttachmentError("当前环境不支持读取剪贴板图片，可直接在输入框粘贴。");
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
        setAttachmentError("剪贴板里没有图片。");
        return;
      }
      onAttachFiles(files);
    } catch {
      setAttachmentError("读取剪贴板图片失败，可直接在输入框粘贴。");
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
          <button className="refresh-runtime" type="button" onClick={onNewChat}>
            <Plus size={14} />
            <span>新建聊天</span>
          </button>
        </div>
      </header>

      <div className={`message-list ${visibleMessages.length === 0 ? "message-list-empty" : ""}`} aria-label="消息流">
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
                const group = slashGroupLabel(item);
                const showGroup = index === 0 || slashGroupLabel(filteredSlashItems[index - 1]) !== group;
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
            <span>{queuedMessages.length} 条消息排队中</span>
            <div className="chat-queue-list">
              {queuedMessages.map((item) => (
                <button
                  key={item.id}
                  className="chat-queue-item"
                  type="button"
                  title="点击移除队列消息"
                  onClick={() => onRemoveQueuedMessage(item.id)}
                >
                  <span>{item.text.trim() || `${item.attachments.length} 个附件`}</span>
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
            aria-label="发送消息"
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
                title="附加"
                aria-label="附加"
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
                  <div className="composer-add-menu-label">附加</div>
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
                    <span>文件…</span>
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
                    <span>粘贴图片</span>
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
                    <span>网址 /browse…</span>
                  </button>
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
                    <span>{contextFolder ? "更换上下文文件夹…" : "上下文文件夹…"}</span>
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
                        <span>{worktreeVisible ? "隐藏目录树" : "显示目录树"}</span>
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
                        <span>清除上下文文件夹</span>
                      </button>
                    </>
                  )}
                </div>
              )}
            </div>
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
              busy={modelBusy}
              onSelectProfile={onSelectProfile}
              onSelectModel={onSelectModel}
              onSelectReasoningEffort={onSelectReasoningEffort}
              onOpenModels={onOpenModels}
            />
            <div className="chat-input-toolbar-spacer" />
            {contextUsage && contextUsage.window > 0 && contextUsage.used > 0 && (
              <ChatContextGauge used={contextUsage.used} window={contextUsage.window} />
            )}
            <button
              className="chat-quickask-btn"
              disabled={isLoading || !canSend}
              title="旁路提问，不写入上下文 (⌘/Ctrl + ↵)"
              aria-label="旁路提问"
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
              title={isLoading ? "Stop" : "Send"}
              aria-label={isLoading ? "Stop" : "Send"}
              type="button"
              onClick={isLoading ? onStop : sendCurrentDraft}
            >
              {isLoading ? <Square size={14} /> : <ArrowUp size={20} />}
            </button>
          </div>
        </div>
      </footer>
    </>
  );
}
