import type { SessionModelOverride } from "../../core/types";
import type { TranslationVars } from "../../i18n/types";
import {
  getHermesModelConfig,
  inspectHermesInstall,
  listHermesSkills,
  listHermesToolsets,
  readHermesMemoryDetails,
  readHermesPersona,
} from "../../runtime/hermes-runtime";

type TranslateFn = (key: string, vars?: TranslationVars) => string;

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
  /** Translator for localized command output. */
  t: TranslateFn;
}

function categoryLabel(category: string, t: TranslateFn): string {
  switch (category) {
    case "chat":
      return t("localCommands.categoryChat");
    case "agent":
      return t("localCommands.categoryAgent");
    case "tools":
      return t("localCommands.categoryTools");
    case "info":
      return t("localCommands.categoryInfo");
    default:
      return category;
  }
}

function renderHelp(commands: LocalCommandContext["commands"], t: TranslateFn): string {
  const grouped = new Map<string, LocalCommandContext["commands"]>();
  for (const command of commands) {
    const list = grouped.get(command.category) ?? [];
    list.push(command);
    grouped.set(command.category, list);
  }
  let md = `**${t("localCommands.availableCommands")}**\n`;
  for (const category of ["chat", "agent", "tools", "info"]) {
    const list = grouped.get(category);
    if (!list || list.length === 0) continue;
    md += `\n**${categoryLabel(category, t)}**\n`;
    for (const command of list) {
      md += `\`${command.name}\` — ${command.description}\n`;
    }
  }
  return md.trim();
}

async function renderModel(
  t: TranslateFn,
  profile?: string,
  sessionOverride?: SessionModelOverride | null,
): Promise<string> {
  const config = await getHermesModelConfig(profile ? { profile } : {});
  // The session override (in-chat picker) takes priority over the global
  // config.yaml default at runtime, so surface it as the "current" model and
  // keep the global default visible as the fallback.
  const effective = sessionOverride ?? config;
  const notSet = t("localCommands.notSet");
  const lines = [
    `**${t("localCommands.currentModel")}** \`${effective.model || notSet}\``,
    `**${t("localCommands.provider")}** ${effective.provider || "auto"}`,
  ];
  if (effective.baseUrl) lines.push(`**${t("localCommands.baseUrl")}** ${effective.baseUrl}`);
  if (effective.contextLength) {
    lines.push(`**${t("localCommands.contextWindow")}** ${effective.contextLength.toLocaleString()} tokens`);
  }
  if (sessionOverride?.model) {
    lines.push("", `_${t("localCommands.sessionOverrideNote")}_`);
    lines.push(
      `**${t("localCommands.globalDefault")}** \`${config.model || notSet}\`（${config.provider || "auto"}）`,
    );
  }
  return lines.join("\n");
}

async function renderMemory(t: TranslateFn, profile?: string): Promise<string> {
  const details = await readHermesMemoryDetails(profile ? { profile } : {});
  const lines: string[] = [`**${t("localCommands.agentMemory")}**\n`];
  const content = details.memory.content.trim();
  lines.push(content || `_${t("localCommands.noMemoryEntries")}_`);
  lines.push(
    `\n**${t("localCommands.memoryStats", {
      sessions: details.stats.totalSessions,
      messages: details.stats.totalMessages,
      chars: details.memory.charCount,
      limit: details.memory.charLimit,
    })}**`,
  );
  return lines.join("\n");
}

async function renderPersona(t: TranslateFn, profile?: string): Promise<string> {
  const persona = await readHermesPersona(profile ? { profile } : {});
  const content = persona.content.trim();
  return content
    ? `**${t("localCommands.currentPersona")}**\n\n${content}`
    : `_${t("localCommands.noPersona")}_`;
}

async function renderTools(t: TranslateFn, profile?: string): Promise<string> {
  const toolsets = await listHermesToolsets(profile ? { profile } : {});
  if (!toolsets.length) return t("localCommands.noToolsets");
  const enabled = t("localCommands.toolsetEnabled");
  const disabled = t("localCommands.toolsetDisabled");
  const rows = toolsets
    .map(
      (toolset) =>
        `- **${toolset.label}** — ${toolset.description} ${toolset.enabled ? `*(${enabled})*` : `*(${disabled})*`}`,
    )
    .join("\n");
  return `**${t("localCommands.availableToolsets")}**\n\n${rows}`;
}

async function renderSkills(t: TranslateFn, profile?: string): Promise<string> {
  const skills = await listHermesSkills(profile ? { profile } : {});
  if (!skills.length) return t("localCommands.noSkills");
  const noDesc = t("localCommands.noSkillDesc");
  const rows = skills
    .map(
      (skill) =>
        `- **${skill.name}** (${skill.category}) — ${skill.description || noDesc}`,
    )
    .join("\n");
  return `**${t("localCommands.installedSkills")}**\n\n${rows}`;
}

async function renderVersion(t: TranslateFn): Promise<string> {
  const status = await inspectHermesInstall();
  const lines = [`**${t("localCommands.hermesAgent")}** ${status.version || t("localCommands.unknown")}`];
  if (status.command) lines.push(`**${t("localCommands.cli")}** \`${status.command}\``);
  if (status.hermesHome) lines.push(`**${t("localCommands.hermesHome")}** ${status.hermesHome}`);
  if (status.activeProfile) lines.push(`**${t("localCommands.activeProfile")}** ${status.activeProfile}`);
  return lines.join("\n");
}

function renderUsage(tokenUsage: LocalCommandContext["tokenUsage"], t: TranslateFn): string {
  if (!tokenUsage || (tokenUsage.promptTokens === 0 && tokenUsage.totalTokens === 0)) {
    return t("localCommands.noUsage");
  }
  const completion = Math.max(tokenUsage.totalTokens - tokenUsage.promptTokens, 0);
  return [
    `**${t("localCommands.tokenUsage")}**\n`,
    `- **${t("localCommands.prompt")}** ${tokenUsage.promptTokens.toLocaleString()} tokens`,
    `- **${t("localCommands.completion")}** ${completion.toLocaleString()} tokens`,
    `- **${t("localCommands.total")}** ${tokenUsage.totalTokens.toLocaleString()} tokens`,
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
  const { t } = ctx;
  switch (command) {
    case "/help":
      return renderHelp(ctx.commands, t);
    case "/model":
      return renderModel(t, ctx.profile, ctx.sessionModelOverride);
    case "/memory":
      return renderMemory(t, ctx.profile);
    case "/persona":
      return renderPersona(t, ctx.profile);
    case "/tools":
      return renderTools(t, ctx.profile);
    case "/skills":
      return renderSkills(t, ctx.profile);
    case "/version":
      return renderVersion(t);
    case "/usage":
      return renderUsage(ctx.tokenUsage, t);
    default:
      return null;
  }
}
