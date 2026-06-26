declare const __APP_VERSION__: string;
declare const __GIT_COMMIT__: string;
declare const __GIT_AHEAD__: string;

function safe(value: unknown): string {
  return typeof value === "string" ? value : "";
}

export const APP_VERSION = safe(typeof __APP_VERSION__ !== "undefined" ? __APP_VERSION__ : "");
export const GIT_COMMIT = safe(typeof __GIT_COMMIT__ !== "undefined" ? __GIT_COMMIT__ : "");
export const GIT_AHEAD = safe(typeof __GIT_AHEAD__ !== "undefined" ? __GIT_AHEAD__ : "");

/** Render a compact build tag, e.g. `v0.1.0 (+7) a1b2c3d`. */
export function buildLabel(): string {
  const parts: string[] = [];
  if (APP_VERSION) parts.push(`v${APP_VERSION}`);
  const ahead = Number(GIT_AHEAD);
  if (Number.isFinite(ahead) && ahead > 0) parts.push(`(+${ahead})`);
  if (GIT_COMMIT) parts.push(GIT_COMMIT);
  return parts.join(" ");
}
