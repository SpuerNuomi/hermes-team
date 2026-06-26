import { useCallback, useEffect, useRef, useState } from "react";
import {
  getHermesFastMode,
  isTauriRuntimeAvailable,
  setHermesFastMode,
} from "../runtime/hermes-runtime";

/**
 * Fast Mode mirrors the upstream desktop behavior: it persists
 * `agent.service_tier` (`fast`/`normal`) on the active chat profile, and the
 * Hermes Gateway picks the tier up from config. There is no per-request body
 * field — the runtime reads it from `config.yaml`.
 */
export function useFastMode(profile?: string): {
  fastMode: boolean;
  setFastMode: (next: boolean) => Promise<void>;
} {
  const [fastMode, setFastModeState] = useState(false);
  const fastModeRef = useRef(false);

  useEffect(() => {
    fastModeRef.current = fastMode;
  }, [fastMode]);

  useEffect(() => {
    let cancelled = false;
    if (!isTauriRuntimeAvailable()) {
      fastModeRef.current = false;
      setFastModeState(false);
      return () => {
        cancelled = true;
      };
    }

    getHermesFastMode({ profile })
      .then((value) => {
        if (cancelled) return;
        fastModeRef.current = value;
        setFastModeState(value);
      })
      .catch(() => {
        if (cancelled) return;
        fastModeRef.current = false;
        setFastModeState(false);
      });

    return () => {
      cancelled = true;
    };
  }, [profile]);

  const setFastMode = useCallback(
    async (next: boolean): Promise<void> => {
      const previous = fastModeRef.current;
      fastModeRef.current = next;
      setFastModeState(next);
      try {
        const applied = await setHermesFastMode({ profile, enabled: next });
        fastModeRef.current = applied;
        setFastModeState(applied);
      } catch (error) {
        fastModeRef.current = previous;
        setFastModeState(previous);
        throw error;
      }
    },
    [profile],
  );

  return { fastMode, setFastMode };
}
