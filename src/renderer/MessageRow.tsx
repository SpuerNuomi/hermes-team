import { AlertTriangle, Brain, Check, CheckCircle2, ChevronRight, Copy, GitBranch, Loader2, MoreHorizontal, Paperclip, Radio, RefreshCw, Speaker, Terminal, XCircle } from "lucide-react";
import { memo, useCallback, useRef, useState, type MouseEvent as ReactMouseEvent } from "react";
import type { Message } from "../core/types";
import { useTranslation } from "../i18n";
import { AgentMarkdown } from "./AgentMarkdown";
import { BubbleContextMenu, buildBubbleActions } from "./BubbleContextMenu";
import { formatBubbleTime, formatBubbleTimeAbsolute } from "./bubbleTime";
import { copyTextToClipboard, currentSelectionText } from "./chatTranscript";

type ToolStatus = "completed" | "failed" | "running";

interface ParsedToolEvent {
  status: ToolStatus;
  title: string;
  detail: string;
}

function normalizeToolText(value: string): string {
  return value.replace(/\s+/g, " ").trim().toLowerCase();
}

function splitToolTitle(title: string): { label: string; head: string } {
  const colon = title.match(/^([A-Za-z][\w .-]*?):\s+(.+)$/);
  if (colon) {
    return { label: `${colon[1]}:`, head: colon[2].trim() };
  }
  const mid = title.indexOf(" · ");
  if (mid >= 0) {
    return { label: title.slice(0, mid).trim(), head: title.slice(mid + 3).trim() };
  }
  return { label: title, head: "" };
}

function parseToolEvent(content: string): ParsedToolEvent {
  const lines = content.split("\n");
  const firstRaw = (lines[0] ?? "").trim();
  let status: ToolStatus = "completed";
  let titleRaw = firstRaw;
  const sep = firstRaw.indexOf(" · ");
  if (sep >= 0) {
    const maybeStatus = firstRaw.slice(0, sep).trim();
    if (maybeStatus === "completed" || maybeStatus === "failed" || maybeStatus === "running") {
      status = maybeStatus;
      titleRaw = firstRaw.slice(sep + 3).trim();
    }
  }
  const { label, head } = splitToolTitle(titleRaw);
  const labelNorm = normalizeToolText(label);
  const seen: string[] = [];
  const detailParts: string[] = [];
  const candidates = head ? [head, ...lines.slice(1)] : lines.slice(1);
  for (const raw of candidates) {
    const line = raw.trim();
    if (!line) continue;
    const lineNorm = normalizeToolText(line);
    if (!lineNorm || labelNorm.includes(lineNorm)) continue;
    if (seen.some((existing) => existing.includes(lineNorm) || lineNorm.includes(existing))) continue;
    seen.push(lineNorm);
    detailParts.push(line);
  }
  return { status, title: label, detail: detailParts.join("\n") };
}

function ToolStatusIcon({ status }: { status: ToolStatus }) {
  if (status === "failed") return <XCircle size={15} />;
  if (status === "running") return <Loader2 size={15} className="tool-call-spin" />;
  return <CheckCircle2 size={15} />;
}

export const ToolCallGroup = memo(function ToolCallGroup({
  messages,
}: {
  messages: Message[];
}) {
  const t = useTranslation();
  const [openId, setOpenId] = useState<string | null>(null);
  if (messages.length === 0) return null;
  return (
    <article className="message agent tool-call-group">
      <div className="tool-call-card">
        {messages.map((message) => {
          const { status, title, detail } = parseToolEvent(message.content);
          const open = openId === message.id;
          const expandable = detail.length > 0;
          return (
            <button
              className={`tool-call-row ${open ? "tool-call-row-open" : ""}`}
              type="button"
              key={message.id}
              aria-expanded={open}
              disabled={!expandable}
              onClick={() => setOpenId((current) => (current === message.id ? null : message.id))}
            >
              <span className={`tool-call-icon tool-call-${status}`}>
                <ToolStatusIcon status={status} />
              </span>
              <span className="tool-call-text">
                <span className="tool-call-name">{title || t("messageRow.toolCall")}</span>
                {detail && (
                  <span className={`tool-call-detail ${open ? "tool-call-detail-open" : ""}`}>{detail}</span>
                )}
              </span>
            </button>
          );
        })}
      </div>
    </article>
  );
});

const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

function attachmentLabel(attachment: NonNullable<Message["attachments"]>[number]): string {
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

function formatToolSummary(content: string): string {
  const first = content
    .split("\n")
    .map((line) => line.trim())
    .find(Boolean);
  if (!first) return "Ran";
  const compact = first.replace(/\s+/g, " ");
  return compact.length > 160 ? `${compact.slice(0, 157)}...` : compact;
}

export const TypingIndicator = memo(function TypingIndicator({
  detail,
}: {
  detail?: string;
}) {
  const t = useTranslation();
  return (
    <article className="message agent message-typing" aria-live="polite">
      <div className="message-avatar" aria-hidden="true">
        H
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span>Hermes</span>
          <span>{detail || t("messageRow.processing")}</span>
        </div>
        <div className="chat-typing">
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
          <span className="chat-typing-dot" />
        </div>
      </div>
    </article>
  );
});

export interface RuntimeActivityItem {
  id: string;
  label: string;
  detail: string;
  createdAt: number;
  level: "info" | "ok" | "warning";
}

export const RuntimeActivityGroup = memo(function RuntimeActivityGroup({
  items,
  active,
  formatTime,
}: {
  items: RuntimeActivityItem[];
  active: boolean;
  formatTime: (timestamp: number) => string;
}) {
  const [open, setOpen] = useState(active);
  if (items.length === 0) return null;
  const last = items[items.length - 1];
  return (
    <article className="message agent message-runtime">
      <div className={`message-avatar ${active ? "message-avatar-active" : ""}`} aria-hidden="true">
        H
      </div>
      <div className="message-body">
        <button
          className={`runtime-activity-summary ${open ? "runtime-activity-summary-open" : ""}`}
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((value) => !value)}
        >
          <ChevronRight className="runtime-activity-chevron" size={14} />
          <Radio size={14} />
          <span>Runtime activity</span>
          <small>{last.detail}</small>
        </button>
        {open && (
          <div className="runtime-activity-list">
            {items.map((item) => (
              <div className={`runtime-activity-item runtime-activity-${item.level}`} key={item.id}>
                {item.level === "warning" ? (
                  <AlertTriangle size={13} />
                ) : item.level === "ok" ? (
                  <CheckCircle2 size={13} />
                ) : (
                  <Radio size={13} />
                )}
                <span>{item.label}</span>
                <p>{item.detail}</p>
                <time>{formatTime(item.createdAt)}</time>
              </div>
            ))}
          </div>
        )}
      </div>
    </article>
  );
});

export const MessageRow = memo(function MessageRow({
  message,
  isLast,
  isLoading,
  showMeta,
  formatTime,
  onApprove,
  onDeny,
  onRegenerate,
  onBranch,
  onCopyTranscript,
}: {
  message: Message;
  isLast: boolean;
  isLoading: boolean;
  showMeta: boolean;
  formatTime: (timestamp: number) => string;
  onApprove: () => void;
  onDeny: () => void;
  onRegenerate: () => void;
  onBranch: () => void;
  onCopyTranscript?: () => void;
}) {
  const t = useTranslation();
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(
    message.kind === "reasoning" || message.kind === "tool",
  );
  const [menuOpen, setMenuOpen] = useState(false);
  const [contextMenu, setContextMenu] = useState<{ x: number; y: number } | null>(null);
  const contentRef = useRef<HTMLDivElement>(null);
  const isAgent = message.authorKind === "agent";
  const isUser = message.authorKind === "user";
  const isReasoning = message.kind === "reasoning";
  const isTool = message.kind === "tool";
  const isRuntime = message.authorName === "Runtime activity";
  const showAssistantActions = isAgent && !isReasoning && !isTool && !isLoading && message.content.trim().length > 0;
  const showApprovalBar =
    isAgent && !isReasoning && !isTool && !isLoading && isLast && APPROVAL_RE.test(message.content);

  const handleCopy = useCallback(async () => {
    try {
      await copyTextToClipboard(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [message.content]);

  const speakMessage = useCallback(() => {
    if (!("speechSynthesis" in window) || !message.content.trim()) return;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(new SpeechSynthesisUtterance(message.content));
    setMenuOpen(false);
  }, [message.content]);

  // Highlight the bubble's text so the user can extend/copy it manually.
  const selectBubbleText = useCallback(() => {
    const el = contentRef.current;
    const selection = window.getSelection();
    if (!el || !selection) return;
    const range = document.createRange();
    range.selectNodeContents(el);
    selection.removeAllRanges();
    selection.addRange(range);
  }, []);

  // Copy the active selection if any, otherwise fall back to the whole message.
  const copySelection = useCallback(async () => {
    const selected = currentSelectionText();
    if (selected) {
      try {
        await copyTextToClipboard(selected);
      } catch {
        // Selection copy may fail in restricted environments; ignore quietly.
      }
      return;
    }
    await handleCopy();
  }, [handleCopy]);

  const handleContextMenu = useCallback((event: ReactMouseEvent) => {
    if (message.content.trim().length === 0) return;
    event.preventDefault();
    setMenuOpen(false);
    setContextMenu({ x: event.clientX, y: event.clientY });
  }, [message.content]);

  const contextActions = buildBubbleActions({
    hasContent: message.content.trim().length > 0,
    t,
    onCopy: () => void handleCopy(),
    onSelectText: selectBubbleText,
    onCopySelection: () => void copySelection(),
    onCopyTranscript,
  });

  const bubbleTime = formatBubbleTime(message.createdAt, t);
  const showBubbleTime = !isReasoning && !isTool && !isRuntime && bubbleTime.length > 0;

  return (
    <article
      className={`message ${message.authorKind} ${isReasoning ? "message-reasoning" : ""} ${
        isTool ? "message-tool" : ""
      } ${
        showMeta ? "" : "message-grouped"
      }`.trim()}
      key={message.id}
      onContextMenu={handleContextMenu}
    >
      {isAgent && (
        <div className={`message-avatar ${isLoading ? "message-avatar-active" : ""}`} aria-hidden="true">
          H
        </div>
      )}
      <div className="message-body">
        {showMeta && (
          <div className="message-meta">
            <span>{isReasoning ? t("messageRow.reasoning") : isRuntime ? "Runtime activity" : isTool ? t("messageRow.toolProcess") : message.authorName}</span>
            <time>{formatTime(message.createdAt)}</time>
          </div>
        )}
        {isReasoning || isTool ? (
          <div className={`message-content reasoning-content ${isTool ? "tool-content" : ""}`}>
            <button
              className="reasoning-summary"
              type="button"
              aria-expanded={reasoningOpen}
              onClick={() => setReasoningOpen((value) => !value)}
            >
              <ChevronRight
                size={14}
                className={`reasoning-chevron ${reasoningOpen ? "reasoning-chevron-open" : ""}`}
              />
              {isRuntime ? <Radio size={14} /> : isTool ? <Terminal size={14} /> : <Brain size={14} />}
              <span>{isRuntime ? "Runtime activity" : isTool ? formatToolSummary(message.content) : isLoading ? t("messageRow.thinking") : t("messageRow.reasoning")}</span>
              <small>{message.content.split("\n").length} lines</small>
            </button>
            {reasoningOpen && <pre className="reasoning-pre">{message.content}</pre>}
            {message.content && (
              <div className="message-actions">
                <button
                  className="message-copy"
                  type="button"
                  onClick={handleCopy}
                  title={copied ? t("messageRow.copied") : isTool ? t("messageRow.copyToolEvent") : t("messageRow.copyReasoning")}
                  aria-label={copied ? t("messageRow.copied") : isTool ? t("messageRow.copyToolEvent") : t("messageRow.copyReasoning")}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="message-content" ref={contentRef}>
            {isUser ? (
            <p>{message.content}</p>
            ) : (
            <div className="message-markdown">
              <AgentMarkdown>{message.content}</AgentMarkdown>
            </div>
            )}
            {message.content && (
              showAssistantActions ? (
                <div className="message-actions message-actions-dock">
                  <button
                    className="message-action-button"
                    type="button"
                    onClick={handleCopy}
                    title={copied ? t("messageRow.copied") : t("messageRow.copyMessage")}
                    aria-label={copied ? t("messageRow.copied") : t("messageRow.copyMessage")}
                  >
                    {copied ? <Check size={15} /> : <Copy size={15} />}
                  </button>
                  <button
                    className="message-action-button"
                    type="button"
                    onClick={onRegenerate}
                    title={t("messageRow.regenerate")}
                    aria-label={t("messageRow.regenerate")}
                  >
                    <RefreshCw size={15} />
                  </button>
                  <div className="message-more">
                    <button
                      className="message-action-button"
                      type="button"
                      onClick={() => setMenuOpen((value) => !value)}
                      title={t("messageRow.more")}
                      aria-label={t("messageRow.more")}
                      aria-expanded={menuOpen}
                    >
                      <MoreHorizontal size={17} />
                    </button>
                    {menuOpen && (
                      <div className="message-more-menu">
                        <button type="button" onClick={() => {
                          setMenuOpen(false);
                          onBranch();
                        }}>
                          <GitBranch size={15} />
                          <span>{t("messageRow.branch")}</span>
                        </button>
                        <button type="button" onClick={speakMessage}>
                          <Speaker size={15} />
                          <span>{t("messageRow.readAloud")}</span>
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ) : (
                <div className="message-actions">
                  <button
                    className="message-copy"
                    type="button"
                    onClick={handleCopy}
                    title={copied ? t("messageRow.copied") : t("messageRow.copyMessage")}
                    aria-label={copied ? t("messageRow.copied") : t("messageRow.copyMessage")}
                  >
                    {copied ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              )
            )}
          </div>
        )}
        {showBubbleTime && (
          <time
            className="message-bubble-time"
            dateTime={new Date(message.createdAt).toISOString()}
            title={formatBubbleTimeAbsolute(message.createdAt, t)}
          >
            {bubbleTime}
          </time>
        )}
        {message.attachments && message.attachments.length > 0 && (
          <div className="message-attachments">
            {message.attachments.map((attachment) => (
              <span key={attachment.id} title={attachment.path || attachment.mime || attachment.kind}>
                <Paperclip size={13} />
                {attachment.name}
                <small>{attachmentLabel(attachment)}</small>
              </span>
            ))}
          </div>
        )}
        {showApprovalBar && (
          <div className="message-approval-bar">
            <button type="button" onClick={onApprove}>
              {t("messageRow.approve")}
            </button>
            <button type="button" onClick={onDeny}>
              {t("messageRow.deny")}
            </button>
          </div>
        )}
      </div>
      {contextMenu && (
        <BubbleContextMenu
          x={contextMenu.x}
          y={contextMenu.y}
          actions={contextActions}
          onClose={() => setContextMenu(null)}
        />
      )}
    </article>
  );
});
