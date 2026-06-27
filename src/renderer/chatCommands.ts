export function parseBackgroundCommand(text: string): string | null {
  const match = /^\/(?:btw|bg|background)(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  return (match[1] ?? "").trim();
}

export function parseBrowseCommand(text: string): string | null {
  const match = /^\/browse(?:\s+([\s\S]*))?$/i.exec(text.trim());
  if (!match) return null;
  const value = (match[1] ?? "").trim();
  return value || null;
}

