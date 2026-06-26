import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { AgentMarkdown } from "./AgentMarkdown";
import type { UpdateStatus } from "../runtime/hermes-runtime";

interface UpdateDialogProps {
  status: UpdateStatus;
  busy?: boolean;
  onClose: () => void;
  onRecheck: () => void;
  onOpenRelease: (url: string) => void;
}

type DialogTone = "available" | "current" | "failed";

function resolveTone(status: UpdateStatus): DialogTone {
  if (status.checked && !status.checkOk) return "failed";
  if (status.updateAvailable) return "available";
  return "current";
}

function formatPublished(value?: string | null): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

const TONE_META: Record<
  DialogTone,
  { title: string; Icon: typeof Rocket; accent: string }
> = {
  available: { title: "发现新版本", Icon: Rocket, accent: "update-dialog-accent-available" },
  current: { title: "已是最新版本", Icon: CheckCircle2, accent: "update-dialog-accent-current" },
  failed: { title: "检查更新失败", Icon: AlertTriangle, accent: "update-dialog-accent-failed" },
};

export function UpdateDialog({
  status,
  busy = false,
  onClose,
  onRecheck,
  onOpenRelease,
}: UpdateDialogProps) {
  const tone = resolveTone(status);
  const meta = TONE_META[tone];
  const published = formatPublished(status.publishedAt);
  const releaseUrl = status.releaseUrl ?? null;
  const headingVersion =
    tone === "available" ? status.updateAvailable ?? status.latestVersion : status.latestVersion;

  return (
    <div className="update-dialog-overlay" onMouseDown={onClose}>
      <div
        className="update-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="桌面更新"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`update-dialog-header ${meta.accent}`}>
          <div className="update-dialog-header-main">
            <meta.Icon size={22} />
            <div>
              <strong>{meta.title}</strong>
              <span>{status.releaseRepo}</span>
            </div>
          </div>
          <button type="button" className="update-dialog-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="update-dialog-body">
          <div className="update-dialog-versions">
            <div className="update-dialog-version">
              <span className="update-dialog-version-label">当前版本</span>
              <strong>{status.appVersion}</strong>
            </div>
            <div className="update-dialog-version">
              <span className="update-dialog-version-label">最新版本</span>
              <strong>{headingVersion ?? "—"}</strong>
            </div>
          </div>

          {status.releaseName && tone !== "failed" && (
            <p className="update-dialog-release-name">{status.releaseName}</p>
          )}
          {published && tone !== "failed" && (
            <p className="update-dialog-meta">发布时间：{published}</p>
          )}

          <p className={`update-dialog-message ${tone === "failed" ? "is-error" : ""}`}>
            {status.message}
          </p>

          {tone === "available" && status.releaseNotes && (
            <div className="update-dialog-notes">
              <span className="update-dialog-notes-label">更新说明</span>
              <div className="update-dialog-notes-body">
                <AgentMarkdown>{status.releaseNotes}</AgentMarkdown>
              </div>
            </div>
          )}

          {tone === "failed" && (
            <p className="update-dialog-meta">
              网络不可用时可稍后重试，或在“更新检查”面板调整 release 源。
            </p>
          )}
        </div>

        <footer className="update-dialog-footer">
          <button
            type="button"
            className="update-dialog-secondary"
            disabled={busy}
            onClick={onRecheck}
          >
            <RefreshCw size={14} />
            <span>{busy ? "检查中…" : "重新检查"}</span>
          </button>
          <div className="update-dialog-footer-right">
            <button type="button" className="update-dialog-secondary" onClick={onClose}>
              <span>{tone === "available" ? "稍后" : "关闭"}</span>
            </button>
            {tone === "available" && releaseUrl && (
              <button
                type="button"
                className="update-dialog-primary"
                onClick={() => onOpenRelease(releaseUrl)}
              >
                <Download size={14} />
                <span>前往下载</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export default UpdateDialog;
