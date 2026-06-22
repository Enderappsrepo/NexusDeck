import { useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/commands";
import { useAuthStore, useGamesStore, useSettingsStore } from "@/stores";
import { useDownloadsStore } from "@/stores/downloadsStore";
import { useInstallQueueStore } from "@/stores/installQueueStore";
import { useLaunchStore } from "@/stores/launchStore";
import type { AppResetResult } from "@/lib/nexus/types";

interface ResetAppDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

function clearLocalPreferences() {
  for (const key of Object.keys(localStorage)) {
    if (key.startsWith("nexusdeck_")) {
      localStorage.removeItem(key);
    }
  }
}

export function ResetAppDialog({ open, onOpenChange }: ResetAppDialogProps) {
  const navigate = useNavigate();
  const [clearCache, setClearCache] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AppResetResult | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === "RESET";

  const reset = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.resetApp(clearCache);
      clearLocalPreferences();
      useAuthStore.setState({ user: null, error: null });
      useGamesStore.setState({ profiles: [] });
      useDownloadsStore.setState({
        active: {},
        errors: {},
        hydrated: true,
        autoInstallIds: new Set(),
      });
      useInstallQueueStore.setState({
        jobs: [],
        activeJobId: null,
        pendingByDownloadId: {},
        installPrompt: null,
        profileError: null,
        profileErrorDomain: null,
      });
      await useSettingsStore.getState().loadSettings();
      await useLaunchStore.getState().loadSettings();
      setResult(r);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy) return;
    onOpenChange(false);
    setConfirmText("");
    setError("");
    setResult(null);
  };

  const finish = () => {
    close();
    navigate({ to: "/onboarding" });
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Reset NexusDeck"
      description="Erase all profiles, mod lists, downloads, launch presets, and your saved API key. Your game installs and staging folders are not deleted."
      dismissible={!busy}
      disableOutsideClose={busy}
    >
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" />
              <p>
                This cannot be undone. Back up any profiles first if you want to restore them later.
              </p>
            </div>

            <div className="space-y-3 rounded-xl bg-[var(--color-secondary)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Clear scratch &amp; preview cache</Label>
                  <p className="text-xs text-[var(--color-muted)]">
                    Removes temporary extraction and preview files from app data.
                  </p>
                </div>
                <Switch checked={clearCache} onCheckedChange={setClearCache} data-focusable="true" />
              </div>
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-[var(--color-muted)]">
                Type <strong>RESET</strong> to confirm
              </span>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="RESET"
                autoComplete="off"
                data-focusable="true"
              />
            </label>

            {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={close} disabled={busy} data-focusable="true">
                Cancel
              </Button>
              <Button
                variant="danger"
                onClick={() => void reset()}
                disabled={busy || !confirmed}
                data-focusable="true"
              >
                {busy ? "Resetting…" : "Reset app"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[var(--color-success)]">
              NexusDeck has been reset. You&apos;ll go through setup again.
            </p>
            <ul className="space-y-1 text-sm text-[var(--color-muted)]">
              {result.database_cleared && <li>Database cleared</li>}
              {result.api_key_cleared && <li>API key removed</li>}
              {result.cache_cleared && <li>Scratch cache cleared</li>}
              {result.onboarding_reset && <li>Onboarding restarted</li>}
            </ul>
            <Button onClick={finish} data-focusable="true">
              Continue to setup
            </Button>
          </>
        )}
      </div>
    </AppDialog>
  );
}
