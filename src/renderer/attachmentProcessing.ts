import {
  isImageMime,
  isTextLikeFile,
  MAX_ATTACHMENTS_PER_MESSAGE,
  MAX_IMAGE_BYTES,
  MAX_TEXT_BYTES,
} from "../core/attachments";
import type { ClipboardEvent as ReactClipboardEvent } from "react";
import type { MessageAttachment } from "../core/types";
import { stageAttachmentFile } from "../runtime/hermes-runtime";

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

export async function processDroppedOrPastedFiles(params: {
  files: File[] | FileList;
  existingCount: number;
  sessionId: string;
}): Promise<AttachmentProcessResult> {
  const files = Array.from(params.files);
  const attachments: MessageAttachment[] = [];
  const errors: string[] = [];
  const remaining = Math.max(0, MAX_ATTACHMENTS_PER_MESSAGE - params.existingCount);

  for (let index = 0; index < files.length; index += 1) {
    const file = files[index];
    const name = file.name || "attachment";
    const mime = file.type || "";
    if (index >= remaining) {
      errors.push(`${name}: 超过每条消息 ${MAX_ATTACHMENTS_PER_MESSAGE} 个附件的限制。`);
      continue;
    }

    if (isImageMime(mime)) {
      if (file.size > MAX_IMAGE_BYTES) {
        errors.push(`${name}: 图片超过 ${(MAX_IMAGE_BYTES / 1024 / 1024).toFixed(0)} MB。`);
        continue;
      }
      try {
        attachments.push({
          id: newAttachmentId(),
          kind: "image",
          name,
          mime,
          size: file.size,
          dataUrl: await readAsDataUrl(file),
          createdAt: Date.now(),
        });
      } catch (error) {
        errors.push(`${name}: 图片读取失败：${error instanceof Error ? error.message : String(error)}`);
      }
      continue;
    }

    if (isTextLikeFile(mime, name)) {
      if (file.size > MAX_TEXT_BYTES) {
        errors.push(`${name}: 文本文件超过 ${(MAX_TEXT_BYTES / 1024).toFixed(0)} KB。`);
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
        errors.push(`${name}: 文本读取失败：${error instanceof Error ? error.message : String(error)}`);
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
      errors.push(`${name}: 暂存失败：${error instanceof Error ? error.message : String(error)}`);
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
