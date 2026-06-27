import type { AppSettings, NetworkSettings, RemoteConnectionConfig } from "../runtime/hermes-runtime";
import type { McpForm, ModelForm, PoolForm, ProfileForm, SkillInstallForm } from "./appTypes";

export const themeOptions = [
  { id: "light", name: "Light", appearance: "light" },
  { id: "dark", name: "Dark", appearance: "dark" },
  { id: "github-light", name: "GitHub Light", appearance: "light" },
  { id: "github-dark", name: "GitHub Dark", appearance: "dark" },
  { id: "dracula", name: "Dracula", appearance: "dark" },
  { id: "nord", name: "Nord", appearance: "dark" },
  { id: "one-dark", name: "One Dark", appearance: "dark" },
];

export const fontOptions = [
  { id: "system", name: "System", stack: "system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" },
  { id: "serif", name: "Serif", stack: "Georgia, 'Times New Roman', serif" },
  { id: "mono", name: "Mono", stack: "'SFMono-Regular', Consolas, 'Liberation Mono', monospace" },
];

export const defaultAppSettings: AppSettings = {
  theme: "light",
  roundedCorners: true,
  font: "system",
  allowAnonymousAnalytics: false,
};

export const defaultNetworkSettings: NetworkSettings = {
  forceIpv4: false,
  proxy: "",
  localChatTransport: "auto",
  remoteChatTransport: "auto",
  sshChatTransport: "auto",
};

export const emptyModelForm: ModelForm = {
  name: "",
  provider: "",
  model: "",
  baseUrl: "",
  contextLength: "",
};

export const emptyPoolForm: PoolForm = {
  provider: "",
  apiKey: "",
  label: "",
};

export const emptyProfileForm: ProfileForm = {
  name: "",
  cloneConfig: true,
};

export const emptyMcpForm: McpForm = {
  name: "",
  transport: "http",
  url: "",
  command: "",
  args: "",
  env: "",
  auth: "",
  enabled: true,
};

export const emptySkillInstallForm: SkillInstallForm = {
  sourcePath: "",
  category: "custom",
  name: "",
};

export const ONBOARDING_STORAGE_KEY = "hermes-team:onboarding-complete";

export const defaultRemoteConnectionConfig: RemoteConnectionConfig = {
  mode: "local",
  remoteUrl: "http://127.0.0.1:8642",
  apiKey: "",
  localChatTransport: "auto",
  remoteChatTransport: "auto",
  sshChatTransport: "auto",
  ssh: {
    host: "",
    port: 22,
    username: "",
    keyPath: "",
    remotePort: 8642,
    localPort: 18642,
  },
};

