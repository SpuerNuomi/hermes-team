import { Check } from "lucide-react";
import { memo } from "react";
import type { WorkMode } from "../core/types";
import { WORK_MODES } from "../core/workMode";
import { useTranslation } from "../i18n";

export const WorkModePicker = memo(function WorkModePicker({
  value,
  disabled,
  onChange,
}: {
  value: WorkMode;
  disabled?: boolean;
  onChange: (mode: WorkMode) => void;
}) {
  const t = useTranslation();

  return (
    <div className="work-mode-picker" role="group" aria-label={t("taskHeader.workModeLabel")}>
      {WORK_MODES.map((mode) => {
        const active = value === mode;
        return (
          <button
            key={mode}
            type="button"
            className={`work-mode-option ${active ? "active" : ""}`}
            disabled={disabled}
            aria-pressed={active}
            title={t(`taskHeader.workMode.${mode}.hint`)}
            onClick={() => onChange(mode)}
          >
            {active && <Check size={12} aria-hidden="true" />}
            <span>{t(`taskHeader.workMode.${mode}.label`)}</span>
          </button>
        );
      })}
    </div>
  );
});
