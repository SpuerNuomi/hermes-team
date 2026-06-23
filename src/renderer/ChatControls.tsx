import { Check, ChevronDown, Settings } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import type { ReasoningEffort } from "../core/reasoning";
import type { ActiveModelConfig, HermesProfileInfo, SavedModel } from "../runtime/hermes-runtime";
import { ReasoningEffortPicker } from "./ReasoningEffortPicker";

export const ChatControls = memo(function ChatControls({
  profiles,
  models,
  currentProfile,
  activeModel,
  reasoningEffort,
  busy,
  onSelectProfile,
  onSelectModel,
  onSelectReasoningEffort,
  onOpenModels,
}: {
  profiles: HermesProfileInfo[];
  models: SavedModel[];
  currentProfile: string;
  activeModel: ActiveModelConfig | null;
  reasoningEffort: ReasoningEffort;
  busy: boolean;
  onSelectProfile: (profile: string) => void;
  onSelectModel: (model: SavedModel) => void;
  onSelectReasoningEffort: (value: ReasoningEffort) => void | Promise<void>;
  onOpenModels: () => void;
}) {
  const [profileOpen, setProfileOpen] = useState(false);
  const [modelOpen, setModelOpen] = useState(false);
  const [modelSearch, setModelSearch] = useState("");
  const rootRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!profileOpen && !modelOpen) return undefined;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
        setModelOpen(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setProfileOpen(false);
        setModelOpen(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen, modelOpen]);

  useEffect(() => {
    if (modelOpen) searchRef.current?.focus();
  }, [modelOpen]);

  const profileNames = useMemo(() => {
    const names = new Set(profiles.map((profile) => profile.name));
    names.add(currentProfile || "default");
    return Array.from(names).sort((left, right) => {
      if (left === "default") return -1;
      if (right === "default") return 1;
      return left.localeCompare(right);
    });
  }, [currentProfile, profiles]);

  const profileByName = useMemo(
    () => new Map(profiles.map((profile) => [profile.name, profile])),
    [profiles],
  );

  const query = modelSearch.trim().toLowerCase();
  const filteredModels = query
    ? models.filter((model) =>
        `${model.name} ${model.provider} ${model.model}`.toLowerCase().includes(query),
      )
    : models;
  const activeModelLabel = activeModel?.model || "Model";

  return (
    <div className="chat-controls" ref={rootRef}>
      <div className="chat-control">
        <button
          className="chat-control-trigger"
          type="button"
          onClick={() => {
            setProfileOpen((value) => !value);
            setModelOpen(false);
          }}
        >
          <span>{currentProfile || "default"}</span>
          <ChevronDown size={12} />
        </button>
        {profileOpen && (
          <div className="chat-control-menu profile-menu-lite">
            {profileNames.map((name) => {
              const profile = profileByName.get(name);
              const selected = name === currentProfile;
              return (
                <button
                  className={`chat-control-option ${selected ? "active" : ""}`}
                  key={name}
                  type="button"
                  onClick={() => {
                    setProfileOpen(false);
                    onSelectProfile(name);
                  }}
                >
                  <span>
                    <strong>{name}</strong>
                    <small>{profile?.hasApiKey ? "API key ready" : "no API key"}</small>
                  </span>
                  {selected && <Check size={14} />}
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div className="chat-control">
        <button
          className="chat-control-trigger"
          disabled={busy}
          type="button"
          onClick={() => {
            setModelOpen((value) => !value);
            setProfileOpen(false);
            setModelSearch("");
          }}
        >
          <span>{activeModelLabel}</span>
          <ChevronDown size={12} />
        </button>
        {modelOpen && (
          <div className="chat-control-menu model-menu-lite">
            <input
              ref={searchRef}
              className="chat-control-search"
              value={modelSearch}
              onChange={(event) => setModelSearch(event.target.value)}
              placeholder="Search models"
            />
            {filteredModels.length > 0 ? (
              filteredModels.map((model) => {
                const selected =
                  activeModel?.provider === model.provider && activeModel?.model === model.model;
                return (
                  <button
                    className={`chat-control-option ${selected ? "active" : ""}`}
                    key={model.id}
                    type="button"
                    onClick={() => {
                      setModelOpen(false);
                      onSelectModel(model);
                    }}
                  >
                    <span>
                      <strong>{model.name}</strong>
                      <small>{model.provider} · {model.model}</small>
                    </span>
                    {selected && <Check size={14} />}
                  </button>
                );
              })
            ) : (
              <div className="chat-control-empty">No saved models</div>
            )}
            <button
              className="chat-control-manage"
              type="button"
              onClick={() => {
                setModelOpen(false);
                onOpenModels();
              }}
            >
              <Settings size={13} />
              Manage models
            </button>
          </div>
        )}
      </div>

      <ReasoningEffortPicker
        disabled={busy}
        value={reasoningEffort}
        onChange={onSelectReasoningEffort}
      />
    </div>
  );
});
