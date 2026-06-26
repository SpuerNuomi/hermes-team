import { useCallback, useEffect, useRef, useState } from "react";
import {
  Brain,
  MessageSquareText,
  Plug,
  Plug2,
  Puzzle,
  Settings,
  Signal,
  Sparkles,
  Trash2,
  User,
  Wallet,
  X,
  type LucideIcon,
} from "lucide-react";
import ProfileAvatar from "./ProfileAvatar";
import { PROFILE_COLORS, defaultColorForName } from "./profileColors";
import { fileToAvatarDataUrl } from "./profileImage";
import {
  readHermesPersona,
  removeHermesProfileAvatar,
  setHermesProfileAvatar,
  setHermesProfileColor,
  writeHermesPersona,
  type HermesProfileInfo,
} from "../runtime/hermes-runtime";

type ProfileSection = "profile" | "persona" | "advanced";

interface ProfileDetailModalProps {
  profile: HermesProfileInfo;
  /** Whether the parent is mid-mutation (activate/delete from the list). */
  busy?: boolean;
  onClose: () => void;
  /** Called with the refreshed profile list after a color/avatar mutation. */
  onProfilesChanged: (profiles: HermesProfileInfo[]) => void;
  /** Re-fetch the profile list (used after persona writes flip `hasSoul`). */
  onRefresh: () => void;
  onActivate: (name: string, openChat?: boolean) => void;
  onDeleted: (name: string) => void;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

const SECTIONS: ReadonlyArray<{
  id: ProfileSection;
  label: string;
  Icon: LucideIcon;
}> = [
  { id: "profile", label: "概览与外观", Icon: User },
  { id: "persona", label: "Persona", Icon: Sparkles },
  { id: "advanced", label: "高级", Icon: Settings },
];

function providerLabel(provider: string): string {
  if (!provider || provider === "auto") return "auto";
  if (provider === "custom") return "local";
  return provider.charAt(0).toUpperCase() + provider.slice(1);
}

/**
 * Profile detail modal: a focused, large dialog for one Hermes profile. Lets
 * the user set the avatar / accent color (persisted to `profile-meta.json`),
 * edit the persona (`SOUL.md` via the real persona commands), and run the
 * guarded delete. Wallet is intentionally omitted (not supported here).
 */
export default function ProfileDetailModal({
  profile,
  busy = false,
  onClose,
  onProfilesChanged,
  onRefresh,
  onActivate,
  onDeleted,
}: ProfileDetailModalProps) {
  const [section, setSection] = useState<ProfileSection>("profile");
  const [error, setError] = useState("");
  const [working, setWorking] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [personaContent, setPersonaContent] = useState("");
  const [personaDraft, setPersonaDraft] = useState("");
  const [personaPath, setPersonaPath] = useState("");
  const [personaLoading, setPersonaLoading] = useState(false);
  const [personaSaving, setPersonaSaving] = useState(false);
  const [personaLoaded, setPersonaLoaded] = useState(false);

  const [confirmDelete, setConfirmDelete] = useState(false);

  const name = profile.name;
  const activeColor = profile.color || defaultColorForName(name);

  useEffect(() => {
    setConfirmDelete(false);
    setError("");
  }, [name]);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  const loadPersona = useCallback(async () => {
    setPersonaLoading(true);
    setError("");
    try {
      const result = await readHermesPersona({ profile: name });
      setPersonaContent(result.content);
      setPersonaDraft(result.content);
      setPersonaPath(result.path);
      setPersonaLoaded(true);
    } catch (loadError) {
      setError(`读取 Persona 失败：${errorMessage(loadError)}`);
    } finally {
      setPersonaLoading(false);
    }
  }, [name]);

  useEffect(() => {
    setPersonaLoaded(false);
    setPersonaContent("");
    setPersonaDraft("");
  }, [name]);

  useEffect(() => {
    if (section === "persona" && !personaLoaded && !personaLoading) {
      void loadPersona();
    }
  }, [section, personaLoaded, personaLoading, loadPersona]);

  const personaDirty = personaDraft !== personaContent;

  async function handlePickColor(color: string) {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const next = await setHermesProfileColor({ name, color });
      onProfilesChanged(next);
    } catch (colorError) {
      setError(`设置强调色失败：${errorMessage(colorError)}`);
    } finally {
      setWorking(false);
    }
  }

  async function handleAvatarFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    setWorking(true);
    setError("");
    try {
      const dataUrl = await fileToAvatarDataUrl(file);
      const next = await setHermesProfileAvatar({ name, avatar: dataUrl });
      onProfilesChanged(next);
    } catch (avatarError) {
      setError(`上传头像失败：${errorMessage(avatarError)}`);
    } finally {
      setWorking(false);
    }
  }

  async function handleRemoveAvatar() {
    if (working) return;
    setWorking(true);
    setError("");
    try {
      const next = await removeHermesProfileAvatar({ name });
      onProfilesChanged(next);
    } catch (removeError) {
      setError(`移除头像失败：${errorMessage(removeError)}`);
    } finally {
      setWorking(false);
    }
  }

  async function handleSavePersona() {
    setPersonaSaving(true);
    setError("");
    try {
      const result = await writeHermesPersona({ profile: name, content: personaDraft });
      setPersonaContent(result.content);
      setPersonaDraft(result.content);
      setPersonaPath(result.path);
      onRefresh();
    } catch (saveError) {
      setError(`保存 Persona 失败：${errorMessage(saveError)}`);
    } finally {
      setPersonaSaving(false);
    }
  }

  const stats: ReadonlyArray<{
    key: string;
    value: string;
    Icon: LucideIcon;
    state?: "on" | "off";
  }> = [
    { key: "provider", value: providerLabel(profile.provider), Icon: Plug },
    {
      key: "model",
      value: profile.model ? profile.model.split("/").pop() || profile.model : "no model",
      Icon: Brain,
    },
    { key: "skills", value: `${profile.skillCount} skills`, Icon: Puzzle },
    {
      key: "gateway",
      value: profile.gatewayRunning ? "gateway on" : "gateway off",
      Icon: Signal,
      state: profile.gatewayRunning ? "on" : "off",
    },
  ];

  const busyAll = busy || working;

  return (
    <div className="profile-detail-overlay" onMouseDown={onClose}>
      <div
        className="profile-detail-modal"
        role="dialog"
        aria-modal="true"
        aria-label={`Profile ${name}`}
        onMouseDown={(event) => event.stopPropagation()}
      >
        <header className="profile-detail-header">
          <div className="profile-detail-header-main">
            <ProfileAvatar name={name} color={profile.color} avatar={profile.avatar} size={30} />
            <div>
              <strong>{name}</strong>
              <span>{profile.home}</span>
            </div>
          </div>
          <button type="button" className="profile-detail-close" onClick={onClose} aria-label="关闭">
            <X size={18} />
          </button>
        </header>

        <div className="profile-detail-layout">
          <nav className="profile-detail-nav">
            {SECTIONS.map((item) => (
              <button
                key={item.id}
                type="button"
                className={`profile-detail-nav-item ${section === item.id ? "active" : ""}`}
                onClick={() => setSection(item.id)}
              >
                <item.Icon size={16} />
                <span>{item.label}</span>
              </button>
            ))}
            <span className="profile-detail-nav-note">
              <Wallet size={14} />
              <span>钱包暂不支持</span>
            </span>
          </nav>

          <div className="profile-detail-content">
            {section === "profile" && (
              <div className="profile-detail-pane">
                <div className="profile-detail-identity">
                  <ProfileAvatar name={name} color={profile.color} avatar={profile.avatar} size={88} />
                  <div className="profile-detail-identity-meta">
                    <div className="profile-detail-name-row">
                      <span className="profile-detail-name">{name}</span>
                      {profile.active ? (
                        <em className="profile-detail-tag active">active</em>
                      ) : profile.isDefault ? (
                        <em className="profile-detail-tag">default</em>
                      ) : null}
                    </div>
                    <div className="profile-detail-image-actions">
                      <button
                        type="button"
                        disabled={busyAll}
                        onClick={() => fileInputRef.current?.click()}
                      >
                        上传头像
                      </button>
                      {profile.avatar && (
                        <button type="button" disabled={busyAll} onClick={() => void handleRemoveAvatar()}>
                          移除头像
                        </button>
                      )}
                      {!profile.active && (
                        <button type="button" disabled={busyAll} onClick={() => onActivate(name)}>
                          <Plug2 size={14} />
                          <span>激活</span>
                        </button>
                      )}
                      <button type="button" disabled={busyAll} onClick={() => onActivate(name, true)}>
                        <MessageSquareText size={14} />
                        <span>聊天</span>
                      </button>
                    </div>
                  </div>
                </div>

                <div className="profile-detail-stats">
                  {stats.map(({ key, value, Icon, state }) => (
                    <span className={`profile-detail-stat ${state ? `is-${state}` : ""}`} key={key}>
                      <Icon size={14} />
                      {value}
                    </span>
                  ))}
                </div>

                <div className="profile-detail-section">
                  <span className="profile-detail-label">强调色</span>
                  <div className="profile-detail-swatches">
                    {PROFILE_COLORS.map((color) => (
                      <button
                        key={color}
                        type="button"
                        disabled={busyAll}
                        className={`profile-detail-swatch ${
                          activeColor.toLowerCase() === color.toLowerCase() ? "active" : ""
                        }`}
                        style={{ background: color }}
                        title={color}
                        aria-label={color}
                        onClick={() => void handlePickColor(color)}
                      />
                    ))}
                  </div>
                </div>

                {error && <div className="profile-detail-error">{error}</div>}
              </div>
            )}

            {section === "persona" && (
              <div className="profile-detail-pane profile-detail-persona">
                <div className="profile-detail-persona-head">
                  <div>
                    <span className="profile-detail-label">Persona · SOUL.md</span>
                    <small>{personaPath || `${profile.home}/SOUL.md`}</small>
                  </div>
                  <div className="profile-detail-image-actions">
                    <button type="button" disabled={personaLoading} onClick={() => void loadPersona()}>
                      重新加载
                    </button>
                    <button
                      type="button"
                      className="primary"
                      disabled={personaSaving || personaLoading || !personaDirty}
                      onClick={() => void handleSavePersona()}
                    >
                      {personaSaving ? "保存中..." : personaDirty ? "保存" : "已保存"}
                    </button>
                  </div>
                </div>
                <textarea
                  className="profile-detail-persona-editor"
                  value={personaDraft}
                  spellCheck={false}
                  disabled={personaLoading}
                  placeholder={
                    personaLoading
                      ? "正在读取 SOUL.md ..."
                      : "为该 profile 定义 persona / SOUL（系统人格）。保存后写入 profile 的 SOUL.md。"
                  }
                  onChange={(event) => setPersonaDraft(event.target.value)}
                />
                {error && <div className="profile-detail-error">{error}</div>}
              </div>
            )}

            {section === "advanced" && (
              <div className="profile-detail-pane">
                {profile.isDefault ? (
                  <p className="profile-detail-danger-info">default profile 不能删除。</p>
                ) : (
                  <div className="profile-detail-danger">
                    <span className="profile-detail-label danger">危险操作</span>
                    <p className="profile-detail-danger-info">
                      删除该 profile 会调用 Hermes CLI 永久删除对应 profile 目录与配置，无法撤销。
                    </p>
                    {confirmDelete ? (
                      <div className="profile-detail-danger-confirm">
                        <span>确认删除 profile「{name}」？</span>
                        <div className="profile-detail-image-actions">
                          <button
                            type="button"
                            className="danger"
                            disabled={busyAll}
                            onClick={() => onDeleted(name)}
                          >
                            <Trash2 size={14} />
                            <span>确认删除</span>
                          </button>
                          <button type="button" disabled={busyAll} onClick={() => setConfirmDelete(false)}>
                            取消
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        className="danger-ghost"
                        disabled={busyAll}
                        onClick={() => setConfirmDelete(true)}
                      >
                        <Trash2 size={14} />
                        <span>删除 Profile</span>
                      </button>
                    )}
                  </div>
                )}
                {error && <div className="profile-detail-error">{error}</div>}
              </div>
            )}
          </div>
        </div>

        <footer className="profile-detail-footer">
          <button type="button" className="primary" onClick={onClose}>
            完成
          </button>
        </footer>

        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          style={{ display: "none" }}
          onChange={(event) => void handleAvatarFile(event)}
        />
      </div>
    </div>
  );
}
