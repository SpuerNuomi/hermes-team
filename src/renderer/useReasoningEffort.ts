import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_REASONING_EFFORT,
  normalizeReasoningEffort,
  type ReasoningEffort,
} from "../core/reasoning";
import {
  getHermesReasoningEffort,
  isTauriRuntimeAvailable,
  setHermesReasoningEffort,
} from "../runtime/hermes-runtime";

export function useReasoningEffort(profile?: string): {
  reasoningEffort: ReasoningEffort;
  setReasoningEffort: (next: ReasoningEffort) => Promise<void>;
} {
  const [reasoningEffort, setReasoningEffortState] = useState<ReasoningEffort>(
    DEFAULT_REASONING_EFFORT,
  );
  const reasoningEffortRef = useRef<ReasoningEffort>(DEFAULT_REASONING_EFFORT);

  useEffect(() => {
    reasoningEffortRef.current = reasoningEffort;
  }, [reasoningEffort]);

  useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntimeAvailable()) {
      reasoningEffortRef.current = DEFAULT_REASONING_EFFORT;
      setReasoningEffortState(DEFAULT_REASONING_EFFORT);
      return () => {
        cancelled = true;
      };
    }

    getHermesReasoningEffort({ profile })
      .then((value) => {
        if (cancelled) return;
        const next = normalizeReasoningEffort(value);
        reasoningEffortRef.current = next;
        setReasoningEffortState(next);
      })
      .catch(() => {
        if (cancelled) return;
        reasoningEffortRef.current = DEFAULT_REASONING_EFFORT;
        setReasoningEffortState(DEFAULT_REASONING_EFFORT);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const setReasoningEffort = useCallback(
    async (next: ReasoningEffort): Promise<void> => {
      const normalized = normalizeReasoningEffort(next);
      const previous = reasoningEffortRef.current;
      reasoningEffortRef.current = normalized;
      setReasoningEffortState(normalized);

      try {
        await setHermesReasoningEffort({ profile, value: normalized });
      } catch (error) {
        reasoningEffortRef.current = previous;
        setReasoningEffortState(previous);
        throw error;
      }
    },
    [profile],
  );

  return { reasoningEffort, setReasoningEffort };
}
