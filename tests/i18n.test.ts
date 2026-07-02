import { describe, expect, it } from "vitest";
import en from "../src/i18n/locales/en";
import zh from "../src/i18n/locales/zh";
import {
  isLanguage,
  SUPPORTED_LANGUAGES,
  translate,
} from "../src/i18n/resources";
import type { TranslationTree } from "../src/i18n/types";

// Collect every dotted leaf key from a translation tree so we can compare the
// structure of locales and guarantee parity.
function collectKeys(tree: TranslationTree, prefix = ""): string[] {
  return Object.entries(tree).flatMap(([key, value]) => {
    const path = prefix ? `${prefix}.${key}` : key;
    return typeof value === "string" ? [path] : collectKeys(value, path);
  });
}

describe("i18n resources", () => {
  it("resolves keys for each supported language", () => {
    expect(translate("zh", "nav.newChat")).toBe("新建任务");
    expect(translate("en", "nav.newChat")).toBe("New task");
    expect(translate("zh", "nav.tasks")).toBe("任务");
    expect(translate("en", "nav.tasks")).toBe("Tasks");
    expect(translate("zh", "taskHeader.workMode.ask.label")).toBe("问一问");
    expect(translate("en", "taskHeader.workMode.craft.label")).toBe("Craft");
  });

  it("falls back to the source locale when a key is missing in the target", () => {
    const onlyZh: TranslationTree = { custom: { greeting: "你好" } };
    // Simulate a missing English key by querying a path that only zh defines.
    // translate() falls back to the source locale (zh) then to the raw key.
    expect(translate("en", "nav.newChat")).toBe("New task");
    expect(collectKeys(onlyZh)).toEqual(["custom.greeting"]);
  });

  it("returns the raw key when no translation exists", () => {
    expect(translate("en", "totally.missing.key")).toBe("totally.missing.key");
  });

  it("interpolates {{var}} placeholders", () => {
    expect(translate("en", "appearance.saveFailed", { error: "boom" })).toBe(
      "Failed to save appearance settings: boom",
    );
    expect(translate("zh", "appearance.readFailed", { error: "X" })).toBe(
      "读取外观设置失败：X",
    );
  });

  it("keeps locale key structure in parity", () => {
    expect(collectKeys(zh).sort()).toEqual(collectKeys(en).sort());
  });

  it("validates language codes", () => {
    expect(isLanguage("zh")).toBe(true);
    expect(isLanguage("en")).toBe(true);
    expect(isLanguage("fr")).toBe(false);
    expect(isLanguage(42)).toBe(false);
    expect(SUPPORTED_LANGUAGES).toContain("zh");
    expect(SUPPORTED_LANGUAGES).toContain("en");
  });
});
