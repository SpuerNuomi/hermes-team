import { Brain, Check, ChevronDown } from "lucide-react";
import { memo, useEffect, useMemo, useRef, useState } from "react";
import { REASONING_EFFORT_OPTIONS, type ReasoningEffort } from "../core/reasoning";

export const ReasoningEffortPicker = memo(function ReasoningEffortPicker({
  value,
  disabled,
  onChange,
}: {
  value: ReasoningEffort;
  disabled?: boolean;
  onChange: (value: ReasoningEffort) => void | Promise<void>;
}) {
  const [open, setOpen] = useState(false);
  const [saveError, setSaveError] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const selected = useMemo(
    () => REASONING_EFFORT_OPTIONS.find((option) => option.value === value) ?? REASONING_EFFORT_OPTIONS[0],
    [value],
  );

  useEffect(() => {
    if (!open) return undefined;
    function handlePointerDown(event: MouseEvent) {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setSaveError(false);
      }
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
        setSaveError(false);
      }
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  async function select(next: ReasoningEffort) {
    try {
      await onChange(next);
      setSaveError(false);
      setOpen(false);
    } catch {
      setSaveError(true);
    }
  }

  return (
    <div className="chat-control chat-reasoning-control" ref={rootRef}>
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="chat-control-trigger chat-reasoning-trigger"
        disabled={disabled}
        title="Reasoning effort"
        type="button"
        onClick={() => {
          setSaveError(false);
          setOpen((value) => !value);
        }}
      >
        <Brain size={13} />
        <span>{selected.label}</span>
        <ChevronDown size={12} />
      </button>
      {open && (
        <div className="chat-control-menu reasoning-menu-lite" role="menu" aria-label="Reasoning effort">
          <div className="chat-control-menu-heading">Reasoning effort</div>
          <div className="chat-control-menu-hint">
            Auto is safest. Manual levels may be ignored by unsupported models.
          </div>
          {saveError && (
            <div className="chat-control-menu-error" role="alert">
              Could not save reasoning level. Selection was restored.
            </div>
          )}
          {REASONING_EFFORT_OPTIONS.map((option) => {
            const active = option.value === value;
            return (
              <button
                aria-checked={active}
                className={`chat-control-option ${active ? "active" : ""}`}
                key={option.value}
                role="menuitemradio"
                type="button"
                onClick={() => void select(option.value)}
              >
                <span>
                  <strong>{option.label}</strong>
                  <small>{option.description}</small>
                </span>
                {active && <Check size={14} />}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
});
