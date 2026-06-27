import { useCallback, useEffect, useState } from "react";
import {
  AlertTriangle,
  Copy,
  Eye,
  RefreshCw,
  ShieldCheck,
  Trash2,
  Wallet as WalletIcon,
} from "lucide-react";
import type { TranslationVars } from "../i18n/types";
import {
  createWallet,
  importWallet,
  removeWallet,
  revealWalletMnemonic,
  walletBalances,
  walletStatus,
  type WalletBalance,
  type WalletStatus,
} from "../runtime/hermes-runtime";

interface WalletPaneProps {
  profile: string;
  t: (key: string, vars?: TranslationVars) => string;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

// Compact human-readable balance from a raw integer string + decimals.
function formatBalance(raw: string, decimals: number): string {
  if (!raw || raw === "0") return "0";
  const padded = raw.padStart(decimals + 1, "0");
  const intPart = padded.slice(0, padded.length - decimals).replace(/^0+/, "") || "0";
  const fracPart = padded.slice(padded.length - decimals).replace(/0+$/, "");
  if (intPart.length > 9) return `${intPart.slice(0, -6)}M`;
  if (intPart.length > 6) return `${intPart.slice(0, -3)}K`;
  if (intPart !== "0") {
    return fracPart ? `${intPart}.${fracPart.slice(0, 4)}` : intPart;
  }
  if (!fracPart) return "0";
  const firstNonZero = fracPart.search(/[1-9]/);
  if (firstNonZero >= 4) return "< 0.0001";
  return `0.${fracPart.slice(0, 4)}`;
}

export default function WalletPane({ profile, t }: WalletPaneProps) {
  const [status, setStatus] = useState<WalletStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [tab, setTab] = useState<"create" | "import">("create");
  const [passphrase, setPassphrase] = useState("");
  const [mnemonicInput, setMnemonicInput] = useState("");

  const [balances, setBalances] = useState<WalletBalance[] | null>(null);
  const [balancesLoading, setBalancesLoading] = useState(false);

  const [backupPhrase, setBackupPhrase] = useState<string | null>(null);
  const [revealOpen, setRevealOpen] = useState(false);
  const [revealPass, setRevealPass] = useState("");
  const [revealedPhrase, setRevealedPhrase] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const [copied, setCopied] = useState(false);

  const loadStatus = useCallback(async () => {
    setLoading(true);
    try {
      const result = await walletStatus({ profile });
      setStatus(result);
      setError("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setLoading(false);
    }
  }, [profile]);

  const loadBalances = useCallback(async () => {
    setBalancesLoading(true);
    try {
      const result = await walletBalances({ profile });
      setBalances(result.balances);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBalancesLoading(false);
    }
  }, [profile]);

  useEffect(() => {
    setBalances(null);
    setBackupPhrase(null);
    setRevealedPhrase(null);
    setConfirmRemove(false);
    void loadStatus();
  }, [profile, loadStatus]);

  useEffect(() => {
    if (status?.exists) void loadBalances();
  }, [status?.exists, status?.address, loadBalances]);

  const handleCreate = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const result = await createWallet({ profile, passphrase });
      setBackupPhrase(result.mnemonic);
      setPassphrase("");
      await loadStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [profile, passphrase, loadStatus]);

  const handleImport = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await importWallet({ profile, mnemonic: mnemonicInput, passphrase });
      setPassphrase("");
      setMnemonicInput("");
      await loadStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [profile, mnemonicInput, passphrase, loadStatus]);

  const handleReveal = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      const phrase = await revealWalletMnemonic({ profile, passphrase: revealPass });
      setRevealedPhrase(phrase);
      setRevealPass("");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [profile, revealPass]);

  const handleRemove = useCallback(async () => {
    setBusy(true);
    setError("");
    try {
      await removeWallet({ profile });
      setConfirmRemove(false);
      setBalances(null);
      await loadStatus();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }, [profile, loadStatus]);

  const copyAddress = useCallback(() => {
    if (!status?.address) return;
    void navigator.clipboard.writeText(status.address).then(() => {
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1500);
    });
  }, [status?.address]);

  if (loading) {
    return <div className="wallet-pane"><p className="wallet-muted">{t("common.loading")}</p></div>;
  }

  // One-time backup screen right after creation.
  if (backupPhrase) {
    return (
      <div className="wallet-pane">
        <div className="wallet-backup">
          <div className="wallet-backup-head">
            <AlertTriangle size={18} />
            <h3>{t("wallet.backupTitle")}</h3>
          </div>
          <p className="wallet-warning">{t("wallet.backupWarning")}</p>
          <div className="wallet-mnemonic-box">{backupPhrase}</div>
          <div className="wallet-actions">
            <button
              type="button"
              className="wallet-btn"
              onClick={() => void navigator.clipboard.writeText(backupPhrase)}
            >
              <Copy size={14} />
              <span>{t("wallet.copyMnemonic")}</span>
            </button>
            <button type="button" className="wallet-btn primary" onClick={() => setBackupPhrase(null)}>
              {t("wallet.backupAck")}
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (!status?.exists) {
    return (
      <div className="wallet-pane">
        <div className="wallet-security">
          <ShieldCheck size={15} />
          <span>{t("wallet.securityNote")}</span>
        </div>
        <div className="wallet-tabs">
          <button type="button" className={tab === "create" ? "active" : ""} onClick={() => setTab("create")}>
            {t("wallet.tabCreate")}
          </button>
          <button type="button" className={tab === "import" ? "active" : ""} onClick={() => setTab("import")}>
            {t("wallet.tabImport")}
          </button>
        </div>

        {tab === "import" && (
          <label className="wallet-field">
            <span>{t("wallet.mnemonic")}</span>
            <textarea
              value={mnemonicInput}
              rows={3}
              placeholder={t("wallet.mnemonicPlaceholder")}
              onChange={(e) => setMnemonicInput(e.target.value)}
            />
          </label>
        )}

        <label className="wallet-field">
          <span>{t("wallet.passphrase")}</span>
          <input
            type="password"
            value={passphrase}
            placeholder={t("wallet.passphrasePlaceholder")}
            onChange={(e) => setPassphrase(e.target.value)}
          />
          <small>{t("wallet.passphraseHint")}</small>
        </label>

        {error && <p className="wallet-error">{error}</p>}

        <div className="wallet-actions">
          {tab === "create" ? (
            <button
              type="button"
              className="wallet-btn primary"
              disabled={busy || passphrase.length < 8}
              onClick={() => void handleCreate()}
            >
              <WalletIcon size={14} />
              <span>{t("wallet.createBtn")}</span>
            </button>
          ) : (
            <button
              type="button"
              className="wallet-btn primary"
              disabled={busy || passphrase.length < 8 || !mnemonicInput.trim()}
              onClick={() => void handleImport()}
            >
              <WalletIcon size={14} />
              <span>{t("wallet.importBtn")}</span>
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="wallet-pane">
      <div className="wallet-card">
        <div className="wallet-card-head">
          <span className="wallet-network">Base</span>
          {status.imported && <span className="wallet-imported">{t("wallet.importedTag")}</span>}
        </div>
        <button type="button" className="wallet-address" onClick={copyAddress} title={status.address ?? ""}>
          <span>{status.address}</span>
          <Copy size={13} />
          {copied && <em>{t("wallet.copied")}</em>}
        </button>

        <div className="wallet-balances">
          {(balances ?? []).map((bal) => (
            <div className="wallet-balance-chip" key={bal.token_id} title={bal.error ?? `${bal.raw} (raw)`}>
              <span className="wallet-balance-value">
                {bal.error ? "—" : formatBalance(bal.raw, bal.decimals)}
              </span>
              <span className="wallet-balance-symbol">{bal.symbol}</span>
            </div>
          ))}
          <button
            type="button"
            className="wallet-icon-btn"
            onClick={() => void loadBalances()}
            disabled={balancesLoading}
            aria-label={t("wallet.refreshBalances")}
          >
            <RefreshCw size={13} className={balancesLoading ? "spin" : ""} />
          </button>
        </div>
      </div>

      {error && <p className="wallet-error">{error}</p>}

      <div className="wallet-manage">
        {!revealOpen ? (
          <button type="button" className="wallet-btn" onClick={() => setRevealOpen(true)}>
            <Eye size={14} />
            <span>{t("wallet.reveal")}</span>
          </button>
        ) : revealedPhrase ? (
          <div className="wallet-reveal">
            <p className="wallet-warning">{t("wallet.mnemonicWarning")}</p>
            <div className="wallet-mnemonic-box">{revealedPhrase}</div>
            <button
              type="button"
              className="wallet-btn"
              onClick={() => {
                setRevealedPhrase(null);
                setRevealOpen(false);
              }}
            >
              {t("wallet.hide")}
            </button>
          </div>
        ) : (
          <div className="wallet-reveal">
            <label className="wallet-field">
              <span>{t("wallet.passwordPrompt")}</span>
              <input
                type="password"
                value={revealPass}
                onChange={(e) => setRevealPass(e.target.value)}
                autoFocus
              />
            </label>
            <div className="wallet-actions">
              <button type="button" className="wallet-btn primary" disabled={busy || !revealPass} onClick={() => void handleReveal()}>
                {t("wallet.unlock")}
              </button>
              <button type="button" className="wallet-btn" onClick={() => { setRevealOpen(false); setRevealPass(""); }}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}

        {!confirmRemove ? (
          <button type="button" className="wallet-btn danger" onClick={() => setConfirmRemove(true)}>
            <Trash2 size={14} />
            <span>{t("wallet.remove")}</span>
          </button>
        ) : (
          <div className="wallet-reveal">
            <p className="wallet-warning">{t("wallet.removeConfirm")}</p>
            <div className="wallet-actions">
              <button type="button" className="wallet-btn danger" disabled={busy} onClick={() => void handleRemove()}>
                {t("wallet.removeYes")}
              </button>
              <button type="button" className="wallet-btn" onClick={() => setConfirmRemove(false)}>
                {t("common.cancel")}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
