import type { SessionModelOverride } from "../../core/types";
import {
  getHermesModelConfig,
  inspectHermesInstall,
  listHermesSkills,
  listHermesToolsets,
  readHermesMemoryDetails,
  readHermesPersona,
} from "../../runtime/hermes-runtime";

/**
 * Slash commands answered entirely on the desktop side, without dispatching a
 * turn to the Hermes Gateway. They mirror the upstream desktop "local command"
 * set: informational queries the client can satisfy from local config/state.
 *
 * `/new` and `/clear` are intercepted earlier (they mutate chat state, not
 * produce a reply); `/fast` and `/persona` stay as agent passthrough until the
 * Fast Mode and SOUL editing features land.
 */
const LOCAL_REPLY_COMMANDS = new Set([
  "/help",
  "/model",
  "/memory",
  "/persona",
  "/tools",
  "/skills",
  "/version",
  "/usage",
]);

export function slashCommandName(text: string): string {
  return text.trim().split(/\s+/)[0]?.toLowerCase() ?? "";
}

/** True when the text is a slash command the desktop answers locally. */
export function isLocalReplyCommand(text: string): boolean {
  if (!text.startsWith("/")) return false;
  return LOCAL_REPLY_COMMANDS.has(slashCommandName(text));
}

export interface LocalCommandContext {
  /** Active Hermes profile to scope config/memory/tool lookups. */
  profile?: string;
  /** Live token usage captured from the most recent run's usage event. */
  tokenUsage: { promptTokens: number; totalTokens: number } | null;
  /** Active per-session model override, or null when using the global default. */
  sessionModelOverride?: SessionModelOverride | null;
  /** Fallback known commands for `/help` (kept in sync with the slash menu). */
  commands: Array<{ name: string; description: string; category: string }>;
}

const CATEGORY_LABELS: Record<string, string> = {
  chat: "对话",
  agent: "Agent",
  tools: "工具",
  info: "信息",
};

function renderHelp(commands: LocalCommandContext["commands"]): string {
  const grouped = new Map<string, LocalCommandContext["commands"]>();
  for (const command of commands) {
    const list = grouped.get(command.category) ?? [];
    list.push(command);
    grouped.set(command.category, list);
  }
  let md = "**可用命令**\n";
  for (const category of ["chat", "agent", "tools", "info"]) {
    const list = grouped.get(category);
    if (!list || list.length === 0) continue;
    md += `\n**${CATEGORY_LABELS[category] ?? category}**\n`;
    for (const command of list) {
      md += `\`${command.name}\` — ${command.description}\n`;
    }
  }
  return md.trim();
}

async function renderModel(
  profile?: string,
  sessionOverride?: SessionModelOverride | null,
): Promise<string> {
  const config = await getHermesModelConfig(profile ? { profile } : {});
  // The session override (in-chat picker) takes priority over the global
  // config.yaml default at runtime, so surface it as the "current" model and
  // keep the global default visible as the fallback.
  const effective = sessionOverride ?? config;
  const lines = [
    `**当前模型：** \`${effective.model || "未设置"}\``,
    `**Provider：** ${effective.provider || "auto"}`,
  ];
  if (effective.baseUrl) lines.push(`**Base URL：** ${effective.baseUrl}`);
  if (effective.contextLength) {
    lines.push(`**上下文窗口：** ${effective.contextLength.toLocaleString()} tokens`);
  }
  if (sessionOverride?.model) {
    lines.push("", "_仅当前会话覆盖；其他会话不受影响。_");
    lines.push(
      `**全局默认：** \`${config.model || "未设置"}\`（${config.provider || "auto"}）`,
    );
  }
  return lines.join("\n");
}

async function renderMemory(profile?: string): Promise<string> {
  const details = await readHermesMemoryDetails(profile ? { profile } : {});
  const lines: string[] = ["**Agent Memory**\n"];
  const content = details.memory.content.trim();
  lines.push(content || "_暂无记忆条目。_");
  lines.push(
    `\n**统计：** ${details.stats.totalSessions} 个会话，${details.stats.totalMessages} 条消息` +
      ` · MEMORY.md ${details.memory.charCount}/${details.memory.charLimit} 字符`,
  );
  return lines.join("\n");
}

async function renderPersona(profile?: string): Promise<string> {
  const persona = await readHermesPersona(profile ? { profile } : {});
  const content = persona.content.trim();
  return content ? `**当前 Persona (SOUL.md)**\n\n${content}` : "_尚未配置 Persona。_";
}

async function renderTools(profile?: string): Promise<string> {
  const toolsets = await listHermesToolsets(profile ? { profile } : {});
  if (!toolsets.length) return "未找到任何工具集。";
  const rows = toolsets
    .map(
      (toolset) =>
        `- **${toolset.label}** — ${toolset.description} ${toolset.enabled ? "*(已启用)*" : "*(已禁用)*"}`,
    )
    .join("\n");
  return `**可用工具集**\n\n${rows}`;
}

async function renderSkills(profile?: string): Promise<string> {
  const skills = await listHermesSkills(profile ? { profile } : {});
  if (!skills.length) return "尚未安装任何技能。";
  const rows = skills
    .map(
      (skill) =>
        `- **${skill.name}** (${skill.category}) — ${skill.description || "无描述"}`,
    )
    .join("\n");
  return `**已安装技能**\n\n${rows}`;
}

async function renderVersion(): Promise<string> {
  const status = await inspectHermesInstall();
  const lines = [`**Hermes Agent：** ${status.version || "未知"}`];
  if (status.command) lines.push(`**CLI：** \`${status.command}\``);
  if (status.hermesHome) lines.push(`**Hermes Home：** ${status.hermesHome}`);
  if (status.activeProfile) lines.push(`**活动 Profile：** ${status.activeProfile}`);
  return lines.join("\n");
}

function renderUsage(tokenUsage: LocalCommandContext["tokenUsage"]): string {
  if (!tokenUsage || (tokenUsage.promptTokens === 0 && tokenUsage.totalTokens === 0)) {
    return "本次会话暂无用量数据，发送一条消息后再试。";
  }
  const completion = Math.max(tokenUsage.totalTokens - tokenUsage.promptTokens, 0);
  return [
    "**Token 用量**\n",
    `- **Prompt：** ${tokenUsage.promptTokens.toLocaleString()} tokens`,
    `- **Completion：** ${completion.toLocaleString()} tokens`,
    `- **合计：** ${tokenUsage.totalTokens.toLocaleString()} tokens`,
  ].join("\n");
}

/**
 * Executes a local slash command and returns the markdown reply to render as an
 * assistant message, or `null` if the command is not locally handled.
 */
export async function runLocalReplyCommand(
  text: string,
  ctx: LocalCommandContext,
): Promise<string | null> {
  const command = slashCommandName(text);
  switch (command) {
    case "/help":
      return renderHelp(ctx.commands);
    case "/model":
      return renderModel(ctx.profile, ctx.sessionModelOverride);
    case "/memory":
      return renderMemory(ctx.profile);
    case "/persona":
      return renderPersona(ctx.profile);
    case "/tools":
      return renderTools(ctx.profile);
    case "/skills":
      return renderSkills(ctx.profile);
    case "/version":
      return renderVersion();
    case "/usage":
      return renderUsage(ctx.tokenUsage);
    default:
      return null;
  }
}
