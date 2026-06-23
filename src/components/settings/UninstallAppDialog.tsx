import { useEffect, useState } from "react";
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
import type { AppUninstallResult } from "@/lib/nexus/types";

interface UninstallAppDialogProps {
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

function clearClientStores() {
  clearLocalPreferences();
  useAuthStore.setState({ user: null, error: null });
  useGamesStore.setState({ profiles: [], loading: false });
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
}

export function UninstallAppDialog({ open, onOpenChange }: UninstallAppDialogProps) {
  const [clearAllData, setClearAllData] = useState(true);
  const [clearStaging, setClearStaging] = useState(false);
  const [clearCache, setClearCache] = useState(true);
  const [confirmText, setConfirmText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<AppUninstallResult | null>(null);

  const confirmed = confirmText.trim().toUpperCase() === "UNINSTALL";

  useEffect(() => {
    if (clearAllData) {
      setClearCache(true);
    }
  }, [clearAllData]);

  const uninstall = async () => {
    setBusy(true);
    setError("");
    try {
      const r = await api.uninstallNexusdeck({
        clearAllData,
        clearStaging,
        clearCache: clearAllData || clearCache,
      });
      clearClientStores();
      await useSettingsStore.getState().loadSettings().catch(() => undefined);
      await useLaunchStore.getState().loadSettings().catch(() => undefined);
      setResult(r);
      window.setTimeout(() => {
        void api.exitApp();
      }, 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    if (busy || result) return;
    onOpenChange(false);
    setConfirmText("");
    setError("");
    setResult(null);
    setClearAllData(true);
    setClearStaging(false);
    setClearCache(true);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={(next) => (next ? onOpenChange(true) : close())}
      title="Uninstall NexusDeck"
      description="Remove NexusDeck from your system. You can optionally wipe all app data to start completely fresh."
      dismissible={!busy && !result}
      disableOutsideClose={busy || !!result}
    >
      <div className="space-y-4">
        {!result ? (
          <>
            <div className="flex items-start gap-3 rounded-xl border border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10 p-4 text-sm">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-danger)]" />
              <p>
                Mod files already deployed in your game folder are not removed. Only NexusDeck
                settings, library records, and optional staging folders are affected.
              </p>
            </div>

            <div className="space-y-3 rounded-xl bg-[var(--color-secondary)] p-4">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Delete all NexusDeck data</Label>
                  <p className="text-xs text-[var(--color-muted)]">
                    Profiles, mod library, downloads, API key, and settings — start fresh next install.
                  </p>
                </div>
                <Switch
                  checked={clearAllData}
                  onCheckedChange={setClearAllData}
                  data-focusable="true"
                />
              </div>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <Label>Delete staging folders</Label>
                  <p className="text-xs text-[var(--color-muted)]">
                    Removes downloaded archives and tools under your NexusDeck staging paths.
                  </p>
                </div>
                <Switch
                  checked={clearStaging}
                  onCheckedChange={setClearStaging}
                  data-focusable="true"
                />
              </div>
              {!clearAllData && (
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <Label>Clear scratch &amp; preview cache</Label>
                    <p className="text-xs text-[var(--color-muted)]">
                      Temporary extraction and preview files only.
                    </p>
                  </div>
                  <Switch
                    checked={clearCache}
                    onCheckedChange={setClearCache}
                    data-focusable="true"
                  />
                </div>
              )}
            </div>

            <label className="block space-y-2">
              <span className="text-sm text-[var(--color-muted)]">
                Type <strong>UNINSTALL</strong> to confirm
              </span>
              <Input
                value={confirmText}
                onChange={(e) => setConfirmText(e.target.value)}
                placeholder="UNINSTALL"
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
                onClick={() => void uninstall()}
                disabled={busy || !confirmed}
                data-focusable="true"
              >
                {busy ? "Uninstalling…" : "Uninstall NexusDeck"}
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-[var(--color-success)]">{result.message}</p>
            <ul className="space-y-1 text-sm text-[var(--color-muted)]">
              {result.data_cleared && <li>App data removed</li>}
              {result.staging_cleared && <li>Staging folders removed</li>}
              {result.cache_cleared && <li>Cache cleared</li>}
              {result.steam_shortcut_removed && <li>Steam shortcut removed</li>}
              {result.uninstall_scheduled && <li>App uninstall scheduled</li>}
            </ul>
            <p className="text-sm text-[var(--color-muted)]">
              NexusDeck will close in a moment…
            </p>
          </>
        )}
      </div>
    </AppDialog>
  );
}
