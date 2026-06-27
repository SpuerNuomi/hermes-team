import { useEffect, useState } from "react";
import { useTranslation } from "../i18n";

type ChatTransportMode = "auto" | "dashboard" | "legacy";

const chatTransportOptions: Array<{ id: ChatTransportMode; label: string; detailKey: string }> = [
  { id: "auto", label: "Auto", detailKey: "app.transport.auto" },
  { id: "dashboard", label: "Dashboard", detailKey: "app.transport.dashboard" },
  { id: "legacy", label: "Legacy", detailKey: "app.transport.legacy" },
];

function formatTokens(n: number): string {
  if (n >= 1_000_000) {
    const value = (n / 1_000_000).toFixed(1);
    return `${value.endsWith(".0") ? value.slice(0, -2) : value}M`;
  }
  if (n >= 1000) {
    const value = (n / 1000).toFixed(1);
    return `${value.endsWith(".0") ? value.slice(0, -2) : value}k`;
  }
  return String(Math.round(n));
}

export function ContextUsageStat({
  used,
  window: ctxWindow,
  cacheReadTokens,
  cacheWriteTokens,
}: {
  used: number;
  window: number;
  cacheReadTokens?: number;
  cacheWriteTokens?: number;
}) {
  const t = useTranslation();
  const hasWindow = ctxWindow > 0;
  const hasUsed = used > 0;
  const pct = hasWindow && hasUsed ? Math.min(100, Math.round((used / ctxWindow) * 100)) : 0;
  const usedLabel = hasUsed ? formatTokens(used) : "—";
  const windowLabel = hasWindow ? formatTokens(ctxWindow) : "—";
  const hasCache = (cacheReadTokens ?? 0) > 0 || (cacheWriteTokens ?? 0) > 0;
  const cacheHitPct =
    hasUsed && (cacheReadTokens ?? 0) > 0
      ? Math.min(100, Math.round(((cacheReadTokens ?? 0) / used) * 100))
      : 0;
  const cacheTitle = hasCache
    ? t("settings.statusbar.cacheTitle", {
        pct: cacheHitPct,
        read: formatTokens(cacheReadTokens ?? 0),
        write: formatTokens(cacheWriteTokens ?? 0),
      })
    : "";
  return (
    <span
      className="status-seg status-ctx"
      title={t("settings.statusbar.contextTitle", { cache: cacheTitle })}
    >
      <span className="status-key">ctx</span>
      <span className="status-ctx-bar" aria-hidden>
        <span
          className={`status-ctx-fill ${pct >= 90 ? "hot" : pct >= 70 ? "warm" : ""}`}
          style={{ width: `${pct}%` }}
        />
      </span>
      <span className="status-val">
        {usedLabel}/{windowLabel}
        {hasUsed && hasWindow ? ` · ${pct}%` : ""}
      </span>
    </span>
  );
}

export function SessionTimer({ startedAt }: { startedAt: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(id);
  }, []);
  const total = Math.max(0, Math.floor((now - startedAt) / 1000));
  const hours = Math.floor(total / 3600);
  const minutes = Math.floor((total % 3600) / 60);
  const seconds = total % 60;
  const pad = (value: number) => String(value).padStart(2, "0");
  const label = hours > 0 ? `${hours}:${pad(minutes)}:${pad(seconds)}` : `${pad(minutes)}:${pad(seconds)}`;
  return <span className="status-val status-mono">{label}</span>;
}

export function StatusRow({
  label,
  value,
  ok,
  warn,
}: {
  label: string;
  value: string;
  ok: boolean;
  warn?: boolean;
}) {
  const t = useTranslation();
  const tone = ok ? "ok" : warn ? "warning" : "danger";
  const text = ok ? "OK" : warn ? t("app.status.warn") : t("app.status.needAction");
  return (
    <div className="status-row">
      <span>{label}</span>
      <strong title={value}>{value}</strong>
      <em className={tone}>{text}</em>
    </div>
  );
}

export function TransportSelector({
  label,
  value,
  onChange,
}: {
  label: string;
  value: ChatTransportMode;
  onChange: (value: ChatTransportMode) => void;
}) {
  const t = useTranslation();
  return (
    <div className="transport-selector">
      <strong>{label}</strong>
      <div>
        {chatTransportOptions.map((option) => (
          <button
            className={value === option.id ? "active" : ""}
            key={option.id}
            type="button"
            onClick={() => onChange(option.id)}
            title={t(option.detailKey)}
          >
            {option.label}
          </button>
        ))}
      </div>
    </div>
  );
}

