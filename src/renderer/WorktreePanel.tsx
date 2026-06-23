import { ChevronRight, FileText, Folder, RefreshCw } from "lucide-react";
import { memo, useEffect, useMemo, useState } from "react";
import { readDirectory, type DirectoryEntryInfo } from "../runtime/hermes-runtime";
import { FileViewer } from "./FileViewer";

function formatSize(bytes?: number): string {
  if (bytes == null) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function parentPath(path: string): string | null {
  const trimmed = path.replace(/[\\/]+$/, "");
  const index = Math.max(trimmed.lastIndexOf("/"), trimmed.lastIndexOf("\\"));
  if (index <= 0) return null;
  return trimmed.slice(0, index);
}

function basename(path: string): string {
  return path.split(/[\\/]/).filter(Boolean).at(-1) || path;
}

export const WorktreePanel = memo(function WorktreePanel({
  rootPath,
  onAttachFile,
}: {
  rootPath: string;
  onAttachFile: (path: string) => void;
}) {
  const [currentPath, setCurrentPath] = useState(rootPath);
  const [entries, setEntries] = useState<DirectoryEntryInfo[]>([]);
  const [selectedFile, setSelectedFile] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    setCurrentPath(rootPath);
  }, [rootPath]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError("");
    void readDirectory(currentPath)
      .then((items) => {
        if (!cancelled) setEntries(items);
      })
      .catch((err) => {
        if (!cancelled) {
          setEntries([]);
          setError(err instanceof Error ? err.message : String(err));
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [currentPath, reloadKey]);

  const canGoUp = useMemo(() => {
    const parent = parentPath(currentPath);
    return Boolean(parent && currentPath !== rootPath);
  }, [currentPath, rootPath]);

  return (
    <section className="worktree-panel" aria-label="Context folder files">
      <header className="worktree-header">
        <div>
          <strong>{basename(currentPath)}</strong>
          <span title={currentPath}>{currentPath}</span>
        </div>
        <button
          type="button"
          disabled={loading}
          onClick={() => setReloadKey((value) => value + 1)}
          title="Refresh"
          aria-label="Refresh"
        >
          <RefreshCw size={14} />
        </button>
      </header>
      <div className="worktree-list">
        {canGoUp && (
          <button
            className="worktree-row"
            type="button"
            onClick={() => {
              const parent = parentPath(currentPath);
              if (parent) setCurrentPath(parent);
            }}
          >
            <ChevronRight className="worktree-up-icon" size={14} />
            <Folder size={14} />
            <span>..</span>
            <small>Parent</small>
          </button>
        )}
        {loading ? (
          <div className="worktree-state">Loading folder...</div>
        ) : error ? (
          <div className="worktree-state worktree-error">{error}</div>
        ) : entries.length === 0 ? (
          <div className="worktree-state">Empty folder</div>
        ) : (
          entries.map((entry) => (
            <button
              className={`worktree-row ${entry.isDir ? "worktree-row-dir" : "worktree-row-file"}`}
              key={entry.path}
              type="button"
              title={entry.path}
              onClick={() => {
                if (entry.isDir) setCurrentPath(entry.path);
                else if (entry.isFile) setSelectedFile(entry.path);
              }}
            >
              {entry.isDir ? <ChevronRight size={14} /> : <span className="worktree-spacer" />}
              {entry.isDir ? <Folder size={14} /> : <FileText size={14} />}
              <span>{entry.name}</span>
              <small>{entry.isDir ? "Folder" : formatSize(entry.sizeBytes)}</small>
            </button>
          ))
        )}
      </div>
      {selectedFile && (
        <FileViewer
          filePath={selectedFile}
          onAttach={onAttachFile}
          onClose={() => setSelectedFile(null)}
        />
      )}
    </section>
  );
});
