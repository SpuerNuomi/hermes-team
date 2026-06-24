import { AlertTriangle, Brain, Check, CheckCircle2, ChevronRight, Copy, Paperclip, Radio, Terminal } from "lucide-react";
import { memo, useCallback, useState } from "react";
import type { Message } from "../core/types";
import { AgentMarkdown } from "./AgentMarkdown";

const APPROVAL_RE =
  /⚠️.*dangerous|requires? (your )?approval|\/approve.*\/deny|do you want (me )?to (proceed|continue|run|execute)/i;

function copyToClipboard(value: string): Promise<void> {
  if (navigator.clipboard?.writeText) {
    return navigator.clipboard.writeText(value);
  }
  return Promise.reject(new Error("clipboard unavailable"));
}

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
  return (
    <article className="message agent message-typing" aria-live="polite">
      <div className="message-avatar" aria-hidden="true">
        H
      </div>
      <div className="message-body">
        <div className="message-meta">
          <span>Hermes</span>
          <span>{detail || "正在处理..."}</span>
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
}: {
  message: Message;
  isLast: boolean;
  isLoading: boolean;
  showMeta: boolean;
  formatTime: (timestamp: number) => string;
  onApprove: () => void;
  onDeny: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const [reasoningOpen, setReasoningOpen] = useState(false);
  const isAgent = message.authorKind === "agent";
  const isUser = message.authorKind === "user";
  const isReasoning = message.kind === "reasoning";
  const isTool = message.kind === "tool";
  const isRuntime = message.authorName === "Runtime activity";
  const showApprovalBar =
    isAgent && !isReasoning && !isTool && !isLoading && isLast && APPROVAL_RE.test(message.content);

  const handleCopy = useCallback(async () => {
    try {
      await copyToClipboard(message.content);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      setCopied(false);
    }
  }, [message.content]);

  return (
    <article
      className={`message ${message.authorKind} ${isReasoning ? "message-reasoning" : ""} ${
        isTool ? "message-tool" : ""
      } ${
        showMeta ? "" : "message-grouped"
      }`.trim()}
      key={message.id}
    >
      {isAgent && (
        <div className={`message-avatar ${isLoading ? "message-avatar-active" : ""}`} aria-hidden="true">
          H
        </div>
      )}
      <div className="message-body">
        {showMeta && (
          <div className="message-meta">
            <span>{isReasoning ? "Thinking" : isRuntime ? "Runtime activity" : isTool ? "Ran" : message.authorName}</span>
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
              <span>{isRuntime ? "Runtime activity" : isTool ? formatToolSummary(message.content) : isLoading ? "Thinking..." : "Thought"}</span>
              <small>{message.content.split("\n").length} lines</small>
            </button>
            {reasoningOpen && <pre className="reasoning-pre">{message.content}</pre>}
            {message.content && (
              <div className="message-actions">
                <button
                  className="message-copy"
                  type="button"
                  onClick={handleCopy}
                  title={copied ? "Copied" : isTool ? "Copy tool event" : "Copy reasoning"}
                  aria-label={copied ? "Copied" : isTool ? "Copy tool event" : "Copy reasoning"}
                >
                  {copied ? <Check size={14} /> : <Copy size={14} />}
                </button>
              </div>
            )}
          </div>
        ) : (
          <div className="message-content">
            {isUser ? (
            <p>{message.content}</p>
            ) : (
            <div className="message-markdown">
              <AgentMarkdown>{message.content}</AgentMarkdown>
            </div>
            )}
            {message.content && (
            <div className="message-actions">
              <button
                className="message-copy"
                type="button"
                onClick={handleCopy}
                title={copied ? "Copied" : "Copy message"}
                aria-label={copied ? "Copied" : "Copy message"}
              >
                {copied ? <Check size={14} /> : <Copy size={14} />}
              </button>
            </div>
            )}
          </div>
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
              Approve
            </button>
            <button type="button" onClick={onDeny}>
              Deny
            </button>
          </div>
        )}
      </div>
    </article>
  );
});
