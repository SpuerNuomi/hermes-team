import type { TranslationVars } from "../i18n/types";

type TranslateFn = (key: string, vars?: TranslationVars) => string;

/**
 * Friendly relative label for the hover timestamp on each bubble — "just now",
 * minutes/hours/days ago, then an absolute date for anything older. The full
 * date-time stays available as the element's tooltip/`dateTime`.
 */
export function formatBubbleTime(timestamp: number, t: TranslateFn): string {
  if (!timestamp || timestamp <= 0) return "";
  const diff = Date.now() - timestamp;
  if (diff < 10_000) return t("bubble.time.justNow");
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return t("bubble.time.minutesAgo", { count: minutes });
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return t("bubble.time.hoursAgo", { count: hours });
  const days = Math.floor(hours / 24);
  if (days < 7) return t("bubble.time.daysAgo", { count: days });
  return new Date(timestamp).toLocaleDateString(t("bubble.time.dateLocale"), {
    month: "short",
    day: "numeric",
  });
}

/** Absolute timestamp for the bubble-time tooltip and `<time dateTime>` value. */
export function formatBubbleTimeAbsolute(timestamp: number, t: TranslateFn): string {
  return new Date(timestamp).toLocaleString(t("bubble.time.dateLocale"), {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
