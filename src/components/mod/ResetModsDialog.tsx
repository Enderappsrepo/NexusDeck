import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { AppDialog } from "@/components/ui/dialog";
import { api } from "@/lib/commands";
import type { ResetProfileResult } from "@/lib/nexus/types";

interface ResetModsDialogProps {
  profileId: string;
  profileName: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onComplete?: () => void;
}

export function ResetModsDialog({
  profileId,
  profileName,
  open,
  onOpenChange,
  onComplete,
}: ResetModsDialogProps) {
  const [backupBefore, setBackupBefore] = useState(true);
  const [clearStaging, setClearStaging] = useState(true);
  const [clearDownloads, setClearDownloads] = useState(true);
  const [resetPluginsTxt, setResetPluginsTxt] = useState(true);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<ResetProfileResult | null>(null);
  const [error, setError] = useState("");

  const reset = async () => {
    setBusy(true);
    setError("");
    setResult(null);
    try {
      const r = await api.resetProfileMods({
        profileId,
        backupBefore,
        clearStaging,
        clearDownloads,
        resetPluginsTxt,
      });
      setResult(r);
      onComplete?.();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    onOpenChange(false);
    setResult(null);
    setError("");
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title={`Reset mods — ${profileName}`}
      description="Remove all installed mods and start fresh. Your game files and saves are not deleted unless you choose to clear staging downloads."
      dismissible={!busy}
      disableOutsideClose={busy}
    >
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="space-y-3 rounded-xl bg-[var(--color-secondary)] p-4">
              <div className="flex items-center justify-between gap-4">
                <Label>Backup profile before reset</Label>
                <Switch checked={backupBefore} onCheckedChange={setBackupBefore} data-focusable="true" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label>Clear download queue &amp; staging files</Label>
                <Switch checked={clearStaging} onCheckedChange={setClearStaging} data-focusable="true" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label>Remove downloaded archives</Label>
                <Switch checked={clearDownloads} onCheckedChange={setClearDownloads} data-focusable="true" />
              </div>
              <div className="flex items-center justify-between gap-4">
                <Label>Reset plugins.txt to vanilla</Label>
                <Switch checked={resetPluginsTxt} onCheckedChange={setResetPluginsTxt} data-focusable="true" />
              </div>
            </div>
            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={close} disabled={busy} data-focusable="true">
                Cancel
              </Button>
              <Button variant="danger" onClick={() => void reset()} disabled={busy} data-focusable="true">
                {busy ? "Resetting…" : "Reset all mods"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[var(--color-success)]">
              Removed {result.mods_removed} mod(s).
              {result.downloads_cleared > 0 && ` Cleared ${result.downloads_cleared} download(s).`}
            </p>
            {result.backup_path && (
              <p className="text-sm text-[var(--color-muted)]">Backup: {result.backup_path}</p>
            )}
            {result.warnings.length > 0 && (
              <ul className="max-h-32 list-inside list-disc overflow-auto text-sm text-[var(--color-warning)]">
                {result.warnings.map((w) => (
                  <li key={w}>{w}</li>
                ))}
              </ul>
            )}
            <Button onClick={close} data-focusable="true">
              Done
            </Button>
          </>
        )}
      </div>
    </AppDialog>
  );
}
