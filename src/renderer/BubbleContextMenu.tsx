import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { ClipboardCopy, Copy, MessagesSquare, TextCursorInput } from "lucide-react";

export interface BubbleMenuAction {
  key: string;
  label: string;
  icon?: ReactNode;
  disabled?: boolean;
  onSelect: () => void;
}

/**
 * Assemble the standard chat-bubble right-click actions. `onCopyTranscript` is
 * optional — the "复制整段对话" entry is only added when a handler is provided.
 */
export function buildBubbleActions(opts: {
  hasContent: boolean;
  onCopy: () => void;
  onSelectText: () => void;
  onCopySelection: () => void;
  onCopyTranscript?: () => void;
}): BubbleMenuAction[] {
  const actions: BubbleMenuAction[] = [
    {
      key: "copy",
      label: "复制本条",
      icon: <Copy size={14} />,
      disabled: !opts.hasContent,
      onSelect: opts.onCopy,
    },
    {
      key: "select",
      label: "选择本条文本",
      icon: <TextCursorInput size={14} />,
      onSelect: opts.onSelectText,
    },
    {
      key: "copy-selection",
      label: "复制所选",
      icon: <ClipboardCopy size={14} />,
      onSelect: opts.onCopySelection,
    },
  ];
  if (opts.onCopyTranscript) {
    actions.push({
      key: "copy-transcript",
      label: "复制整段对话",
      icon: <MessagesSquare size={14} />,
      onSelect: opts.onCopyTranscript,
    });
  }
  return actions;
}

/**
 * A lightweight right-click menu for chat bubbles. Rendered into a portal so it
 * escapes the message list's overflow clipping, clamps itself inside the
 * viewport, and dismisses on outside click / scroll / resize / Escape.
 */
export function BubbleContextMenu({
  x,
  y,
  actions,
  onClose,
}: {
  x: number;
  y: number;
  actions: BubbleMenuAction[];
  onClose: () => void;
}) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  useLayoutEffect(() => {
    const el = menuRef.current;
    if (!el) return;
    const { width, height } = el.getBoundingClientRect();
    const margin = 8;
    const left = Math.max(margin, Math.min(x, window.innerWidth - width - margin));
    const top = Math.max(margin, Math.min(y, window.innerHeight - height - margin));
    setPosition({ left, top });
  }, [x, y]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("mousedown", onClose);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    window.addEventListener("keydown", handleKey);
    return () => {
      window.removeEventListener("mousedown", onClose);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
      window.removeEventListener("keydown", handleKey);
    };
  }, [onClose]);

  return createPortal(
    <div
      ref={menuRef}
      className="bubble-context-menu"
      role="menu"
      style={{ left: position.left, top: position.top }}
      onMouseDown={(event) => event.stopPropagation()}
      onContextMenu={(event) => event.preventDefault()}
    >
      {actions.map((action) => (
        <button
          key={action.key}
          type="button"
          role="menuitem"
          disabled={action.disabled}
          onClick={() => {
            action.onSelect();
            onClose();
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>,
    document.body,
  );
}
