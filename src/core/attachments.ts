export type AttachmentKind = "image" | "text-file" | "path-ref";

export const MAX_ATTACHMENTS_PER_MESSAGE = 10;
export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_TEXT_BYTES = 256 * 1024;

export const IMAGE_MIMES = new Set(["image/png", "image/jpeg", "image/webp", "image/gif"]);

const TEXT_EXTENSIONS = new Set([
  "md",
  "markdown",
  "txt",
  "log",
  "csv",
  "tsv",
  "json",
  "yaml",
  "yml",
  "toml",
  "ini",
  "env",
  "xml",
  "html",
  "htm",
  "css",
  "scss",
  "less",
  "sql",
  "sh",
  "bash",
  "zsh",
  "py",
  "js",
  "jsx",
  "ts",
  "tsx",
  "mjs",
  "cjs",
  "go",
  "rs",
  "c",
  "cc",
  "cpp",
  "h",
  "hpp",
  "java",
  "kt",
  "rb",
  "php",
  "swift",
  "lua",
  "vue",
  "svelte",
  "dockerfile",
  "makefile",
  "gitignore",
]);

export function extensionFor(name: string): string {
  const dot = name.lastIndexOf(".");
  if (dot < 0 || dot === name.length - 1) return name.toLowerCase();
  return name.slice(dot + 1).toLowerCase();
}

export function isImageMime(mime: string): boolean {
  return IMAGE_MIMES.has(mime.toLowerCase());
}

export function isTextLikeFile(mime: string, name: string): boolean {
  if (mime.toLowerCase().startsWith("text/")) return true;
  return TEXT_EXTENSIONS.has(extensionFor(name));
}
