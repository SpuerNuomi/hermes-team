import en from "./locales/en";
import zh from "./locales/zh";
import type { Language, LanguageOption, TranslationTree, TranslationVars } from "./types";

// Source/default locale. The product UI was authored in Chinese, so untranslated
// keys resolve against this locale before falling back to the raw key.
export const SOURCE_LANGUAGE: Language = "zh";

// Languages exposed in the switcher. Add an entry (and a dictionary in
// `resources`) to extend support.
export const LANGUAGE_OPTIONS: LanguageOption[] = [
  { id: "zh", label: "简体中文" },
  { id: "en", label: "English" },
];

export const SUPPORTED_LANGUAGES: Language[] = LANGUAGE_OPTIONS.map((option) => option.id);

export const resources: Record<Language, TranslationTree> = {
  zh,
  en,
};

export const LANGUAGE_STORAGE_KEY = "hermes-team:language";

export function isLanguage(value: unknown): value is Language {
  return typeof value === "string" && (SUPPORTED_LANGUAGES as string[]).includes(value);
}

// Resolves a dotted key path (e.g. `nav.newChat`) against a translation tree.
// Returns the string leaf or undefined when the path is missing or not a leaf.
function readKey(tree: TranslationTree | undefined, key: string): string | undefined {
  if (!tree) return undefined;
  const result = key.split(".").reduce<string | TranslationTree | undefined>((current, part) => {
    if (!current || typeof current !== "object") return undefined;
    return (current as TranslationTree)[part];
  }, tree);
  return typeof result === "string" ? result : undefined;
}

function interpolate(template: string, vars?: TranslationVars): string {
  if (!vars) return template;
  return Object.entries(vars).reduce(
    (message, [name, value]) => message.replaceAll(`{{${name}}}`, String(value)),
    template,
  );
}

// Looks up `key` for `language`, falling back to the source locale and finally
// to the raw key, then applies `{{var}}` interpolation.
export function translate(language: Language, key: string, vars?: TranslationVars): string {
  const localized = readKey(resources[language], key);
  const fallback = localized ?? readKey(resources[SOURCE_LANGUAGE], key);
  return interpolate(fallback ?? key, vars);
}

// Picks the initial language: a previously persisted choice wins; otherwise we
// infer from the browser locale, defaulting to the source language.
export function detectInitialLanguage(): Language {
  if (typeof window !== "undefined") {
    try {
      const stored = window.localStorage?.getItem(LANGUAGE_STORAGE_KEY);
      if (isLanguage(stored)) return stored;
    } catch {
      // localStorage may be unavailable (e.g. privacy mode); ignore and infer.
    }
    const navigatorLang = window.navigator?.language?.toLowerCase() ?? "";
    if (navigatorLang.startsWith("zh")) return "zh";
    if (navigatorLang.startsWith("en")) return "en";
  }
  return SOURCE_LANGUAGE;
}

export function persistLanguage(language: Language): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage?.setItem(LANGUAGE_STORAGE_KEY, language);
  } catch {
    // Best-effort persistence; ignore storage failures.
  }
}
