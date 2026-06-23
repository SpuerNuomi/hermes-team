import { useCallback, useRef, useState } from "react";

interface UseInputHistoryArgs {
  currentInput: string;
  applyText: (text: string) => void;
}

interface UseInputHistoryResult {
  push: (text: string) => void;
  recallPrev: () => boolean;
  recallNext: () => boolean;
  isNavigating: () => boolean;
  size: () => number;
}

export function useInputHistory({
  currentInput,
  applyText,
}: UseInputHistoryArgs): UseInputHistoryResult {
  const [history, setHistory] = useState<string[]>([]);
  const indexRef = useRef(-1);
  const draftRef = useRef("");

  const push = useCallback((text: string) => {
    setHistory((prev) => [...prev, text]);
    indexRef.current = -1;
    draftRef.current = "";
  }, []);

  const recallPrev = useCallback((): boolean => {
    if (history.length === 0) return false;
    const cur = indexRef.current;
    const next = cur === -1 ? history.length - 1 : Math.max(0, cur - 1);
    if (cur === -1) draftRef.current = currentInput;
    indexRef.current = next;
    applyText(history[next]);
    return true;
  }, [history, currentInput, applyText]);

  const recallNext = useCallback((): boolean => {
    const cur = indexRef.current;
    if (cur === -1) return false;
    if (cur < history.length - 1) {
      indexRef.current = cur + 1;
      applyText(history[cur + 1]);
    } else {
      indexRef.current = -1;
      applyText(draftRef.current);
    }
    return true;
  }, [history, applyText]);

  const isNavigating = useCallback(() => indexRef.current !== -1, []);
  const size = useCallback(() => history.length, [history.length]);

  return { push, recallPrev, recallNext, isNavigating, size };
}
