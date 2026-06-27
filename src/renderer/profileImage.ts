import type { TranslationVars } from "../i18n/types";

type TranslateFn = (key: string, vars?: TranslationVars) => string;

/**
 * Read an image File and produce a small, square, center-cropped PNG data URL
 * suitable for a profile avatar. Keeping it tiny (default 128px) bounds the
 * size of what we persist in the profile's `profile-meta.json`.
 */
export async function fileToAvatarDataUrl(
  file: File,
  t: TranslateFn,
  size = 128,
): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error(t("profileImage.readFailed")));
    reader.readAsDataURL(file);
  });

  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error(t("profileImage.decodeFailed")));
    image.src = dataUrl;
  });

  const canvas = document.createElement("canvas");
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  const side = Math.min(img.width, img.height);
  const sx = (img.width - side) / 2;
  const sy = (img.height - side) / 2;
  ctx.drawImage(img, sx, sy, side, side, 0, 0, size, size);

  return canvas.toDataURL("image/png");
}
