// Accent-color palette for Hermes profiles. A flat, readable set that pairs
// well with white text on the avatar fallback. Shared by the profile cards and
// the profile detail modal so the same swatches appear everywhere.
export const PROFILE_COLORS = [
  "#3498DB",
  "#1ABC9C",
  "#2ECC71",
  "#9B59B6",
  "#E67E22",
  "#E74C3C",
  "#16A085",
  "#2980B9",
  "#8E44AD",
  "#27AE60",
  "#D35400",
  "#C0392B",
  "#F39C12",
  "#34495E",
  "#E84393",
  "#00B894",
  "#0984E3",
  "#6C5CE7",
  "#FD79A8",
  "#00CEC9",
  "#FDCB6E",
  "#636E72",
] as const;

/**
 * Deterministic default accent color for a profile that hasn't picked one.
 * Hashing the name keeps the color stable across reloads while spreading
 * profiles across the palette.
 */
export function defaultColorForName(name: string): string {
  let hash = 0;
  for (let index = 0; index < name.length; index += 1) {
    hash = (hash * 31 + name.charCodeAt(index)) | 0;
  }
  return PROFILE_COLORS[Math.abs(hash) % PROFILE_COLORS.length];
}

/** First glyph (uppercased) used for the avatar fallback. */
export function profileInitial(name: string): string {
  const trimmed = name.trim();
  return trimmed ? trimmed.charAt(0).toUpperCase() : "?";
}
