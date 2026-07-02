import { AlertTriangle, X } from "lucide-react";
import { memo, useId, useState } from "react";
import { useTranslation } from "../i18n";

export const DestructiveConfirmModal = memo(function DestructiveConfirmModal({
  preview,
  busy,
  onCancel,
  onConfirm,
}: {
  preview: string;
  busy?: boolean;
  onCancel: () => void;
  onConfirm: (rememberForTask: boolean) => void;
}) {
  const t = useTranslation();
  const titleId = useId();
  const [remember, setRemember] = useState(false);

  return (
    <div
      className="snippet-modal-overlay destructive-confirm-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget && !busy) onCancel();
      }}
    >
      <div
        className="snippet-modal destructive-confirm-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
      >
        <div className="snippet-modal-head">
          <div className="destructive-confirm-head">
            <AlertTriangle size={20} aria-hidden="true" />
            <div>
              <h2 id={titleId}>{t("taskHeader.destructiveTitle")}</h2>
              <p>{t("taskHeader.destructiveBody")}</p>
            </div>
          </div>
          <button
            type="button"
            className="snippet-modal-close"
            aria-label={t("common.close")}
            disabled={busy}
            onClick={onCancel}
          >
            <X size={18} />
          </button>
        </div>
        <pre className="destructive-confirm-preview">{preview}</pre>
        <label className="destructive-confirm-remember">
          <input
            type="checkbox"
            checked={remember}
            disabled={busy}
            onChange={(event) => setRemember(event.target.checked)}
          />
          <span>{t("taskHeader.destructiveRemember")}</span>
        </label>
        <div className="snippet-form-actions destructive-confirm-actions">
          <button type="button" className="snippet-form-cancel" disabled={busy} onClick={onCancel}>
            {t("taskHeader.destructiveCancel")}
          </button>
          <button
            type="button"
            className="snippet-form-save destructive-confirm-submit"
            disabled={busy}
            onClick={() => onConfirm(remember)}
          >
            {t("taskHeader.destructiveConfirm")}
          </button>
        </div>
      </div>
    </div>
  );
});
