import { Check, FolderInput, FolderMinus } from "lucide-react";
import { useEffect, useRef } from "react";
import { useTranslation } from "../i18n";

export interface SessionProject {
  path: string;
  name: string;
}

/**
 * Lightweight dropdown for moving a session into one of the existing project
 * folders, picking a brand-new folder, or removing it from its group. Rendered
 * inline (absolutely positioned) next to its trigger; closes on outside click
 * or Escape. No portal/animation deps so it stays cheap in the Tauri WebView.
 */
export function SessionMoveMenu({
  projects,
  currentFolder,
  onClose,
  onMove,
  onPickFolder,
}: {
  projects: SessionProject[];
  currentFolder: string | null;
  onClose: () => void;
  onMove: (folder: string | null) => void;
  onPickFolder: () => void;
}) {
  const t = useTranslation();
  const ref = useRef<HTMLDivElement>(null);
  const normalizedCurrent = currentFolder?.trim() || null;

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
    window.addEventListener("mousedown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown, true);
      window.removeEventListener("keydown", onKeyDown, true);
    };
  }, [onClose]);

  return (
    <div className="session-move-menu" role="menu" ref={ref}>
      <p className="session-move-menu-label">{t("sessions.moveToGroup")}</p>
      <div className="session-move-menu-scroll">
        {projects.length === 0 ? (
          <div className="session-move-menu-empty">{t("sessions.noGroupFolders")}</div>
        ) : (
          projects.map((project) => {
            const active = project.path === normalizedCurrent;
            return (
              <button
                key={project.path}
                type="button"
                role="menuitem"
                className="session-move-menu-item"
                title={project.path}
                onClick={() => {
                  if (!active) onMove(project.path);
                  else onClose();
                }}
              >
                <span className="session-move-menu-name">{project.name}</span>
                {active && <Check size={14} />}
              </button>
            );
          })
        )}
      </div>
      <div className="session-move-menu-divider" />
      <button
        type="button"
        role="menuitem"
        className="session-move-menu-item"
        onClick={onPickFolder}
      >
        <FolderInput size={14} />
        <span>{t("sessions.pickNewFolder")}</span>
      </button>
      {normalizedCurrent && (
        <button
          type="button"
          role="menuitem"
          className="session-move-menu-item"
          onClick={() => onMove(null)}
        >
          <FolderMinus size={14} />
          <span>{t("sessions.removeFromGroup")}</span>
        </button>
      )}
    </div>
  );
}
