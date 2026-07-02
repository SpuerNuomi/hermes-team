import type { WorkMode } from "./types";

export { type WorkMode } from "./types";

export const WORK_MODES: WorkMode[] = ["ask", "plan", "craft"];

export function normalizeWorkMode(value: unknown): WorkMode {
  if (value === "ask" || value === "plan" || value === "craft") return value;
  return "ask";
}

function normalizeToolName(name: string): string {
  return name.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

const READ_TOOL_HINTS = [
  "read_file",
  "search_files",
  "web_fetch",
  "web_search",
  "fetch",
  "grep",
  "list_dir",
  "skills_list",
  "skill_view",
  "read",
  "search",
  "list_skills",
  "memory_read",
  "view_file",
  "browse",
];

const WRITE_TOOL_HINTS = [
  "write_file",
  "edit_file",
  "apply_patch",
  "patch",
  "create_file",
  "delete_file",
  "remove_file",
  "move_file",
  "rename",
  "write",
  "edit",
  "delete",
  "remove",
];

const EXEC_TOOL_HINTS = [
  "terminal",
  "run_command",
  "execute",
  "bash",
  "shell",
  "code_execution",
  "browser",
  "delegation",
  "cronjob",
];

export function isWriteOrExecTool(toolName: string): boolean {
  const name = normalizeToolName(toolName);
  return (
    WRITE_TOOL_HINTS.some((hint) => name.includes(hint)) ||
    EXEC_TOOL_HINTS.some((hint) => name.includes(hint))
  );
}

export function isReadTool(toolName: string): boolean {
  const name = normalizeToolName(toolName);
  if (isWriteOrExecTool(name)) return false;
  return READ_TOOL_HINTS.some((hint) => name.includes(hint)) || name.endsWith("_list") || name.endsWith("_view");
}

export function isToolAllowedForWorkMode(workMode: WorkMode, toolName: string): boolean {
  if (workMode === "craft") return true;
  return !isWriteOrExecTool(toolName);
}

export function isDestructiveToolCall(toolName: string, preview = ""): boolean {
  const name = normalizeToolName(toolName);
  const text = `${name} ${preview}`.toLowerCase();
  if (name.includes("delete") || name.includes("remove") || name.includes("unlink")) return true;
  if (/\brm\b|\bunlink\b|\bdelete\b|\bremove\b|删掉|删除/.test(text)) return true;
  if (name.includes("write") && /\bdelete\b|\bremove\b|删掉|删除/.test(text)) return true;
  return false;
}

export function looksDestructiveInstruction(text: string): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return (
    /\b(rm|unlink|delete|remove)\b/.test(trimmed) ||
    /删掉|删除|移除文件/.test(trimmed)
  );
}

export function workModeSystemPromptAddendum(workMode: WorkMode): string {
  switch (workMode) {
    case "ask":
      return [
        "当前工作模式：问一问 (Ask)。",
        "你只能使用只读工具（读取/搜索/联网阅读），不得写入文件、不得执行终端或破坏性命令。",
        "如果用户要求改文件或执行命令，请说明需要在「做一做 Craft」模式下进行。",
      ].join("\n");
    case "plan":
      return [
        "当前工作模式：想一想 (Plan)。",
        "你只能分析和规划，输出步骤、方案、diff 预览，但不得实际写入文件或执行命令。",
        "如果用户要求直接动手修改，请说明需要在「做一做 Craft」模式下执行。",
      ].join("\n");
    case "craft":
      return [
        "当前工作模式：做一做 (Craft)。",
        "你可以使用已绑定的全部工具执行改动；破坏性操作（删除文件、迁移、force push 等）会先经过用户确认。",
      ].join("\n");
  }
}
