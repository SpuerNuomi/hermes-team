import { ExternalLink, Globe, MousePointerClick, RotateCw, X } from "lucide-react";
import { memo, useCallback, useEffect, useRef, useState } from "react";
import { useTranslation } from "../i18n";
import {
  createInspectorController,
  type InspectorController,
  type InspectPayload,
} from "./webPreviewInspector";

function normalizePreviewUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

// Reach into the iframe document only when the previewed page shares the app
// origin. Cross-origin access throws (or returns null) per the same-origin
// policy, which we treat as "inspection unavailable".
function reachableDocument(frame: HTMLIFrameElement | null): Document | null {
  if (!frame) return null;
  try {
    const doc = frame.contentDocument;
    if (doc && doc.body) return doc;
    return null;
  } catch {
    return null;
  }
}

export const WebPreviewPanel = memo(function WebPreviewPanel({
  url,
  onClose,
  onOpenExternal,
  onInspectElement,
}: {
  url: string;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
  onInspectElement?: (payload: InspectPayload) => void;
}) {
  const t = useTranslation();
  const [currentUrl, setCurrentUrl] = useState(() => normalizePreviewUrl(url));
  const [draftUrl, setDraftUrl] = useState(() => normalizePreviewUrl(url));
  const [frameKey, setFrameKey] = useState(0);
  const [isInspecting, setIsInspecting] = useState(false);
  const [inspectNotice, setInspectNotice] = useState<string | null>(null);

  const frameRef = useRef<HTMLIFrameElement>(null);
  const controllerRef = useRef<InspectorController | null>(null);

  const stopInspecting = useCallback(() => {
    controllerRef.current?.destroy();
    controllerRef.current = null;
    setIsInspecting(false);
  }, []);

  useEffect(() => {
    const next = normalizePreviewUrl(url);
    setCurrentUrl(next);
    setDraftUrl(next);
    setFrameKey((key) => key + 1);
  }, [url]);

  // Reset picker state whenever the frame reloads/navigates so a stale
  // controller never points at a detached document.
  useEffect(() => {
    stopInspecting();
    setInspectNotice(null);
  }, [currentUrl, frameKey, stopInspecting]);

  // Attach or detach the element picker on the (same-origin) iframe document.
  useEffect(() => {
    if (!isInspecting) {
      controllerRef.current?.destroy();
      controllerRef.current = null;
      return;
    }

    const frame = frameRef.current;
    const doc = reachableDocument(frame);
    const win = frame?.contentWindow ?? null;
    if (!doc || !win) {
      setInspectNotice(t("webPreview.inspectUnavailable"));
      setIsInspecting(false);
      return;
    }

    setInspectNotice(null);
    const controller = createInspectorController(doc, win, {
      onPick: (payload) => {
        onInspectElement?.(payload);
        controllerRef.current = null;
        setIsInspecting(false);
      },
      onCancel: () => {
        controllerRef.current = null;
        setIsInspecting(false);
      },
    });
    controllerRef.current = controller;

    return () => {
      controller.destroy();
      if (controllerRef.current === controller) controllerRef.current = null;
    };
  }, [isInspecting, onInspectElement, t]);

  useEffect(() => () => controllerRef.current?.destroy(), []);

  const toggleInspect = (): void => {
    if (isInspecting) {
      stopInspecting();
      return;
    }
    setInspectNotice(null);
    setIsInspecting(true);
  };

  return (
    <aside className="web-preview-panel">
      <div className="web-preview-header">
        <button type="button" className="web-preview-btn" onClick={() => setFrameKey((key) => key + 1)} title={t("webPreview.reload")}>
          <RotateCw size={15} />
        </button>
        <button
          type="button"
          className={`web-preview-btn ${isInspecting ? "web-preview-btn-active" : ""}`}
          onClick={toggleInspect}
          aria-pressed={isInspecting}
          title={isInspecting ? t("webPreview.exitInspect") : t("webPreview.startInspect")}
        >
          <MousePointerClick size={15} />
        </button>
        <form
          className="web-preview-address-bar"
          onSubmit={(event) => {
            event.preventDefault();
            const next = normalizePreviewUrl(draftUrl);
            setCurrentUrl(next);
            setDraftUrl(next);
            setFrameKey((key) => key + 1);
          }}
        >
          <Globe size={13} />
          <input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} aria-label={t("webPreview.urlLabel")} />
        </form>
        <button type="button" className="web-preview-btn" onClick={() => onOpenExternal(currentUrl)} title={t("webPreview.openExternal")}>
          <ExternalLink size={15} />
        </button>
        <button type="button" className="web-preview-btn" onClick={onClose} title={t("common.close")}>
          <X size={15} />
        </button>
      </div>
      {isInspecting && (
        <div className="web-preview-inspect-hint" role="status">
          {t("webPreview.inspectHint")}
        </div>
      )}
      {inspectNotice && (
        <div className="web-preview-inspect-notice" role="alert">
          {inspectNotice}
        </div>
      )}
      <iframe
        ref={frameRef}
        key={frameKey}
        className="web-preview-frame"
        src={currentUrl}
        title="Web preview"
        sandbox="allow-scripts allow-forms allow-same-origin allow-popups"
      />
    </aside>
  );
});
