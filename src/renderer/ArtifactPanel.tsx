import { Archive, ExternalLink, FileCode2, FolderOpen, ScrollText } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { formatArtifactChangeLabel } from "../core/artifacts";
import type { Artifact } from "../core/types";
import { useTranslation } from "../i18n";
import { artifactFileDiff, openFileInEditor, readFile } from "../runtime/hermes-runtime";

function fileName(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

function ArtifactDiffView({ code }: { code: string }) {
  const lines = code.split("\n");
  return (
    <div className="chat-diff-content artifact-diff-content">
      {lines.map((line, index) => {
        let className = "chat-diff-line";
        if (line.startsWith("+")) className += " chat-diff-add";
        else if (line.startsWith("-")) className += " chat-diff-remove";
        else if (line.startsWith("@@")) className += " chat-diff-hunk";
        return (
          <div className={className} key={`${index}-${line}`}>
            {line || "\u00A0"}
          </div>
        );
      })}
    </div>
  );
}

function kindIcon(kind: Artifact["kind"]) {
  if (kind === "doc" || kind === "report") return ScrollText;
  return FileCode2;
}

export const ArtifactPanel = memo(function ArtifactPanel({
  artifacts,
  workDir,
  onArchive,
}: {
  artifacts: Artifact[];
  workDir: string | null;
  onArchive: (artifactId: string) => void;
}) {
  const t = useTranslation();
  const activeArtifacts = useMemo(
    () => [...artifacts.filter((item) => item.status === "active")].sort((a, b) => b.updatedAt - a.updatedAt),
    [artifacts],
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = activeArtifacts.find((item) => item.id === selectedId) ?? activeArtifacts[0] ?? null;
  const [previewMode, setPreviewMode] = useState<"content" | "diff">("content");
  const [previewText, setPreviewText] = useState("");
  const [diffText, setDiffText] = useState("");
  const [loadingPreview, setLoadingPreview] = useState(false);
  const [previewError, setPreviewError] = useState("");

  useEffect(() => {
    if (!selected) {
      setSelectedId(null);
      return;
    }
    if (!selectedId) setSelectedId(selected.id);
  }, [selected, selectedId]);

  useEffect(() => {
    if (!selected) {
      setPreviewText("");
      setDiffText("");
      setPreviewError("");
      return;
    }
    let cancelled = false;
    setLoadingPreview(true);
    setPreviewError("");
    void Promise.all([
      readFile(selected.path, 102_400),
      artifactFileDiff(selected.path, workDir).catch(() => ""),
    ])
      .then(([fileResult, diffResult]) => {
        if (cancelled) return;
        setPreviewText(fileResult.content);
        setDiffText(diffResult);
      })
      .catch((error) => {
        if (!cancelled) {
          setPreviewError(error instanceof Error ? error.message : String(error));
          setPreviewText("");
          setDiffText("");
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingPreview(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selected, workDir]);

  return (
    <aside className="artifact-panel" aria-label={t("artifactPanel.title")}>
      <div className="artifact-panel-head">
        <div>
          <h2>{t("artifactPanel.title")}</h2>
          <p>{t("artifactPanel.subtitle")}</p>
        </div>
        <span className="artifact-panel-count">{activeArtifacts.length}</span>
      </div>

      {activeArtifacts.length === 0 ? (
        <div className="artifact-panel-empty">
          <FolderOpen size={18} aria-hidden="true" />
          <strong>{t("artifactPanel.emptyTitle")}</strong>
          <span>{t("artifactPanel.emptyBody")}</span>
        </div>
      ) : (
        <>
          <div className="artifact-card-list">
            {activeArtifacts.map((artifact) => {
              const Icon = kindIcon(artifact.kind);
              const changeLabel = formatArtifactChangeLabel(artifact.change);
              return (
                <button
                  key={artifact.id}
                  type="button"
                  className={`artifact-card ${selected?.id === artifact.id ? "selected" : ""}`}
                  onClick={() => setSelectedId(artifact.id)}
                >
                  <div className="artifact-card-main">
                    <Icon size={16} aria-hidden="true" />
                    <div className="artifact-card-text">
                      <strong>{fileName(artifact.path)}</strong>
                      <span>{artifact.path}</span>
                    </div>
                  </div>
                  <div className="artifact-card-meta">
                    <span className={`artifact-kind artifact-kind-${artifact.kind}`}>
                      {t(`artifactPanel.kind.${artifact.kind}`)}
                    </span>
                    {changeLabel && (
                      <span className="artifact-change">{t("artifactPanel.change", { label: changeLabel })}</span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>

          {selected && (
            <section className="artifact-preview">
              <div className="artifact-preview-head">
                <div className="artifact-preview-tabs">
                  <button
                    type="button"
                    className={previewMode === "content" ? "active" : ""}
                    onClick={() => setPreviewMode("content")}
                  >
                    {t("artifactPanel.previewContent")}
                  </button>
                  <button
                    type="button"
                    className={previewMode === "diff" ? "active" : ""}
                    onClick={() => setPreviewMode("diff")}
                  >
                    {t("artifactPanel.previewDiff")}
                  </button>
                </div>
                <div className="artifact-preview-actions">
                  <button
                    type="button"
                    className="artifact-action-btn"
                    onClick={() => void openFileInEditor(selected.path)}
                    title={t("artifactPanel.openExternal")}
                  >
                    <ExternalLink size={14} />
                  </button>
                  <button
                    type="button"
                    className="artifact-action-btn"
                    onClick={() => onArchive(selected.id)}
                    title={t("artifactPanel.archive")}
                  >
                    <Archive size={14} />
                  </button>
                </div>
              </div>
              {loadingPreview ? (
                <div className="artifact-preview-loading">{t("common.loading")}</div>
              ) : previewError ? (
                <div className="artifact-preview-error">{previewError}</div>
              ) : previewMode === "diff" ? (
                diffText.includes("\n+") || diffText.startsWith("+++") || diffText.startsWith("---") ? (
                  <ArtifactDiffView code={diffText} />
                ) : (
                  <pre className="artifact-preview-fallback">{diffText || previewText}</pre>
                )
              ) : (
                <pre className="artifact-preview-fallback">{previewText}</pre>
              )}
            </section>
          )}
        </>
      )}
    </aside>
  );
});
