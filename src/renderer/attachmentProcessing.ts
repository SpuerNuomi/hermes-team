import {
  isImageMime,
  isTextLikeFile,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_IMAGE_TARGET_BYTES,
  MAX_TEXT_BYTES,
} from "../core/attachments";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import type { MessageAttachment } from "../core/types";
import { stageAttachmentFile } from "../runtime/hermes-runtime";
import type { TranslationVars } from "../i18n/types";

type TranslateFn = (key: string, vars?: TranslationVars) => string;

export interface AttachmentProcessResult {
  attachments: MessageAttachment[];
  errors: string[];
}

function newAttachmentId(): string {
  return `att-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsDataURL(file);
  });
}

function readAsText(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("read failed"));
    reader.readAsText(file, "utf-8");
  });
}

async function readAsBase64(file: File): Promise<string> {
  const dataUrl = await readAsDataUrl(file);
  const comma = dataUrl.indexOf(",");
  return comma >= 0 ? dataUrl.slice(comma + 1) : "";
}

function loadHtmlImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("image-decode-failed"));
      image.src = String(reader.result || "");
    };
    reader.onerror = () => reject(reader.error || new Error("image-decode-failed"));
    reader.readAsDataURL(file);
  });
}

function canvasToBlob(canvas: HTMLCanvasElement, type: string, quality?: number): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error("toBlob-failed"))),
      type,
      quality,
    );
  });
}

function canvasHasTransparency(canvas: HTMLCanvasElement): boolean {
  const ctx = canvas.getContext("2d");
  if (!ctx) return false;
  const { width, height } = canvas;
  if (width === 0 || height === 0) return false;
  const samples = 100;
  const stepX = Math.max(1, Math.floor(width / samples));
  const stepY = Math.max(1, Math.floor(height / samples));
  for (let y = 0; y < height; y += stepY) {
    const row = ctx.getImageData(0, y, width, 1).data;
    for (let x = 0; x < width; x += stepX) {
      if (row[x * 4 + 3] < 255) return true;
    }
  }
  return false;
}

async function canvasSupportsType(source: HTMLCanvasElement, type: string): Promise<boolean> {
  const probe = document.createElement("canvas");
  probe.width = 1;
  probe.height = 1;
  const ctx = probe.getContext("2d");
  if (ctx) ctx.drawImage(source, 0, 0, 1, 1);
  try {
    const blob = await canvasToBlob(probe, type, 0.5);
    return blob.type === type;
  } catch {
    return false;
  }
}

async function compressImageToFit(file: File, targetBytes: number): Promise<File> {
  if (file.size <= targetBytes) return file;
  if (file.type === "image/gif") throw new Error("image-uncompressible");

  const image = await loadHtmlImage(file);
  const probeCanvas = document.createElement("canvas");
  probeCanvas.width = image.naturalWidth;
  probeCanvas.height = image.naturalHeight;
  const probeCtx = probeCanvas.getContext("2d");
  if (!probeCtx) throw new Error("canvas-unavailable");
  probeCtx.drawImage(image, 0, 0);

  const hasAlpha = canvasHasTransparency(probeCanvas);
  const candidates: Array<{ type: string; ext: string }> = hasAlpha
    ? [{ type: "image/png", ext: "png" }]
    : [
        ...((await canvasSupportsType(probeCanvas, "image/webp"))
          ? [{ type: "image/webp", ext: "webp" }]
          : []),
        { type: "image/jpeg", ext: "jpg" },
      ];

  let scale = 1;
  let quality = 0.85;
  let workingCanvas = probeCanvas;

  for (let index = 0; index < 20; index += 1) {
    let bestBlob: Blob | null = null;
    let bestCandidate: { type: string; ext: string } | null = null;
    for (const candidate of candidates) {
      const blob = await canvasToBlob(
        workingCanvas,
        candidate.type,
        hasAlpha ? undefined : quality,
      );
      if (blob.type !== candidate.type) continue;
      if (!bestBlob || blob.size < bestBlob.size) {
        bestBlob = blob;
        bestCandidate = candidate;
      }
    }
    if (!bestBlob || !bestCandidate) throw new Error("canvas-unavailable");
    if (bestBlob.size <= targetBytes) {
      const basename = file.name.replace(/\.[^.]+$/, "") || "image";
      return new File([bestBlob], `${basename}.${bestCandidate.ext}`, {
        type: bestCandidate.type,
      });
    }
    if (!hasAlpha && quality > 0.5) {
      quality -= 0.15;
      continue;
    }

    scale *= 0.8;
    if (image.naturalWidth * scale < 64 || image.naturalHeight * scale < 64) {
      throw new Error("image-uncompressible");
    }
    const scaled = document.createElement("canvas");
    scaled.width = Math.max(64, Math.floor(image.naturalWidth * scale));
    scaled.height = Math.max(64, Math.floor(image.naturalHeight * scale));
    const scaledCtx = scaled.getContext("2d");
    if (!scaledCtx) throw new Error("canvas-unavailable");
    scaledCtx.drawImage(image, 0, 0, scaled.width, scaled.height);
    workingCanvas = scaled;
    quality = 0.85;
  }

  throw new Error("image-uncompressible");
}

export async function processDroppedOrPastedFiles(params: {
  files: File[] | FileList;
  existingCount: number;
  sessionId: string;
  t: TranslateFn;
}): Promise<AttachmentProcessResult> {
  const { t } = params;
  const files = Array.from(params.files);
  const attachments: MessageAttachment[] = [];
  const errors: string[] = [];
  const remaining = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - params.existingCount);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const name = file.name || "attachment";
    const mime = file.type || "";
    if (index >= remaining) {
      errors.push(t("attachments.overLimit", { name, max: MAX_ATTACHMENTS_PER_MESSAGE }));
      continue;
    }

    if (isImageMime(mime)) {
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(t("attachments.imageTooLarge", { name, mb: (MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0) }));
        continue;
      }
      try {
        const image = await compressImageToFit(file, MAX_IMAGE_TARGET_BYTES);
        const compressed = image !== file;
        attachments.push({
          id: newAttachmentId(),
          kind: "image",
          name: image.name || name,
          mime: image.type || mime,
          size: image.size,
          dataUrl: await readAsDataUrl(image),
          originalSize: compressed ? file.size : undefined,
          createdAt: Date.now(),
        });
      } catch (error) {
        const detail = error instanceof Error ? error.message : String(error);
        const message =
          detail === "image-uncompressible"
            ? t("attachments.imageUncompressible", { mb: (MAX_IMAGE_TARGET_BYTES / 1024 / 1024).toFixed(0) })
            : t("attachments.imageReadFailed", { detail });
        errors.push(t("attachments.itemError", { name, message }));
      }
      continue;
    }

    if (isTextLikeFile(mime, name)) {
      if (file.size > MAX_TEXT_BYTES) {
        errors.push(t("attachments.textTooLarge", { name, kb: (MAX_TEXT_BYTES / 1024).toFixed(0) }));
        continue;
      }
      try {
        attachments.push({
          id: newAttachmentId(),
          kind: "text-file",
          name,
          mime: mime || "text/plain",
          size: file.size,
          text: await readAsText(file),
          createdAt: Date.now(),
        });
      } catch (error) {
        errors.push(
          t("attachments.textReadFailed", {
            name,
            detail: error instanceof Error ? error.message : String(error),
          }),
        );
      }
      continue;
    }

    try {
      const staged = await stageAttachmentFile({
        sessionId: params.sessionId,
        filename: name,
        base64Bytes: await readAsBase64(file),
      });
      attachments.push({
        id: newAttachmentId(),
        kind: "path-ref",
        name: staged.name || name,
        mime: mime || "application/octet-stream",
        size: file.size,
        path: staged.path,
        createdAt: Date.now(),
      });
    } catch (error) {
      errors.push(
        t("attachments.stageFailed", {
          name,
          detail: error instanceof Error ? error.message : String(error),
        }),
      );
    }
  }

  return { attachments, errors };
}

export function filesFromClipboard(event: ClipboardEvent | ReactClipboardEvent): {
  files: File[];
  hasText: boolean;
} {
  const files: File[] = [];
  let hasText = false;
  const items = event.clipboardData?.items;
  if (!items) return { files, hasText };
  for (let index = 0; index < items.length; index += 1) {
    const item = items[index];
    if (item.kind === "file") {
      const file = item.getAsFile();
      if (file) files.push(file);
    } else if (item.kind === "string" && item.type === "text/plain") {
      hasText = true;
    }
  }
  return { files, hasText };
}
