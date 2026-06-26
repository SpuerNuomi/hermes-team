import {
  ArrowRight,
  Check,
  Copy,
  Globe,
  KeyRound,
  Loader2,
  RefreshCw,
  ServerCog,
  TerminalSquare,
} from "lucide-react";
import { useMemo, useState } from "react";
import type {
  HermesInstallStatus,
  ProviderRegistryEntry,
  RemoteConnectionStatus,
} from "../runtime/hermes-runtime";

const UNIX_INSTALL_CMD =
  "curl -fsSL https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.sh | bash";
const WINDOWS_INSTALL_CMD =
  'powershell -NoProfile -ExecutionPolicy Bypass -c "irm https://raw.githubusercontent.com/NousResearch/hermes-agent/main/scripts/install.ps1 | iex"';

function installCommand(): string {
  const ua = typeof navigator !== "undefined" ? navigator.userAgent : "";
  return /windows/i.test(ua) ? WINDOWS_INSTALL_CMD : UNIX_INSTALL_CMD;
}

export interface OnboardingConfigureInput {
  provider: string;
  label: string;
  model: string;
  baseUrl: string;
  envKey: string;
  apiKey: string;
  contextLength?: number;
}

export interface OnboardingFlowProps {
  installStatus: HermesInstallStatus | null;
  providers: ProviderRegistryEntry[];
  busy: boolean;
  onRecheck: () => Promise<void>;
  onConnectRemote: (url: string, key: string) => Promise<RemoteConnectionStatus>;
  onConnectSsh: (input: {
    host: string;
    port: number;
    username: string;
    keyPath: string;
    remotePort: number;
  }) => Promise<RemoteConnectionStatus>;
  onConfigureModel: (input: OnboardingConfigureInput) => Promise<void>;
  onFinish: () => void;
  onSkip: () => void;
}

type Step = "welcome" | "local" | "remote" | "ssh" | "setup" | "done";

/**
 * First-launch guided onboarding. Walks a new user from an empty environment to
 * a working chat: pick a connection path (local Hermes / remote URL / SSH),
 * confirm the local runtime is installed, then configure a provider + model.
 *
 * The flow is grounded entirely in existing backend commands — it never
 * fabricates an install. When the local Hermes CLI is missing it surfaces the
 * official install command to run in a terminal plus a re-check, mirroring the
 * upstream desktop Welcome/Install/Setup screens adapted to this Tauri app.
 */
export function OnboardingFlow({
  installStatus,
  providers,
  busy,
  onRecheck,
  onConnectRemote,
  onConnectSsh,
  onConfigureModel,
  onFinish,
  onSkip,
}: OnboardingFlowProps) {
  const [step, setStep] = useState<Step>("welcome");
  return (
    <div className="onboarding-overlay" role="dialog" aria-modal="true" aria-label="Hermes 引导式安装">
      <div className="onboarding-card">
        <button type="button" className="onboarding-skip" onClick={onSkip}>
          稍后再说
        </button>
        {step === "welcome" && <WelcomeStep onPick={setStep} />}
        {step === "local" && (
          <LocalStep
            installStatus={installStatus}
            busy={busy}
            onRecheck={onRecheck}
            onBack={() => setStep("welcome")}
            onNext={() => setStep("setup")}
          />
        )}
        {step === "remote" && (
          <RemoteStep
            busy={busy}
            onConnect={onConnectRemote}
            onBack={() => setStep("welcome")}
            onConnected={() => setStep("done")}
          />
        )}
        {step === "ssh" && (
          <SshStep
            busy={busy}
            onConnect={onConnectSsh}
            onBack={() => setStep("welcome")}
            onConnected={() => setStep("done")}
          />
        )}
        {step === "setup" && (
          <SetupStep
            providers={providers}
            busy={busy}
            onConfigure={onConfigureModel}
            onBack={() => setStep("local")}
            onConfigured={() => setStep("done")}
          />
        )}
        {step === "done" && <DoneStep onFinish={onFinish} />}
      </div>
    </div>
  );
}

function WelcomeStep({ onPick }: { onPick: (step: Step) => void }) {
  return (
    <div className="onboarding-step">
      <div className="onboarding-brand">H</div>
      <h1>欢迎使用 Hermes Team</h1>
      <p className="onboarding-subtitle">
        选择如何连接到 Hermes Agent 运行时。我们会带你完成检测、模型配置与首次启动。
      </p>
      <div className="onboarding-paths">
        <button type="button" className="onboarding-path" onClick={() => onPick("local")}>
          <ServerCog size={20} />
          <div>
            <strong>本地 Hermes</strong>
            <span>在本机运行 Gateway（推荐）</span>
          </div>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="onboarding-path" onClick={() => onPick("remote")}>
          <Globe size={20} />
          <div>
            <strong>远程地址</strong>
            <span>连接已运行的 Hermes 服务 URL</span>
          </div>
          <ArrowRight size={16} />
        </button>
        <button type="button" className="onboarding-path" onClick={() => onPick("ssh")}>
          <KeyRound size={20} />
          <div>
            <strong>SSH 隧道</strong>
            <span>通过 SSH 转发到远端 Gateway</span>
          </div>
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function LocalStep({
  installStatus,
  busy,
  onRecheck,
  onBack,
  onNext,
}: {
  installStatus: HermesInstallStatus | null;
  busy: boolean;
  onRecheck: () => Promise<void>;
  onBack: () => void;
  onNext: () => void;
}) {
  const [copied, setCopied] = useState(false);
  const installed = Boolean(installStatus?.installed);
  const command = useMemo(installCommand, []);

  const copyCommand = () => {
    void navigator.clipboard.writeText(command);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="onboarding-step">
      <h1>检测本地 Hermes</h1>
      <p className="onboarding-subtitle">
        Hermes Team 会复用你本机的 Hermes Agent 运行时，而不是内置一份安装器。
      </p>

      <div className={`onboarding-detect ${installed ? "ok" : "missing"}`}>
        <div className="onboarding-detect-row">
          <span>Hermes CLI</span>
          <strong>{installed ? installStatus?.command || "已发现" : "未找到"}</strong>
        </div>
        <div className="onboarding-detect-row">
          <span>版本</span>
          <strong>{installStatus?.version || "—"}</strong>
        </div>
        <div className="onboarding-detect-row">
          <span>Hermes Home</span>
          <strong className="onboarding-detect-path">{installStatus?.hermesHome || "—"}</strong>
        </div>
      </div>

      {!installed && (
        <div className="onboarding-install">
          <p className="onboarding-install-hint">
            <TerminalSquare size={14} /> 在终端运行下面的官方安装命令，完成后点「重新检测」：
          </p>
          <div className="onboarding-install-box">
            <code>{command}</code>
            <button type="button" onClick={copyCommand} title="复制安装命令">
              {copied ? <Check size={14} /> : <Copy size={14} />}
            </button>
          </div>
        </div>
      )}

      <div className="onboarding-actions">
        <button type="button" className="onboarding-ghost" onClick={onBack}>
          返回
        </button>
        <button type="button" className="onboarding-secondary" disabled={busy} onClick={() => void onRecheck()}>
          {busy ? <Loader2 size={14} className="spin" /> : <RefreshCw size={14} />}
          重新检测
        </button>
        <button type="button" className="onboarding-primary" disabled={!installed} onClick={onNext}>
          下一步：配置模型
          <ArrowRight size={16} />
        </button>
      </div>
    </div>
  );
}

function RemoteStep({
  busy,
  onConnect,
  onBack,
  onConnected,
}: {
  busy: boolean;
  onConnect: (url: string, key: string) => Promise<RemoteConnectionStatus>;
  onBack: () => void;
  onConnected: () => void;
}) {
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const connect = async () => {
    const target = url.trim();
    if (!target) {
      setError("请输入远程服务地址。");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const status = await onConnect(target, key.trim());
      if (status.ok) {
        onConnected();
      } else {
        setError(status.message || "连接失败，请检查地址与 API key。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "连接失败。");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="onboarding-step">
      <h1>连接远程 Hermes</h1>
      <p className="onboarding-subtitle">输入已运行的 Hermes 服务地址与 API key。</p>
      <label className="onboarding-label">服务地址</label>
      <input
        className="onboarding-input"
        type="url"
        placeholder="http://192.168.1.100:8642"
        value={url}
        onChange={(event) => setUrl(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void connect()}
        autoFocus
      />
      <label className="onboarding-label">API key（可选）</label>
      <input
        className="onboarding-input"
        type="password"
        placeholder="sk-..."
        value={key}
        onChange={(event) => setKey(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void connect()}
      />
      {error && <p className="onboarding-error">{error}</p>}
      <div className="onboarding-actions">
        <button type="button" className="onboarding-ghost" onClick={onBack}>
          返回
        </button>
        <button type="button" className="onboarding-primary" disabled={testing || busy} onClick={() => void connect()}>
          {testing ? <Loader2 size={14} className="spin" /> : <Globe size={14} />}
          {testing ? "正在连接..." : "连接"}
        </button>
      </div>
    </div>
  );
}

function SshStep({
  busy,
  onConnect,
  onBack,
  onConnected,
}: {
  busy: boolean;
  onConnect: (input: {
    host: string;
    port: number;
    username: string;
    keyPath: string;
    remotePort: number;
  }) => Promise<RemoteConnectionStatus>;
  onBack: () => void;
  onConnected: () => void;
}) {
  const [host, setHost] = useState("");
  const [port, setPort] = useState("22");
  const [username, setUsername] = useState("");
  const [keyPath, setKeyPath] = useState("");
  const [remotePort, setRemotePort] = useState("8642");
  const [error, setError] = useState<string | null>(null);
  const [testing, setTesting] = useState(false);

  const connect = async () => {
    if (!host.trim() || !username.trim()) {
      setError("请填写主机与用户名。");
      return;
    }
    setTesting(true);
    setError(null);
    try {
      const status = await onConnect({
        host: host.trim(),
        port: Number.parseInt(port, 10) || 22,
        username: username.trim(),
        keyPath: keyPath.trim(),
        remotePort: Number.parseInt(remotePort, 10) || 8642,
      });
      if (status.ok) {
        onConnected();
      } else {
        setError(status.message || "SSH 隧道建立失败。");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "SSH 隧道建立失败。");
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="onboarding-step">
      <h1>SSH 隧道</h1>
      <p className="onboarding-subtitle">通过 SSH 转发到远端机器上的 Hermes Gateway。</p>
      <div className="onboarding-row">
        <div className="onboarding-col onboarding-col-grow">
          <label className="onboarding-label">主机</label>
          <input
            className="onboarding-input"
            type="text"
            placeholder="server.example.com"
            value={host}
            onChange={(event) => setHost(event.target.value)}
            autoFocus
          />
        </div>
        <div className="onboarding-col">
          <label className="onboarding-label">端口</label>
          <input
            className="onboarding-input"
            type="number"
            placeholder="22"
            value={port}
            onChange={(event) => setPort(event.target.value)}
          />
        </div>
      </div>
      <label className="onboarding-label">用户名</label>
      <input
        className="onboarding-input"
        type="text"
        placeholder="ubuntu"
        value={username}
        onChange={(event) => setUsername(event.target.value)}
      />
      <label className="onboarding-label">私钥路径（可选）</label>
      <input
        className="onboarding-input"
        type="text"
        placeholder="~/.ssh/id_rsa"
        value={keyPath}
        onChange={(event) => setKeyPath(event.target.value)}
      />
      <label className="onboarding-label">远端 Gateway 端口</label>
      <input
        className="onboarding-input"
        type="number"
        placeholder="8642"
        value={remotePort}
        onChange={(event) => setRemotePort(event.target.value)}
      />
      {error && <p className="onboarding-error">{error}</p>}
      <div className="onboarding-actions">
        <button type="button" className="onboarding-ghost" onClick={onBack}>
          返回
        </button>
        <button
          type="button"
          className="onboarding-primary"
          disabled={testing || busy || !host.trim() || !username.trim()}
          onClick={() => void connect()}
        >
          {testing ? <Loader2 size={14} className="spin" /> : <KeyRound size={14} />}
          {testing ? "正在连接..." : "建立隧道"}
        </button>
      </div>
    </div>
  );
}

function SetupStep({
  providers,
  busy,
  onConfigure,
  onBack,
  onConfigured,
}: {
  providers: ProviderRegistryEntry[];
  busy: boolean;
  onConfigure: (input: OnboardingConfigureInput) => Promise<void>;
  onBack: () => void;
  onConfigured: () => void;
}) {
  const [selectedId, setSelectedId] = useState(providers[0]?.id ?? "");
  const [apiKey, setApiKey] = useState("");
  const [model, setModel] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [showKey, setShowKey] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const provider = useMemo(
    () => providers.find((entry) => entry.id === selectedId) ?? providers[0],
    [providers, selectedId],
  );
  const needsKey = Boolean(provider) && provider!.authType !== "none" && !provider!.local;
  const isLocal = Boolean(provider?.local);

  const pick = (entry: ProviderRegistryEntry) => {
    setSelectedId(entry.id);
    setBaseUrl(entry.local ? entry.baseUrl : "");
    setApiKey("");
    setError(null);
  };

  const submit = async () => {
    if (!provider) {
      setError("请先选择一个 Provider。");
      return;
    }
    if (!model.trim()) {
      setError("请填写模型名称。");
      return;
    }
    if (needsKey && !apiKey.trim() && !provider.keyPresent) {
      setError("该 Provider 需要 API key。");
      return;
    }
    const effectiveBaseUrl = (isLocal ? baseUrl.trim() : provider.baseUrl) || provider.baseUrl;
    if (isLocal && !effectiveBaseUrl) {
      setError("请填写本地服务地址。");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onConfigure({
        provider: provider.id,
        label: provider.label,
        model: model.trim(),
        baseUrl: effectiveBaseUrl,
        envKey: provider.envKey,
        apiKey: apiKey.trim(),
      });
      onConfigured();
    } catch (e) {
      setError(e instanceof Error ? e.message : "配置失败。");
      setSaving(false);
    }
  };

  if (providers.length === 0) {
    return (
      <div className="onboarding-step">
        <h1>配置模型</h1>
        <p className="onboarding-subtitle">未读取到 Provider 列表，请先完成本地检测或稍后在设置中配置。</p>
        <div className="onboarding-actions">
          <button type="button" className="onboarding-ghost" onClick={onBack}>
            返回
          </button>
          <button type="button" className="onboarding-primary" onClick={onConfigured}>
            跳过
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboarding-step">
      <h1>配置模型</h1>
      <p className="onboarding-subtitle">选择一个 Provider，填写密钥与模型，即可启动 Gateway。</p>

      <div className="onboarding-provider-grid">
        {providers.map((entry) => (
          <button
            key={entry.id}
            type="button"
            className={`onboarding-provider ${entry.id === provider?.id ? "selected" : ""}`}
            onClick={() => pick(entry)}
          >
            {entry.id === provider?.id && (
              <span className="onboarding-provider-check">
                <Check size={11} strokeWidth={3} />
              </span>
            )}
            <strong>{entry.label}</strong>
            <span>{entry.keyPresent ? "已有 key" : entry.local ? "本地" : entry.authType}</span>
          </button>
        ))}
      </div>

      {isLocal && (
        <>
          <label className="onboarding-label">服务地址</label>
          <input
            className="onboarding-input"
            type="text"
            placeholder="http://localhost:1234/v1"
            value={baseUrl}
            onChange={(event) => setBaseUrl(event.target.value)}
          />
        </>
      )}

      {(needsKey || isLocal) && (
        <>
          <label className="onboarding-label">
            API key{isLocal ? "（可选）" : ""}
            {provider?.keyPresent && <span className="onboarding-label-note"> · 已配置，可留空</span>}
          </label>
          <div className="onboarding-input-group">
            <input
              className="onboarding-input"
              type={showKey ? "text" : "password"}
              placeholder={provider?.keyPresent ? "保持现有 key" : "sk-..."}
              value={apiKey}
              onChange={(event) => setApiKey(event.target.value)}
            />
            <button type="button" className="onboarding-reveal" onClick={() => setShowKey((value) => !value)}>
              {showKey ? "隐藏" : "显示"}
            </button>
          </div>
        </>
      )}

      <label className="onboarding-label">模型名称</label>
      <input
        className="onboarding-input"
        type="text"
        placeholder="例如 anthropic/claude-3.5-sonnet"
        value={model}
        onChange={(event) => setModel(event.target.value)}
        onKeyDown={(event) => event.key === "Enter" && void submit()}
      />

      {error && <p className="onboarding-error">{error}</p>}

      <div className="onboarding-actions">
        <button type="button" className="onboarding-ghost" onClick={onBack}>
          返回
        </button>
        <button type="button" className="onboarding-primary" disabled={saving || busy} onClick={() => void submit()}>
          {saving ? <Loader2 size={14} className="spin" /> : <ArrowRight size={16} />}
          {saving ? "正在配置..." : "完成配置"}
        </button>
      </div>
    </div>
  );
}

function DoneStep({ onFinish }: { onFinish: () => void }) {
  return (
    <div className="onboarding-step onboarding-done">
      <div className="onboarding-done-icon">
        <Check size={28} strokeWidth={3} />
      </div>
      <h1>一切就绪</h1>
      <p className="onboarding-subtitle">Hermes 已连接，可以开始对话了。</p>
      <button type="button" className="onboarding-primary" onClick={onFinish}>
        进入 Hermes
        <ArrowRight size={16} />
      </button>
    </div>
  );
}
