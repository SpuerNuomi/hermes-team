/**
 * Friendly relative label for the hover timestamp on each bubble — "刚刚",
 * "5 分钟前", "3 小时前", "2 天前", then an absolute date for anything older.
 * The full date-time stays available as the element's tooltip/`dateTime`.
 */
export function formatBubbleTime(timestamp: number): string {
  if (!timestamp || timestamp <= 0) return "";
  const diff = Date.now() - timestamp;
  if (diff < 10_000) return "刚刚";
  const minutes = Math.floor(diff / 60_000);
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 7) return `${days} 天前`;
  return new Date(timestamp).toLocaleDateString("zh-CN", {
    month: "short",
    day: "numeric",
  });
}

/** Absolute timestamp for the bubble-time tooltip and `<time dateTime>` value. */
export function formatBubbleTimeAbsolute(timestamp: number): string {
  return new Date(timestamp).toLocaleString("zh-CN", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}
