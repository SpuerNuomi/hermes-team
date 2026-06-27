import { useState } from "react";
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  Plug,
  Power,
  Save,
  SlidersHorizontal,
} from "lucide-react";
import type { MessagingPlatformInfo } from "../runtime/hermes-runtime";
import type { TranslationVars } from "../i18n/types";

type StatusTone = "running" | "waiting" | "configured" | "disabled" | "unconfigured" | "error";

interface MessagingPlatformCardProps {
  platform: MessagingPlatformInfo;
  source: string;
  busy: boolean;
  open: boolean;
  envDraft: Record<string, string>;
  onToggleOpen: () => void;
  onToggleEnabled: () => void;
  onTest: () => void;
  onEnvChange: (key: string, value: string) => void;
  onClearEnv: (key: string) => void;
  onSaveEnv: () => void;
  onToggleToolset: (key: string, enabled: boolean) => void;
  t: (key: string, vars?: TranslationVars) => string;
}

function resolveStatus(platform: MessagingPlatformInfo): { tone: StatusTone; labelKey: string } {
  if (platform.errorCode || platform.errorMessage) {
    return { tone: "error", labelKey: "settings.messaging.statusError" };
  }
  if (!platform.configured) {
    return { tone: "unconfigured", labelKey: "settings.messaging.statusUnconfigured" };
  }
  if (platform.enabled) {
    return platform.gatewayRunning
      ? { tone: "running", labelKey: "settings.messaging.statusRunning" }
      : { tone: "waiting", labelKey: "settings.messaging.statusWaiting" };
  }
  return { tone: "disabled", labelKey: "settings.messaging.statusDisabled" };
}

export function MessagingPlatformCard({
  platform,
  source,
  busy,
  open,
  envDraft,
  onToggleOpen,
  onToggleEnabled,
  onTest,
  onEnvChange,
  onClearEnv,
  onSaveEnv,
  onToggleToolset,
  t,
}: MessagingPlatformCardProps) {
  const [showAdvanced, setShowAdvanced] = useState(false);

  const status = resolveStatus(platform);
  const requiredFields = platform.envVars.filter((field) => field.required);
  const missingRequired = requiredFields.filter((field) => !field.isSet);
  const basicFields = platform.envVars.filter((field) => field.required || !field.advanced);
  const advancedFields = platform.envVars.filter((field) => !field.required && field.advanced);
  const enabledToolsets = platform.toolsets.filter((toolset) => toolset.enabled).length;

  const renderField = (field: MessagingPlatformInfo["envVars"][number]) => (
    <label className={field.required ? "messaging-field required" : "messaging-field"} key={field.key}>
      <span className="messaging-field-label">
        {field.prompt || field.key}
        {field.required && <em className="messaging-field-required">*</em>}
      </span>
      <input
        type={field.isPassword ? "password" : "text"}
        value={envDraft[field.key] ?? ""}
        onChange={(event) => onEnvChange(field.key, event.target.value)}
        placeholder={field.redactedValue ?? field.key}
      />
      <div className="messaging-field-meta">
        <small>
          <code>{field.key}</code>
          {field.isSet ? ` · ${field.redactedValue ?? "••••"}` : ""}
        </small>
        {field.url && (
          <a href={field.url} target="_blank" rel="noreferrer" className="messaging-field-link">
            <ExternalLink size={11} />
            <span>{t("settings.messaging.docs")}</span>
          </a>
        )}
        {field.isSet && (
          <button disabled={busy} type="button" className="messaging-field-clear" onClick={() => onClearEnv(field.key)}>
            {t("settings.messaging.clear")}
          </button>
        )}
      </div>
      {field.description && <p className="messaging-field-desc">{field.description}</p>}
    </label>
  );

  return (
    <article className={`messaging-card tone-${status.tone} ${open ? "is-open" : ""}`}>
      <button type="button" className="messaging-card-head" onClick={onToggleOpen} aria-expanded={open}>
        <ChevronDown size={16} className="messaging-card-chevron" />
        <div className="messaging-card-title">
          <strong>{platform.name}</strong>
          <span>{platform.description}</span>
        </div>
        <div className="messaging-card-head-meta">
          <span className={`messaging-status-badge tone-${status.tone}`}>{t(status.labelKey)}</span>
          <span className="messaging-card-summary">
            {t("settings.messaging.summary", {
              required: requiredFields.length,
              toolsets: platform.toolsets.length,
            })}
          </span>
        </div>
      </button>

      {open && (
        <div className="messaging-card-body">
          {platform.errorMessage && (
            <div className="messaging-alert">
              <AlertTriangle size={14} />
              <span>{platform.errorMessage}</span>
            </div>
          )}

          {missingRequired.length > 0 && !platform.errorMessage && (
            <div className="messaging-hint">
              {t("settings.messaging.configHint", { count: missingRequired.length })}
            </div>
          )}

          <div className="messaging-card-actions">
            <button
              className={platform.enabled ? "messaging-toggle is-on" : "messaging-toggle"}
              disabled={busy}
              type="button"
              onClick={onToggleEnabled}
            >
              <Power size={14} />
              <span>{platform.enabled ? t("settings.messaging.disable") : t("settings.messaging.enable")}</span>
            </button>
            <button className="messaging-test" disabled={busy} type="button" onClick={onTest}>
              <Plug size={14} />
              <span>{t("settings.shared.test")}</span>
            </button>
            {platform.docsUrl && (
              <a className="messaging-docs-link" href={platform.docsUrl} target="_blank" rel="noreferrer">
                <ExternalLink size={13} />
                <span>{t("settings.messaging.docs")}</span>
              </a>
            )}
            <span className="messaging-source-tag">{source}</span>
          </div>

          <div className="messaging-section">
            <p className="messaging-section-title">{t("settings.messaging.configSection")}</p>
            <div className="messaging-field-grid">{basicFields.map(renderField)}</div>

            {advancedFields.length > 0 && (
              <div className="messaging-advanced">
                <button type="button" className="messaging-advanced-toggle" onClick={() => setShowAdvanced((v) => !v)}>
                  <SlidersHorizontal size={13} />
                  <span>{t("settings.messaging.advanced", { count: advancedFields.length })}</span>
                  <ChevronDown size={13} className={showAdvanced ? "rotated" : ""} />
                </button>
                {showAdvanced && <div className="messaging-field-grid">{advancedFields.map(renderField)}</div>}
              </div>
            )}

            <div className="messaging-section-actions">
              <button className="messaging-save" disabled={busy} type="button" onClick={onSaveEnv}>
                <Save size={14} />
                <span>{t("settings.messaging.saveEnv")}</span>
              </button>
            </div>
          </div>

          {platform.toolsets.length > 0 && (
            <div className="messaging-section">
              <p className="messaging-section-title">
                {t("settings.messaging.toolsetsSection", {
                  enabled: enabledToolsets,
                  total: platform.toolsets.length,
                })}
              </p>
              <div className="messaging-toolset-list">
                {platform.toolsets.map((toolset) => (
                  <button
                    className={`messaging-toolset ${toolset.enabled ? "is-on" : ""} ${
                      toolset.risk === "high" ? "is-high-risk" : ""
                    }`}
                    disabled={busy}
                    key={toolset.key}
                    type="button"
                    onClick={() => onToggleToolset(toolset.key, !toolset.enabled)}
                  >
                    <span className="messaging-toolset-head">
                      <span className="messaging-toolset-label">{toolset.label}</span>
                      {toolset.risk === "high" && (
                        <span className="messaging-toolset-risk">{t("settings.messaging.highRisk")}</span>
                      )}
                    </span>
                    {toolset.description && (
                      <span className="messaging-toolset-desc">{toolset.description}</span>
                    )}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </article>
  );
}
