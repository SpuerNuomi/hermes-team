import type { TranslationTree } from "../types";

// Chinese (Simplified) dictionary. This is the source locale for the current
// product UI. Keys are grouped by area; only migrated, user-visible strings are
// included so far — the rest of the app can be migrated progressively.
const zh = {
  common: {
    save: "保存",
    cancel: "取消",
    saving: "保存中",
    saved: "已保存",
    local: "本地",
    refresh: "刷新",
    loading: "读取中...",
  },
  nav: {
    brandSubtitle: "Hermes Agent 工作台",
    mainNav: "主导航",
    newChat: "新建聊天",
    groupWorkspace: "工作区",
    chat: "聊天",
    groupAutomation: "自动化",
    schedules: "定时任务",
    groupSystem: "系统",
    settings: "设置",
    collapseSidebar: "收起侧栏",
    expandSidebar: "展开侧栏",
  },
  settings: {
    sectionsLabel: "设置分组",
    panels: {
      overview: "概览",
      appearance: "外观",
      privacy: "隐私",
      network: "网络",
      profiles: "Profiles",
      providers: "Provider",
      models: "模型",
      gateway: "Gateway",
      messaging: "消息",
      schedules: "定时任务",
      capabilities: "能力",
      skills: "技能",
      memory: "记忆",
      update: "更新",
      logs: "日志",
    },
  },
  appearance: {
    panelLabel: "外观",
    title: "外观设置",
    theme: "主题",
    roundedCorners: "圆角",
    roundedCornersHint: "控制应用界面的圆角显示。",
    font: "字体",
    language: "语言",
    languageHint: "切换界面显示语言，选择会自动保存到本机。",
    saved: "外观设置已保存。",
    readFailed: "读取外观设置失败：{{error}}",
    saveFailed: "保存外观设置失败：{{error}}",
  },
  chat: {
    newChatTitle: "新建聊天",
    newChatDescription: "输入消息开始一次新的 Hermes 聊天。",
    fastModeOnTitle: "Fast Mode 已开启（优先处理）",
    fastModeOffTitle: "开启 Fast Mode（优先处理、更低延迟）",
    searchModels: "搜索模型",
    noSavedModels: "暂无已保存模型",
    manageModels: "管理模型",
    apiKeyReady: "API key 就绪",
    noApiKey: "未配置 API key",
  },
  language: {
    zh: "简体中文",
    en: "English",
  },
} satisfies TranslationTree;

export default zh;
