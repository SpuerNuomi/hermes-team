import type { TranslationTree } from "../types";

// English dictionary. Mirrors the key structure of the Chinese source locale.
// Missing keys fall back to the source locale at lookup time.
const en = {
  common: {
    save: "Save",
    cancel: "Cancel",
    saving: "Saving",
    saved: "Saved",
    local: "Local",
    refresh: "Refresh",
    loading: "Loading...",
  },
  nav: {
    brandSubtitle: "Hermes Agent workspace",
    mainNav: "Main navigation",
    newChat: "New chat",
    groupWorkspace: "Workspace",
    chat: "Chat",
    groupAutomation: "Automation",
    schedules: "Schedules",
    groupSystem: "System",
    settings: "Settings",
    collapseSidebar: "Collapse sidebar",
    expandSidebar: "Expand sidebar",
  },
  settings: {
    sectionsLabel: "Settings sections",
    panels: {
      overview: "Overview",
      appearance: "Appearance",
      network: "Network",
      profiles: "Profiles",
      providers: "Providers",
      models: "Models",
      gateway: "Gateway",
      messaging: "Messaging",
      schedules: "Schedules",
      capabilities: "Capabilities",
      skills: "Skills",
      memory: "Memory",
      update: "Update",
      logs: "Logs",
    },
  },
  appearance: {
    panelLabel: "Appearance",
    title: "Appearance settings",
    theme: "Theme",
    roundedCorners: "Rounded corners",
    roundedCornersHint: "Controls rounded corners across the app interface.",
    font: "Font",
    language: "Language",
    languageHint: "Switch the interface language. Your choice is saved on this device.",
    saved: "Appearance settings saved.",
    readFailed: "Failed to read appearance settings: {{error}}",
    saveFailed: "Failed to save appearance settings: {{error}}",
  },
  chat: {
    newChatTitle: "New chat",
    newChatDescription: "Type a message to start a new Hermes chat.",
    fastModeOnTitle: "Fast Mode is on (prioritized)",
    fastModeOffTitle: "Enable Fast Mode (prioritized, lower latency)",
    searchModels: "Search models",
    noSavedModels: "No saved models",
    manageModels: "Manage models",
    apiKeyReady: "API key ready",
    noApiKey: "No API key",
  },
  language: {
    zh: "简体中文",
    en: "English",
  },
} satisfies TranslationTree;

export default en;
