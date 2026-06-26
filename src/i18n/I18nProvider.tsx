import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  detectInitialLanguage,
  LANGUAGE_OPTIONS,
  persistLanguage,
  translate,
} from "./resources";
import type { Language, LanguageOption, TranslationVars } from "./types";

export interface I18nContextValue {
  language: Language;
  setLanguage: (language: Language) => void;
  // Translate a dotted key with optional `{{var}}` interpolation.
  t: (key: string, vars?: TranslationVars) => string;
  options: LanguageOption[];
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [language, setLanguageState] = useState<Language>(() => detectInitialLanguage());

  // Reflect the active language on the document element so CSS and assistive
  // tech can react to it.
  useEffect(() => {
    if (typeof document !== "undefined") {
      document.documentElement.lang = language === "zh" ? "zh-CN" : language;
    }
  }, [language]);

  const setLanguage = useCallback((next: Language) => {
    setLanguageState(next);
    persistLanguage(next);
  }, []);

  const t = useCallback(
    (key: string, vars?: TranslationVars) => translate(language, key, vars),
    [language],
  );

  const value = useMemo<I18nContextValue>(
    () => ({ language, setLanguage, t, options: LANGUAGE_OPTIONS }),
    [language, setLanguage, t],
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error("useI18n must be used within an I18nProvider");
  }
  return context;
}

// Convenience hook for components that only need the translate function.
export function useTranslation(): I18nContextValue["t"] {
  return useI18n().t;
}
