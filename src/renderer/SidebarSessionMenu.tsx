import { Check, FolderInput, FolderMinus, Pin, PinOff } from "lucide-react";
import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslation } from "../i18n";
import type { SessionProject } from "./SessionMoveMenu";

export interface SidebarMenuTarget {
  id: string;
  title: string;
  contextFolder: string | null;
  /** Viewport coordinates the menu anchors to (the trigger button / cursor). */
  x: number;
  y: number;
}

const MENU_WIDTH = 220;
const VIEWPORT_MARGIN = 8;

/**
 * Context menu for a sidebar session row: pin/unpin plus move-to-group. Rendered
 * in a portal at viewport coordinates so it escapes the sidebar's clipped scroll
 * container, and clamped to stay on screen. Closes on outside click, Escape, or
 * scroll.
 */
export function SidebarSessionMenu({
  target,
  isPinned,
  projects,
  onClose,
  onTogglePin,
  onMove,
  onPickFolder,
}: {
  target: SidebarMenuTarget;
  isPinned: boolean;
  projects: SessionProject[];
  onClose: () => void;
  onTogglePin: () => void;
  onMove: (folder: string | null) => void;
  onPickFolder: () => void;
}) {
  const t = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ left: target.x, top: target.y });
  const currentFolder = target.contextFolder?.trim() || null;

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const width = el.offsetWidth || MENU_WIDTH;
    const height = el.offsetHeight;
    let left = target.x;
    let top = target.y;
    if (left + width > window.innerWidth - VIEWPORT_MARGIN) {
      left = window.innerWidth - width - VIEWPORT_MARGIN;
    }
    if (top + height > window.innerHeight - VIEWPORT_MARGIN) {
      top = window.innerHeight - height - VIEWPORT_MARGIN;
    }
    setPos({
      left: Math.max(VIEWPORT_MARGIN, left),
      top: Math.max(VIEWPORT_MARGIN, top),
    });
  }, [target.x, target.y]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    const onScroll = () => onClose();
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    window.addEventListener("scroll", onScroll, true);
    window.addEventListener("blur", onClose);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
      window.removeEventListener("scroll", onScroll, true);
      window.removeEventListener("blur", onClose);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="sidebar-session-menu"
      role="menu"
      ref={ref}
      style={{ left: pos.left, top: pos.top, width: MENU_WIDTH }}
      onClick={(event) => event.stopPropagation()}
    >
      <button
        type="button"
        role="menuitem"
        className="sidebar-session-menu-item"
        onClick={() => {
          onTogglePin();
          onClose();
        }}
      >
        {isPinned ? <PinOff size={15} /> : <Pin size={15} />}
        <span>{isPinned ? t("sessions.unpin") : t("sessions.pin")}</span>
      </button>
      <div className="sidebar-session-menu-divider" />
      <p className="sidebar-session-menu-label">{t("sessions.moveToGroup")}</p>
      <div className="sidebar-session-menu-scroll">
        {projects.length === 0 ? (
          <div className="sidebar-session-menu-empty">{t("sessions.noGroupFolders")}</div>
        ) : (
          projects.map((project) => {
            const active = project.path === currentFolder;
            return (
              <button
                key={project.path}
                type="button"
                role="menuitem"
                className="sidebar-session-menu-item"
                title={project.path}
                onClick={() => {
                  if (!active) onMove(project.path);
                  onClose();
                }}
              >
                <span className="sidebar-session-menu-name">{project.name}</span>
                {active && <Check size={14} />}
              </button>
            );
          })
        )}
      </div>
      <div className="sidebar-session-menu-divider" />
      <button
        type="button"
        role="menuitem"
        className="sidebar-session-menu-item"
        onClick={() => {
          onPickFolder();
          onClose();
        }}
      >
        <FolderInput size={15} />
        <span>{t("sessions.pickNewFolder")}</span>
      </button>
      {currentFolder && (
        <button
          type="button"
          role="menuitem"
          className="sidebar-session-menu-item"
          onClick={() => {
            onMove(null);
            onClose();
          }}
        >
          <FolderMinus size={15} />
          <span>{t("sessions.removeFromGroup")}</span>
        </button>
      )}
    </div>,
    document.body,
  );
}
