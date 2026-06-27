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
  RegistryItem,
} from "../runtime/hermes-runtime";

// Unified Discover / marketplace entry. It is a thin presentation layer over the
// project's real backends: bundled-skill install (`hermes skills install`), MCP
// catalog install (`hermes mcp install`), and the community registry (GitHub
// `index.json`) for agents (installed as profiles + SOUL.md) and workflows
// (definition folders imported into the active profile).

export type DiscoverKind = "skills" | "mcps" | "agents" | "workflows";

interface DiscoverItem {
  id: string;
  name: string;
  description: string;
  source: string;
  tags: string[];
  installed: boolean;
  // Whether install is actionable. Installed entries are not.
  installable: boolean;
  detailPath?: string;
  registry?: RegistryItem;
}

export interface DiscoverViewProps {
  installedSkills: InstalledSkillInfo[];
  bundledSkills: BundledSkillInfo[];
  mcpCatalog: McpCatalogEntry[];
  mcpServerNames: string[];
  mcpCatalogError?: string;
  mcpCatalogDiagnostics?: string[];
  registryAgents: RegistryItem[];
  registryWorkflows: RegistryItem[];
  registryError?: string;
  registryLoading?: boolean;
  installedProfileNames: string[];
  installedWorkflowIds: string[];
  registryBusyId: string | null;
  skillBusy: boolean;
  mcpCatalogBusyName: string | null;
  busy?: boolean;
  onRefresh: () => void;
  onInstallBundledSkill: (skill: BundledSkillInfo) => void;
  onInstallMcpEntry: (entry: McpCatalogEntry) => void;
  onInstallAgent: (item: RegistryItem) => void;
  onInstallWorkflow: (item: RegistryItem) => void;
  onReadSkillContent: (path: string) => Promise<string>;
  onFetchRegistryDetail: (kind: DiscoverKind, item: RegistryItem) => Promise<string>;
}

const KINDS: { key: DiscoverKind; icon: LucideIcon }[] = [
  { key: "skills", icon: WandSparkles },
  { key: "mcps", icon: Plug },
  { key: "agents", icon: Bot },
  { key: "workflows", icon: Workflow },
];

export function DiscoverView({
  installedSkills,
  bundledSkills,
  mcpCatalog,
  mcpServerNames,
  mcpCatalogError,
  mcpCatalogDiagnostics,
  registryAgents,
  registryWorkflows,
  registryError,
  registryLoading,
  installedProfileNames,
  installedWorkflowIds,
  registryBusyId,
  skillBusy,
  mcpCatalogBusyName,
  busy,
  onRefresh,
  onInstallBundledSkill,
  onInstallMcpEntry,
  onInstallAgent,
  onInstallWorkflow,
  onReadSkillContent,
  onFetchRegistryDetail,
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

  const agentItems = useMemo<DiscoverItem[]>(() => {
    const profileSet = new Set(installedProfileNames.map((name) => name.toLowerCase()));
    return registryAgents.map((entry) => {
      const installed = profileSet.has(entry.id.toLowerCase());
      return {
        id: `agent:${entry.id}`,
        name: entry.name,
        description: entry.description,
        source: entry.author || "Hermes Registry",
        tags: entry.tags ?? [],
        installed,
        installable: !installed,
        registry: entry,
      };
    });
  }, [registryAgents, installedProfileNames]);

  const workflowItems = useMemo<DiscoverItem[]>(() => {
    const workflowSet = new Set(installedWorkflowIds.map((id) => id.toLowerCase()));
    return registryWorkflows.map((entry) => {
      const installed = workflowSet.has(entry.id.toLowerCase());
      return {
        id: `workflow:${entry.id}`,
        name: entry.name,
        description: entry.description,
        source: entry.author || "Hermes Registry",
        tags: entry.tags ?? [],
        installed,
        installable: !installed,
        registry: entry,
      };
    });
  }, [registryWorkflows, installedWorkflowIds]);

  const counts = useMemo(
    () => ({
      skills: skillItems.length,
      mcps: mcpItems.length,
      agents: agentItems.length,
      workflows: workflowItems.length,
    }),
    [skillItems, mcpItems, agentItems, workflowItems],
  );

  const activeList =
    tab === "skills"
      ? skillItems
      : tab === "mcps"
        ? mcpItems
        : tab === "agents"
          ? agentItems
          : workflowItems;
  const isRegistryTab = tab === "agents" || tab === "workflows";

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
    const fetcher = item.detailPath
      ? () => onReadSkillContent(item.detailPath as string)
      : item.registry && isRegistryTab
        ? () => onFetchRegistryDetail(tab, item.registry as RegistryItem)
        : null;
    if (!fetcher) return;
    setDetailLoading(true);
    try {
      setDetailContent(await fetcher());
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
      return;
    }
    if (item.registry) {
      if (tab === "agents") onInstallAgent(item.registry);
      else if (tab === "workflows") onInstallWorkflow(item.registry);
    }
  };

  const isBusy = (item: DiscoverItem) => {
    if (tab === "skills") return skillBusy;
    if (tab === "mcps") return mcpCatalogBusyName === item.name;
    return registryBusyId === item.id;
  };

  const activeKind = KINDS.find((kind) => kind.key === tab) ?? KINDS[0];
  const ActiveIcon = activeKind.icon;

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

        {tab === "mcps" && mcpCatalogError && (
          <p className="warning-text">{t("discover.catalogError", { error: mcpCatalogError })}</p>
        )}
        {tab === "mcps" &&
          (mcpCatalogDiagnostics ?? []).map((item) => (
            <p className="empty-note" key={item}>
              {item}
            </p>
          ))}

        {isRegistryTab && registryError && (
          <p className="warning-text">{t("discover.registryError", { error: registryError })}</p>
        )}
        {tab === "workflows" && workflowItems.length > 0 && (
          <p className="empty-note">{t("discover.workflowNote")}</p>
        )}

        {filtered.length > 0 ? (
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
        ) : isRegistryTab && registryLoading ? (
          <div className="discover-placeholder">
            <ActiveIcon size={28} />
            <p className="empty-note">{t("common.loading")}</p>
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
