import { ExternalLink, Globe, RotateCw, X } from "lucide-react";
import { memo, useEffect, useState } from "react";

function normalizePreviewUrl(value: string): string {
  const trimmed = value.trim();
  if (!trimmed) return "about:blank";
  if (/^https?:\/\//i.test(trimmed)) return trimmed;
  if (/^(localhost|127\.0\.0\.1|\[::1\])/i.test(trimmed)) return `http://${trimmed}`;
  return `https://${trimmed}`;
}

export const WebPreviewPanel = memo(function WebPreviewPanel({
  url,
  onClose,
  onOpenExternal,
}: {
  url: string;
  onClose: () => void;
  onOpenExternal: (url: string) => void;
}) {
  const [currentUrl, setCurrentUrl] = useState(() => normalizePreviewUrl(url));
  const [draftUrl, setDraftUrl] = useState(() => normalizePreviewUrl(url));
  const [frameKey, setFrameKey] = useState(0);

  useEffect(() => {
    const next = normalizePreviewUrl(url);
    setCurrentUrl(next);
    setDraftUrl(next);
    setFrameKey((key) => key + 1);
  }, [url]);

  return (
    <aside className="web-preview-panel">
      <div className="web-preview-header">
        <button type="button" className="web-preview-btn" onClick={() => setFrameKey((key) => key + 1)} title="Reload">
          <RotateCw size={15} />
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
          <input value={draftUrl} onChange={(event) => setDraftUrl(event.target.value)} aria-label="Web preview URL" />
        </form>
        <button type="button" className="web-preview-btn" onClick={() => onOpenExternal(currentUrl)} title="Open externally">
          <ExternalLink size={15} />
        </button>
        <button type="button" className="web-preview-btn" onClick={onClose} title="Close">
          <X size={15} />
        </button>
      </div>
      <iframe key={frameKey} className="web-preview-frame" src={currentUrl} title="Web preview" sandbox="allow-scripts allow-forms allow-same-origin allow-popups" />
    </aside>
  );
});
