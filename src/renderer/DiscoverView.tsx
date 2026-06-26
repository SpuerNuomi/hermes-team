import { useEffect, useMemo, useState } from "react";
import {
  Bot,
  Check,
  Download,
  ExternalLink,
  Plug,
  RefreshCw,
  Search,
  WandSparkles,
  Workflow,
  X,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { useI18n } from "../i18n";
import { AgentMarkdown } from "./AgentMarkdown";
import type {
  BundledSkillInfo,
  InstalledSkillInfo,
  McpCatalogEntry,
} from "../runtime/hermes-runtime";

// Unified Discover / marketplace entry. It is a thin presentation layer over the
// project's existing real backends: bundled-skill install (`hermes skills install`)
// and MCP catalog install (`hermes mcp install`). Agents/Workflows are surfaced as
// honest placeholders because this project has no registry backend for them yet.

export type DiscoverKind = "skills" | "mcps" | "agents" | "workflows";

interface DiscoverItem {
  id: string;
  name: string;
  description: string;
  source: string;
  tags: string[];
  installed: boolean;
  // Whether install is actionable. Installed entries and unsupported kinds are not.
  installable: boolean;
  detailPath?: string;
}

export interface DiscoverViewProps {
  installedSkills: InstalledSkillInfo[];
  bundledSkills: BundledSkillInfo[];
  mcpCatalog: McpCatalogEntry[];
  mcpServerNames: string[];
  mcpCatalogError?: string;
  mcpCatalogDiagnostics?: string[];
  skillBusy: boolean;
  mcpCatalogBusyName: string | null;
  busy?: boolean;
  onRefresh: () => void;
  onInstallBundledSkill: (skill: BundledSkillInfo) => void;
  onInstallMcpEntry: (entry: McpCatalogEntry) => void;
  onReadSkillContent: (path: string) => Promise<string>;
}

const KINDS: { key: DiscoverKind; icon: LucideIcon; supported: boolean }[] = [
  { key: "skills", icon: WandSparkles, supported: true },
  { key: "mcps", icon: Plug, supported: true },
  { key: "agents", icon: Bot, supported: false },
  { key: "workflows", icon: Workflow, supported: false },
];

export function DiscoverView({
  installedSkills,
  bundledSkills,
  mcpCatalog,
  mcpServerNames,
  mcpCatalogError,
  mcpCatalogDiagnostics,
  skillBusy,
  mcpCatalogBusyName,
  busy,
  onRefresh,
  onInstallBundledSkill,
  onInstallMcpEntry,
  onReadSkillContent,
}: DiscoverViewProps) {
  const { t } = useI18n();
  const [tab, setTab] = useState<DiscoverKind>("skills");
  const [query, setQuery] = useState("");
  const [detail, setDetail] = useState<DiscoverItem | null>(null);
  const [detailContent, setDetailContent] = useState("");
  const [detailLoading, setDetailLoading] = useState(false);

  // Skills: fold bundled + installed catalog into one list, deduped by dirName.
  const skillItems = useMemo<DiscoverItem[]>(() => {
    const installedNames = new Set(installedSkills.map((skill) => skill.dirName));
    const seen = new Set<string>();
    const items: DiscoverItem[] = [];
    for (const skill of bundledSkills) {
      seen.add(skill.dirName);
      const installed = skill.installed || installedNames.has(skill.dirName);
      items.push({
        id: `skill:${skill.category}/${skill.dirName}`,
        name: skill.name,
        description: skill.description || `${skill.category}/${skill.dirName}`,
        source: skill.source || "bundled",
        tags: [skill.category].filter(Boolean),
        installed,
        installable: !installed,
        detailPath: skill.path,
      });
    }
    // Installed-only skills that are not part of the bundled catalog.
    for (const skill of installedSkills) {
      if (seen.has(skill.dirName)) continue;
      items.push({
        id: `skill:${skill.category}/${skill.dirName}`,
        name: skill.name,
        description: skill.description || `${skill.category}/${skill.dirName}`,
        source: skill.source || "installed",
        tags: [skill.category].filter(Boolean),
        installed: true,
        installable: false,
        detailPath: skill.path,
      });
    }
    return items;
  }, [bundledSkills, installedSkills]);

  const mcpItems = useMemo<DiscoverItem[]>(() => {
    const serverSet = new Set(mcpServerNames.map((name) => name.toLowerCase()));
    return mcpCatalog.map((entry) => {
      const installed = entry.installed || serverSet.has(entry.name.toLowerCase());
      return {
        id: `mcp:${entry.name}`,
        name: entry.name,
        description: entry.description || entry.source || "Hermes MCP catalog entry",
        source: entry.source || entry.transport,
        tags: [entry.transport, ...entry.requiredEnv.map((env) => `env:${env}`)].filter(Boolean),
        installed,
        installable: entry.needsInstall && !installed,
      };
    });
  }, [mcpCatalog, mcpServerNames]);

  const counts = useMemo(
    () => ({
      skills: skillItems.length,
      mcps: mcpItems.length,
      agents: 0,
      workflows: 0,
    }),
    [skillItems, mcpItems],
  );

  const activeList = tab === "skills" ? skillItems : tab === "mcps" ? mcpItems : [];

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return activeList;
    return activeList.filter((item) =>
      [item.name, item.description, item.source, ...item.tags].some(
        (field) => field && field.toLowerCase().includes(q),
      ),
    );
  }, [activeList, query]);

  // Close detail modal on Escape.
  useEffect(() => {
    if (!detail) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") setDetail(null);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [detail]);

  const openDetail = async (item: DiscoverItem) => {
    setDetail(item);
    setDetailContent("");
    if (!item.detailPath) return;
    setDetailLoading(true);
    try {
      setDetailContent(await onReadSkillContent(item.detailPath));
    } catch {
      setDetailContent("");
    } finally {
      setDetailLoading(false);
    }
  };

  const installItem = (item: DiscoverItem) => {
    if (tab === "skills") {
      const target = bundledSkills.find(
        (skill) => `skill:${skill.category}/${skill.dirName}` === item.id,
      );
      if (target) onInstallBundledSkill(target);
      return;
    }
    if (tab === "mcps") {
      const target = mcpCatalog.find((entry) => `mcp:${entry.name}` === item.id);
      if (target) onInstallMcpEntry(target);
    }
  };

  const isBusy = (item: DiscoverItem) =>
    tab === "skills" ? skillBusy : mcpCatalogBusyName === item.name;

  const activeKind = KINDS.find((kind) => kind.key === tab) ?? KINDS[0];
  const ActiveIcon = activeKind.icon;
  const supported = activeKind.supported;

  return (
    <>
      <header className="workspace-header">
        <div>
          <p className="panel-label">{t("discover.panelLabel")}</p>
          <h1>{t("discover.title")}</h1>
          <p>{t("discover.subtitle")}</p>
        </div>
        <button className="refresh-runtime" disabled={busy} type="button" onClick={onRefresh}>
          <RefreshCw size={14} />
          <span>{t("discover.refresh")}</span>
        </button>
      </header>

      <div className="discover-content">
        <nav className="discover-tabs" aria-label={t("discover.tabsLabel")}>
          {KINDS.map(({ key, icon: Icon }) => (
            <button
              key={key}
              type="button"
              className={tab === key ? "selected" : ""}
              onClick={() => {
                setTab(key);
                setQuery("");
              }}
            >
              <Icon size={15} />
              <span>{t(`discover.tabs.${key}`)}</span>
              <span className="discover-tab-count">{counts[key]}</span>
            </button>
          ))}
        </nav>

        {supported && (
          <div className="discover-toolbar">
            <div className="session-search">
              <Search size={14} />
              <input
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder={t("discover.searchPlaceholder", {
                  kind: t(`discover.tabs.${tab}`),
                })}
              />
              {query && (
                <button type="button" onClick={() => setQuery("")} aria-label={t("discover.clear")}>
                  <X size={13} />
                </button>
              )}
            </div>
          </div>
        )}

        {tab === "mcps" && mcpCatalogError && (
          <p className="warning-text">{t("discover.catalogError", { error: mcpCatalogError })}</p>
        )}
        {tab === "mcps" &&
          (mcpCatalogDiagnostics ?? []).map((item) => (
            <p className="empty-note" key={item}>
              {item}
            </p>
          ))}

        {!supported ? (
          <div className="discover-placeholder">
            <ActiveIcon size={28} />
            <strong>{t(`discover.placeholder.${tab}.title`)}</strong>
            <p>{t(`discover.placeholder.${tab}.text`)}</p>
            <span className="discover-soon-pill">{t("discover.comingSoon")}</span>
          </div>
        ) : filtered.length > 0 ? (
          <div className="discover-grid">
            {filtered.map((item) => (
              <article
                key={item.id}
                className={`discover-card ${item.installed ? "installed" : ""}`}
                role="button"
                tabIndex={0}
                onClick={() => void openDetail(item)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" || event.key === " ") {
                    event.preventDefault();
                    void openDetail(item);
                  }
                }}
              >
                <div className="discover-card-head">
                  <span className="discover-card-iconwrap">
                    <ActiveIcon size={16} />
                  </span>
                  <strong>{item.name}</strong>
                </div>
                <p className="discover-card-desc">{item.description}</p>
                {item.tags.length > 0 && (
                  <div className="discover-card-tags">
                    {item.tags.slice(0, 4).map((tag) => (
                      <span className="discover-tag" key={tag}>
                        {tag}
                      </span>
                    ))}
                  </div>
                )}
                <div className="discover-card-footer">
                  <small>{item.source}</small>
                  {item.installed ? (
                    <span className="discover-installed">
                      <Check size={14} />
                      {t("discover.installed")}
                    </span>
                  ) : (
                    <button
                      type="button"
                      className="discover-install-btn"
                      disabled={!item.installable || isBusy(item)}
                      onClick={(event) => {
                        event.stopPropagation();
                        installItem(item);
                      }}
                    >
                      <Download size={14} />
                      {isBusy(item) ? t("discover.installing") : t("discover.install")}
                    </button>
                  )}
                </div>
              </article>
            ))}
          </div>
        ) : (
          <div className="discover-placeholder">
            <ActiveIcon size={28} />
            <strong>{t("discover.emptyTitle")}</strong>
            <p>{t("discover.emptyText", { kind: t(`discover.tabs.${tab}`) })}</p>
          </div>
        )}
      </div>

      {detail && (
        <div className="discover-modal-overlay" onClick={() => setDetail(null)}>
          <div
            className="discover-modal"
            role="dialog"
            aria-modal="true"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="discover-modal-header">
              <div>
                <strong>{detail.name}</strong>
                {detail.tags.length > 0 && (
                  <span className="discover-card-badge">{detail.tags[0]}</span>
                )}
              </div>
              <div className="discover-modal-actions">
                {detail.installed ? (
                  <span className="discover-installed">
                    <Check size={14} />
                    {t("discover.installed")}
                  </span>
                ) : (
                  <button
                    type="button"
                    className="discover-install-btn"
                    disabled={!detail.installable || isBusy(detail)}
                    onClick={() => installItem(detail)}
                  >
                    <Download size={14} />
                    {isBusy(detail) ? t("discover.installing") : t("discover.install")}
                  </button>
                )}
                <button
                  type="button"
                  className="discover-modal-close"
                  onClick={() => setDetail(null)}
                  aria-label={t("discover.close")}
                >
                  <X size={18} />
                </button>
              </div>
            </div>
            <div className="discover-modal-meta">
              <span>
                <ExternalLink size={13} /> {detail.source}
              </span>
            </div>
            <div className="discover-modal-content">
              <p className="discover-spec-lead">{detail.description}</p>
              {detailLoading ? (
                <p className="empty-note">{t("common.loading")}</p>
              ) : (
                detailContent && (
                  <div className="discover-modal-doc">
                    <AgentMarkdown>{detailContent}</AgentMarkdown>
                  </div>
                )
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default DiscoverView;
