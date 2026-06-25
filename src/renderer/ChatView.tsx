import { Activity, ArrowUp, FolderOpen, FolderTree, Paperclip, Plus, Slash, Square, X, XCircle } from "lucide-react";
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
import type { ActiveModelConfig, HermesProfileInfo, SavedModel } from "../runtime/hermes-runtime";

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
  currentProfile,
  contextFolder,
  worktreeVisible,
  activeModel,
  reasoningEffort,
  modelBusy,
  formatTime,
  onDraftChange,
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
  currentProfile: string;
  contextFolder: string | null;
  worktreeVisible: boolean;
  activeModel: ActiveModelConfig | null;
  reasoningEffort: ReasoningEffort;
  modelBusy: boolean;
  formatTime: (timestamp: number) => string;
  onDraftChange: (value: string) => void;
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
  const composingRef = useRef(false);
  const [slashMenuOpen, setSlashMenuOpen] = useState(false);
  const [slashFilter, setSlashFilter] = useState("");
  const [slashSelectedIndex, setSlashSelectedIndex] = useState(0);
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

  const filteredSlashCommands = useMemo(
    () =>
      slashMenuOpen
        ? SLASH_COMMANDS.filter((command) =>
            command.name.toLowerCase().startsWith(slashFilter.toLowerCase()),
          )
        : [],
    [slashMenuOpen, slashFilter],
  );
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

  function sendCurrentDraft() {
    const text = draft.trim();
    if (text) history.push(text);
    onSend();
  }

  function handleSlashSelect(command: SlashCommand) {
    setSlashMenuOpen(false);
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
    onDraftChange(`${command.name} `);
    window.requestAnimationFrame(() => {
      autoResize();
      inputRef.current?.focus();
    });
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

  function handleDrop(event: DragEvent<HTMLElement>) {
    const files = Array.from(event.dataTransfer.files || []);
    if (files.length === 0) return;
    event.preventDefault();
    setAttachmentError(null);
    onAttachFiles(files);
  }

  function handleKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (isImeComposing(event) || composingRef.current) return;

    if (slashMenuOpen && filteredSlashCommands.length > 0) {
      if (event.key === "ArrowDown") {
        event.preventDefault();
        setSlashSelectedIndex((index) =>
          index < filteredSlashCommands.length - 1 ? index + 1 : 0,
        );
        return;
      }
      if (event.key === "ArrowUp") {
        event.preventDefault();
        setSlashSelectedIndex((index) =>
          index > 0 ? index - 1 : filteredSlashCommands.length - 1,
        );
        return;
      }
      if (event.key === "Enter" || event.key === "Tab") {
        event.preventDefault();
        handleSlashSelect(filteredSlashCommands[slashSelectedIndex]);
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
        {slashMenuOpen && filteredSlashCommands.length > 0 && (
          <div className="slash-menu" ref={slashMenuRef}>
            <div className="slash-menu-header">
              <Slash size={12} />
              Commands
            </div>
            <div className="slash-menu-list">
              {filteredSlashCommands.map((command, index) => (
                <button
                  className={`slash-menu-item ${index === slashSelectedIndex ? "slash-menu-item-active" : ""}`}
                  key={command.name}
                  type="button"
                  onClick={() => handleSlashSelect(command)}
                  onMouseEnter={() => setSlashSelectedIndex(index)}
                >
                  <span className="slash-menu-item-name">{command.name}</span>
                  <span className="slash-menu-item-desc">{command.description}</span>
                </button>
              ))}
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
            <button
              className="chat-attach-btn"
              disabled={isLoading}
              title="Attach"
              aria-label="Attach"
              type="button"
              onClick={() => {
                setAttachmentError(null);
                onPickAttachments();
              }}
            >
              <Paperclip size={16} />
            </button>
            {contextFolder ? (
              <div className="chat-ctxfolder-group">
                <button
                  className="chat-meta-chip chat-meta-chip-active"
                  type="button"
                  title={contextFolder}
                  onClick={onPickContextFolder}
                >
                  <FolderOpen size={13} />
                  <span>{folderName(contextFolder)}</span>
                </button>
                <button
                  className="chat-meta-chip-icon"
                  type="button"
                  title="Clear context folder"
                  aria-label="Clear context folder"
                  onClick={onClearContextFolder}
                >
                  <X size={12} />
                </button>
                <button
                  className={`chat-meta-chip-icon ${worktreeVisible ? "chat-meta-chip-icon-active" : ""}`}
                  type="button"
                  title={worktreeVisible ? "Hide folder tree" : "Show folder tree"}
                  aria-label={worktreeVisible ? "Hide folder tree" : "Show folder tree"}
                  onClick={onToggleWorktree}
                >
                  <FolderTree size={13} />
                </button>
              </div>
            ) : (
              <button
                className="chat-meta-chip"
                type="button"
                title="Set context folder"
                onClick={onPickContextFolder}
              >
                <FolderOpen size={13} />
                <span>Folder</span>
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
