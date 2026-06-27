import { TAURI_UNAVAILABLE_MESSAGE } from "../runtime/hermes-runtime";

export function runtimeErrorMessage(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (
    message.includes("__TAURI") ||
    message.includes("ipc") ||
    message.includes("Tauri") ||
    message.includes("not a function")
  ) {
    return TAURI_UNAVAILABLE_MESSAGE;
  }
  if (message === "undefined" || message === "[object Object]") {
    return "无法调用 Tauri Hermes Gateway 探测命令。请确认当前运行的是 Tauri 桌面应用，而不是浏览器预览页。";
  }
  return message;
}

export function isConnectionRefused(error: unknown): boolean {
  const message = runtimeErrorMessage(error);
  return message.includes("Connection refused") || message.includes("连接 127.0.0.1");
}

