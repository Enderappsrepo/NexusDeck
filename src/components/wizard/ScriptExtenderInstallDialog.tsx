import { useEffect, useState } from "react";
import { open as pickFile } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Download, ExternalLink, FolderOpen, RefreshCw, ShieldCheck } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import { getGameMeta } from "@/lib/games";
import type { ScriptExtenderInstallInfo, ScriptExtenderStatus } from "@/lib/nexus/types";

interface ScriptExtenderInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  domain: string;
  gamePath: string;
  onInstalled?: (status: ScriptExtenderStatus) => void;
}

export function ScriptExtenderInstallDialog({
  open,
  onOpenChange,
  domain,
  gamePath,
  onInstalled,
}: ScriptExtenderInstallDialogProps) {
  const [status, setStatus] = useState<ScriptExtenderStatus | null>(null);
  const [info, setInfo] = useState<ScriptExtenderInstallInfo | null>(null);
  const [configureLauncher, setConfigureLauncher] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const label = info?.label ?? getGameMeta(domain)?.script_extender_label ?? "Script extender";

  useEffect(() => {
    if (!open || !gamePath) return;
    setError(null);
    api.detectScriptExtender(domain, gamePath).then(setStatus);
    api.getScriptExtenderInstallInfo(domain, gamePath).then(setInfo).catch(() => setInfo(null));
  }, [open, gamePath, domain]);

  const refresh = async () => {
    const next = await api.detectScriptExtender(domain, gamePath);
    setStatus(next);
    onInstalled?.(next);
  };

  const install = async () => {
    setLoading(true);
    setError(null);
    try {
      const next = await api.installScriptExtender(domain, gamePath, configureLauncher);
      setStatus(next);
      onInstalled?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const installFromFile = async () => {
    const selected = await pickFile({
      multiple: false,
      filters: [{ name: "Script extender archive", extensions: ["7z", "zip"] }],
    });
    if (!selected || typeof selected !== "string") return;

    setLoading(true);
    setError(null);
    try {
      const next = await api.installScriptExtenderFromArchive(
        domain,
        gamePath,
        selected,
        configureLauncher
      );
      setStatus(next);
      onInstalled?.(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  };

  const canAutoInstall = info?.supports_auto_download ?? false;
  const canPatchLauncher = info?.supports_steam_launcher_patch ?? false;
  const versionMismatch = status?.version_compatible === false;
  const canInstall = !status?.installed || versionMismatch;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`${label} — Script Extender`}
      description={`${label} is required for most mods. NexusDeck can install it into your game folder.`}
    >
      <div className="space-y-4">
        {status && (
          <div className="rounded-xl bg-[var(--color-secondary)] p-4">
            <div className="flex items-center gap-2">
              <ShieldCheck className="h-5 w-5" />
              <Badge variant={status.installed && !versionMismatch ? "success" : "warning"}>
                {status.installed
                  ? versionMismatch
                    ? "Wrong version"
                    : "Installed"
                  : "Not installed"}
              </Badge>
            </div>
            <p className="mt-2 text-sm">{status.message}</p>
            {status.loader_path && (
              <p className="mt-1 text-xs text-[var(--color-muted)]">{status.loader_path}</p>
            )}
          </div>
        )}

        {info && (
          <div className="text-sm text-[var(--color-muted)]">
            {info.game_version && (
              <p>
                Detected game version:{" "}
                <span className="text-[var(--color-foreground)]">{info.game_version}</span>
              </p>
            )}
            {info.recommended_extender_version && (
              <p className="mt-1">
                Recommended {label} build:{" "}
                <span className="text-[var(--color-foreground)]">
                  {info.recommended_extender_version}
                </span>
              </p>
            )}
            {info.installed_extender_game_version && (
              <p className="mt-1">
                Installed {label} targets game:{" "}
                <span className="text-[var(--color-foreground)]">
                  {info.installed_extender_game_version}
                </span>
              </p>
            )}
            <p className="mt-1">Runtime: {info.runtime}</p>
            <p className="mt-1">{info.notes}</p>
            {versionMismatch && (
              <p className="mt-2 text-[var(--color-warning)]">
                Your {label} build does not match this game version. Re-install to fix MCM, plugins,
                and launch issues.
              </p>
            )}
            {!canAutoInstall && (
              <p className="mt-2">
                Auto-download is not available for {label}. Download the archive from the website
                and use <span className="text-[var(--color-foreground)]">Install from file</span>.
              </p>
            )}
            {canAutoInstall && (
              <p className="mt-2">
                If auto-download fails, use{" "}
                <span className="text-[var(--color-foreground)]">Install from file</span> with the
                correct build for your game version.
              </p>
            )}
          </div>
        )}

        {canPatchLauncher && (
          <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-4">
            <input
              type="checkbox"
              checked={configureLauncher}
              onChange={(e) => setConfigureLauncher(e.target.checked)}
              className="focusable mt-1 h-5 w-5 accent-[var(--color-primary)]"
              data-focusable="true"
            />
            <div>
              <p className="font-medium">Configure Steam launcher</p>
              <p className="text-sm text-[var(--color-muted)]">
                Backs up the original launcher and routes Steam launches through {label}.
                Recommended for Steam Deck and Proton.
              </p>
            </div>
          </label>
        )}

        {error && (
          <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          {canAutoInstall && (
            <Button size="lg" onClick={install} disabled={loading || !canInstall} data-focusable="true">
              <Download className="h-5 w-5" />
              {loading
                ? "Installing..."
                : versionMismatch
                  ? `Re-install ${label}`
                  : status?.installed
                    ? "Already installed"
                    : `Install ${label}`}
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            onClick={installFromFile}
            disabled={loading || (status?.installed && !versionMismatch)}
            data-focusable="true"
          >
            <FolderOpen className="h-5 w-5" />
            Install from file
          </Button>
          <Button
            variant="secondary"
            onClick={() => info && openUrl(info.website_url)}
            disabled={!info?.website_url}
            data-focusable="true"
          >
            <ExternalLink className="h-5 w-5" />
            Open website
          </Button>
          <Button variant="outline" onClick={refresh} data-focusable="true">
            <RefreshCw className="h-5 w-5" />
            Re-check
          </Button>
        </div>
      </div>
    </AppDialog>
  );
}

/** @deprecated Use ScriptExtenderInstallDialog with domain="fallout4" */
export function F4seInstallDialog(
  props: Omit<ScriptExtenderInstallDialogProps, "domain"> & { domain?: string }
) {
  return <ScriptExtenderInstallDialog {...props} domain={props.domain ?? "fallout4"} />;
}
