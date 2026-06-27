import {
  AlertTriangle,
  CheckCircle2,
  Download,
  RefreshCw,
  Rocket,
  X,
} from "lucide-react";
import { AgentMarkdown } from "./AgentMarkdown";
import { useTranslation } from "../i18n";
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
  { titleKey: string; Icon: typeof Rocket; accent: string }
> = {
  available: { titleKey: "updateDialog.foundNewVersion", Icon: Rocket, accent: "update-dialog-accent-available" },
  current: { titleKey: "updateDialog.upToDate", Icon: CheckCircle2, accent: "update-dialog-accent-current" },
  failed: { titleKey: "updateDialog.checkFailed", Icon: AlertTriangle, accent: "update-dialog-accent-failed" },
};

export function UpdateDialog({
  status,
  busy = false,
  onClose,
  onRecheck,
  onOpenRelease,
}: UpdateDialogProps) {
  const t = useTranslation();
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
        aria-label={t("updateDialog.ariaLabel")}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className={`update-dialog-header ${meta.accent}`}>
          <div className="update-dialog-header-main">
            <meta.Icon size={22} />
            <div>
              <strong>{t(meta.titleKey)}</strong>
              <span>{status.releaseRepo}</span>
            </div>
          </div>
          <button type="button" className="update-dialog-close" onClick={onClose} aria-label={t("common.close")}>
            <X size={18} />
          </button>
        </header>

        <div className="update-dialog-body">
          <div className="update-dialog-versions">
            <div className="update-dialog-version">
              <span className="update-dialog-version-label">{t("updateDialog.currentVersion")}</span>
              <strong>{status.appVersion}</strong>
            </div>
            <div className="update-dialog-version">
              <span className="update-dialog-version-label">{t("updateDialog.latestVersion")}</span>
              <strong>{headingVersion ?? "—"}</strong>
            </div>
          </div>

          {status.releaseName && tone !== "failed" && (
            <p className="update-dialog-release-name">{status.releaseName}</p>
          )}
          {published && tone !== "failed" && (
            <p className="update-dialog-meta">{t("updateDialog.publishedAt", { time: published })}</p>
          )}

          <p className={`update-dialog-message ${tone === "failed" ? "is-error" : ""}`}>
            {status.message}
          </p>

          {tone === "available" && status.releaseNotes && (
            <div className="update-dialog-notes">
              <span className="update-dialog-notes-label">{t("updateDialog.releaseNotes")}</span>
              <div className="update-dialog-notes-body">
                <AgentMarkdown>{status.releaseNotes}</AgentMarkdown>
              </div>
            </div>
          )}

          {tone === "failed" && (
            <p className="update-dialog-meta">
              {t("updateDialog.failedHint")}
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
            <span>{busy ? t("updateDialog.checking") : t("updateDialog.recheck")}</span>
          </button>
          <div className="update-dialog-footer-right">
            <button type="button" className="update-dialog-secondary" onClick={onClose}>
              <span>{tone === "available" ? t("updateDialog.later") : t("common.close")}</span>
            </button>
            {tone === "available" && releaseUrl && (
              <button
                type="button"
                className="update-dialog-primary"
                onClick={() => onOpenRelease(releaseUrl)}
              >
                <Download size={14} />
                <span>{t("updateDialog.goDownload")}</span>
              </button>
            )}
          </div>
        </footer>
      </div>
    </div>
  );
}

export default UpdateDialog;
