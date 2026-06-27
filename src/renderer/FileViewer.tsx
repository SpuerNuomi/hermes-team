import { Copy, ExternalLink, FileCode, Paperclip, X } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { useTranslation } from "../i18n";
import { openFileInEditor, readFile, readImageFile } from "../runtime/hermes-runtime";

const VIEWABLE_IMAGE_EXTENSIONS = new Set(["png", "jpg", "jpeg", "gif", "bmp", "webp", "svg", "ico"]);

const BINARY_EXTENSIONS = new Set([
  "heic",
  "heif",
  "tiff",
  "tif",
  "raw",
  "psd",
  "ai",
  "eps",
  "pdf",
  "mp4",
  "mov",
  "avi",
  "mkv",
  "mp3",
  "wav",
  "flac",
  "zip",
  "rar",
  "7z",
  "tar",
  "gz",
  "xz",
  "exe",
  "dmg",
  "pkg",
  "dll",
  "so",
  "dylib",
  "bin",
  "db",
  "sqlite",
  "sqlite3",
  "woff",
  "woff2",
  "ttf",
  "otf",
]);

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function extension(path: string): string {
  const name = fileName(path);
  const index = name.lastIndexOf(".");
  return index >= 0 ? name.slice(index + 1).toLowerCase() : "";
}

function formatTextSize(content: string): string {
  const bytes = new Blob([content]).size;
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const FileViewer = memo(function FileViewer({
  filePath,
  onClose,
  onAttach,
}: {
  filePath: string;
  onClose: () => void;
  onAttach: (path: string) => void;
}) {
  const t = useTranslation();
  const [content, setContent] = useState<string | null>(null);
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [openError, setOpenError] = useState("");

  const name = fileName(filePath);
  const ext = useMemo(() => extension(filePath), [filePath]);
  const isImage = VIEWABLE_IMAGE_EXTENSIONS.has(ext);
  const isBinary = BINARY_EXTENSIONS.has(ext);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    setOpenError("");
    setContent(null);
    setImageUrl(null);
    setTruncated(false);

    const load = async () => {
      try {
        if (isImage) {
          const dataUrl = await readImageFile(filePath);
          if (!cancelled) setImageUrl(dataUrl);
        } else if (isBinary) {
          if (!cancelled) setContent("");
        } else {
          const result = await readFile(filePath, 102_400);
          if (!cancelled) {
            setContent(result.content);
            setTruncated(result.truncated);
          }
        }
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err));
      } finally {
        if (!cancelled) setLoading(false);
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [filePath, isBinary, isImage]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  const copyContent = () => {
    const value = content || filePath;
    void navigator.clipboard?.writeText(value);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  };

  const openExternally = async () => {
    setOpenError("");
    try {
      const opened = await openFileInEditor(filePath);
      if (!opened) setOpenError(t("fileViewer.openFailed"));
    } catch (err) {
      setOpenError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="file-viewer-overlay" onClick={onClose}>
      <section className="file-viewer-modal" onClick={(event) => event.stopPropagation()}>
        <header className="file-viewer-header">
          <div className="file-viewer-title">
            <FileCode size={16} />
            <strong title={filePath}>{name}</strong>
            <span title={filePath}>
              {imageUrl ? t("fileViewer.image") : content != null && content.length > 0 ? formatTextSize(content) : filePath}
              {truncated ? ` ${t("fileViewer.truncatedTag")}` : ""}
            </span>
          </div>
          <div className="file-viewer-actions">
            <button type="button" title={t("fileViewer.attachTitle")} onClick={() => onAttach(filePath)}>
              <Paperclip size={14} />
              <span>{t("fileViewer.attach")}</span>
            </button>
            <button type="button" title={t("fileViewer.copyTitle")} onClick={copyContent}>
              <Copy size={14} />
              <span>{copied ? t("fileViewer.copied") : t("fileViewer.copy")}</span>
            </button>
            <button type="button" title={t("fileViewer.open")} onClick={() => void openExternally()}>
              <ExternalLink size={14} />
              <span>{t("fileViewer.open")}</span>
            </button>
            <button type="button" title={t("common.close")} aria-label={t("common.close")} onClick={onClose}>
              <X size={15} />
            </button>
          </div>
        </header>
        {openError && <div className="file-viewer-inline-error">{openError}</div>}
        <div className="file-viewer-content">
          {loading ? (
            <div className="file-viewer-state">{t("fileViewer.loading")}</div>
          ) : error ? (
            <div className="file-viewer-state file-viewer-error">{error}</div>
          ) : imageUrl ? (
            <div className="file-viewer-image-wrap">
              <img src={imageUrl} alt={name} />
            </div>
          ) : isBinary ? (
            <div className="file-viewer-state">
              <strong>{t("fileViewer.binary")}</strong>
              <span>{t("fileViewer.binaryHint")}</span>
            </div>
          ) : (
            <>
              {truncated && <div className="file-viewer-truncated">{t("fileViewer.truncatedNote")}</div>}
              <pre className="file-viewer-code">
                <code>{content}</code>
              </pre>
            </>
          )}
        </div>
      </section>
    </div>
  );
});
