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
import { MessageRow, RuntimeActivityGroup, TypingIndicator, type RuntimeActivityItem } from "./MessageRow";
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
  attachmentPathDraft,
  isLoading,
  activityText,
  activityEvents,
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
  onAttachmentPathChange,
  onAddAttachment,
  onAttachFiles,
  onPickAttachments,
  onRemoveAttachment,
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
}: {
  title: string;
  description: string;
  notice: string;
  messages: Message[];
  draft: string;
  draftAttachments: MessageAttachment[];
  attachmentPathDraft: string;
  isLoading: boolean;
  activityText?: string;
  activityEvents?: RuntimeActivityItem[];
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
  onAttachmentPathChange: (value: string) => void;
  onAddAttachment: (path?: string) => void;
  onAttachFiles: (files: File[]) => void;
  onPickAttachments: () => void;
  onRemoveAttachment: (id: string) => void;
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
        <div>
          <p className="panel-label">Chat</p>
          <h1>{title}</h1>
          <p>{description}</p>
        </div>
        <div className="workspace-header-right">
          <div className="status-card">
            <Activity size={18} />
            <span>{notice}</span>
          </div>
          <button className="refresh-runtime" type="button" onClick={onNewChat}>
            <Plus size={14} />
            <span>新建聊天</span>
          </button>
        </div>
      </header>

      <div className={`message-list ${messages.length === 0 ? "message-list-empty" : ""}`} aria-label="消息流">
        {messages.length === 0 ? (
          <section className="chat-empty-state">
            <strong>Hermes</strong>
            <span>Ask anything, build anything.</span>
          </section>
        ) : (
          <>
            {messages.map((message, index) => {
              const previous = messages[index - 1];
              const isLast = index === messages.length - 1;
              return (
                <MessageRow
                  key={message.id}
                  message={message}
                  isLast={isLast}
                  isLoading={isLoading && isLast && message.authorKind === "agent"}
                  showMeta={!previous || previous.authorKind !== message.authorKind}
                  formatTime={formatTime}
                  onApprove={() => onSend("/approve")}
                  onDeny={() => onSend("/deny")}
                />
              );
            })}
            {isLoading && messages.at(-1)?.authorKind !== "agent" && (
              <TypingIndicator detail={activityText} />
            )}
            {isLoading && activityEvents && activityEvents.length > 0 && (
              <RuntimeActivityGroup
                items={activityEvents}
                active={isLoading}
                formatTime={formatTime}
              />
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
        <div className="attachment-row">
          <input
            aria-label="附件路径"
            placeholder="/path/to/local-file.md"
            value={attachmentPathDraft}
            onChange={(event) => onAttachmentPathChange(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") onAddAttachment();
            }}
          />
          <button className="refresh-runtime" type="button" onClick={() => onAddAttachment()}>
            <Paperclip size={14} />
            <span>添加附件</span>
          </button>
        </div>
      </footer>
    </>
  );
}
