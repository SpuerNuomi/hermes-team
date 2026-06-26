// Supported UI languages. The framework is intentionally extensible: add a new
// code here and a matching locale dictionary to support more languages without
// touching the resolution logic.
export type Language = "zh" | "en";

// A nested dictionary tree. Leaves are strings; branches are sub-trees. This
// mirrors the upstream desktop key organization (namespaces such as `nav`,
// `settings`, `appearance`).
export type TranslationTree = {
  [key: string]: string | TranslationTree;
};

// Values that can be interpolated into a translation via `{{name}}` markers.
export type TranslationVars = Record<string, string | number>;

export interface LanguageOption {
  id: Language;
  // Endonym (name of the language in that language itself).
  label: string;
}
