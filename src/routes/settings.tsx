import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore, useSettingsStore } from "@/stores";
import { api } from "@/lib/commands";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { AddToSteamPanel } from "@/components/steam/AddToSteamPanel";
import { ResetModsDialog } from "@/components/mod/ResetModsDialog";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const { user, logout } = useAuthStore();
  const { profiles, loadProfiles } = useGamesStore();
  const {
    downloadSettings,
    batteryMode,
    loading: settingsLoading,
    gyroScroll,
    loadSettings,
    setDownloadSettings,
    setBatteryMode,
    setGyroScroll,
  } = useSettingsStore();
  const launchSettings = useLaunchStore((s) => s.settings);
  const loadLaunchSettings = useLaunchStore((s) => s.loadSettings);
  const saveLaunchSettings = useLaunchStore((s) => s.saveSettings);
  const [paths, setPaths] = useState<{ config_dir: string; data_dir: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(downloadSettings.max_concurrent);
  const [speedLimit, setSpeedLimit] = useState(downloadSettings.speed_limit_kbps);
  const [autoSortAfterInstall, setAutoSortAfterInstall] = useState(
    () => localStorage.getItem("nexusdeck_auto_sort_after_install") === "true"
  );
  const [autoInstallAfterDownload, setAutoInstallAfterDownload] = useState(
    () => downloadSettings.auto_install_after_download ?? false
  );
  const [clearDownloadAfterInstall, setClearDownloadAfterInstall] = useState(
    () => localStorage.getItem("nexusdeck_clear_download_after_install") !== "false"
  );
  const [resetProfile, setResetProfile] = useState<{ id: string; name: string } | null>(null);
  const [appVersion, setAppVersion] = useState<string | null>(null);

  useEffect(() => {
    loadProfiles();
    loadSettings();
    loadLaunchSettings();
    api.getAppPaths().then(setPaths);
    api.getPlatformInfo().then((p) => setAppVersion(p.app_version)).catch(() => {});
  }, [loadProfiles, loadSettings, loadLaunchSettings]);

  useEffect(() => {
    setMaxConcurrent(downloadSettings.max_concurrent);
    setSpeedLimit(downloadSettings.speed_limit_kbps);
    setAutoInstallAfterDownload(downloadSettings.auto_install_after_download ?? false);
  }, [downloadSettings]);

  const exportDiag = async () => {
    const d = await api.exportDiagnostics();
    setDiagnostics(d);
  };

  const backup = async (profileId: string) => {
    const dest = `${paths?.config_dir}/backup-${profileId}.json`;
    await api.backupProfile(profileId, dest);
    alert(`Backup saved to ${dest}`);
  };

  const restore = async () => {
    const selected = await open({
      multiple: false,
      filters: [{ name: "Backup", extensions: ["json"] }],
    });
    if (typeof selected === "string") {
      await api.restoreProfile(selected);
      await loadProfiles();
      alert("Profile restored.");
    }
  };

  const saveDownloadSettings = async () => {
    await setDownloadSettings({
      max_concurrent: maxConcurrent,
      speed_limit_kbps: speedLimit,
      auto_install_after_download: autoInstallAfterDownload,
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6" data-scroll-pane>
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Settings</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          Account, downloads, launch behavior, and diagnostics.
        </p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <>
              <p>Signed in as <strong>{user.name}</strong></p>
              {user.is_premium && <p className="text-[var(--color-success)]">Premium member</p>}
              <Button variant="danger" onClick={logout} data-focusable="true">Sign Out</Button>
            </>
          ) : (
            <p className="text-[var(--color-muted)]">Not signed in</p>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Download settings</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="block space-y-2">
            <span className="text-sm text-[var(--color-muted)]">Max concurrent downloads</span>
            <Input
              type="number"
              min={1}
              max={8}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--color-muted)]">
              Speed limit (KB/s, 0 = unlimited)
            </span>
            <Input
              type="number"
              min={0}
              value={speedLimit}
              onChange={(e) => setSpeedLimit(Number(e.target.value))}
            />
          </label>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Auto-install after download</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Skip the install prompt and open the install wizard automatically when a download finishes.
              </p>
            </div>
            <Switch
              checked={autoInstallAfterDownload}
              onCheckedChange={setAutoInstallAfterDownload}
              data-focusable="true"
            />
          </div>
          <Button onClick={saveDownloadSettings} disabled={settingsLoading} data-focusable="true">
            Save download settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Mod library</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Clear completed downloads after install</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Remove download rows from the queue once a mod finishes installing.
              </p>
            </div>
            <Switch
              checked={clearDownloadAfterInstall}
              onCheckedChange={(checked) => {
                localStorage.setItem("nexusdeck_clear_download_after_install", String(checked));
                setClearDownloadAfterInstall(checked);
              }}
              data-focusable="true"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Auto-sort load order after install</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Apply LOOT and category rules whenever a mod finishes installing.
              </p>
            </div>
            <Switch
              checked={autoSortAfterInstall}
              onCheckedChange={(checked) => {
                localStorage.setItem("nexusdeck_auto_sort_after_install", String(checked));
                setAutoSortAfterInstall(checked);
              }}
              data-focusable="true"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steam Deck</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Battery mode</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Prefer lighter downloads and disable heavy visual mods on battery.
              </p>
            </div>
            <Switch checked={batteryMode} onCheckedChange={setBatteryMode} data-focusable="true" />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Gyro scroll preset</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Use Steam Input to map gyro or right stick to scroll in lists (see docs).
              </p>
            </div>
            <Switch checked={gyroScroll} onCheckedChange={setGyroScroll} data-focusable="true" />
          </div>
          <div className="rounded-xl bg-[var(--color-secondary)] p-4 text-sm text-[var(--color-muted)]">
            <p className="font-medium text-[var(--color-foreground)]">Gamepad shortcuts</p>
            <ul className="mt-2 space-y-1">
              <li>{GAMEPAD_HINTS.navigate}: Navigate focus</li>
              <li>{GAMEPAD_HINTS.confirm}: Confirm / select</li>
              <li>{GAMEPAD_HINTS.back}: Go back</li>
              <li>{GAMEPAD_HINTS.tabs}: Switch tabs (L1 / R1)</li>
              <li>{GAMEPAD_HINTS.scroll}: Scroll / reorder (L2 / R2)</li>
              <li>{GAMEPAD_HINTS.secondary}: Secondary action (X)</li>
              <li>{GAMEPAD_HINTS.launch}: Quick launch / context (Y)</li>
              <li>{GAMEPAD_HINTS.menu}: Search / command palette (Menu)</li>
            </ul>
            <p className="mt-3">
              <a
                href="docs/steam-input.md"
                className="text-[var(--color-primary)] underline"
              >
                Steam Input profile guide (docs/steam-input.md)
              </a>
            </p>
          </div>
        </CardContent>
      </Card>

      <AddToSteamPanel />

      <Card>
        <CardHeader>
          <CardTitle>Launch</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Always ask before launching</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Show confirmation when warnings are detected.
              </p>
            </div>
            <Switch
              checked={launchSettings.always_ask_before_launch}
              onCheckedChange={(checked) =>
                saveLaunchSettings({ ...launchSettings, always_ask_before_launch: checked })
              }
              data-focusable="true"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Safe Launch by default</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Backup plugins.txt and saves before each launch.
              </p>
            </div>
            <Switch
              checked={launchSettings.safe_launch_default}
              onCheckedChange={(checked) =>
                saveLaunchSettings({ ...launchSettings, safe_launch_default: checked })
              }
              data-focusable="true"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Close NexusDeck after launch</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Exit the app once the game starts (Steam Deck friendly).
              </p>
            </div>
            <Switch
              checked={launchSettings.close_app_after_launch}
              onCheckedChange={(checked) =>
                saveLaunchSettings({ ...launchSettings, close_app_after_launch: checked })
              }
              data-focusable="true"
            />
          </div>
          <p className="text-sm text-[var(--color-muted)]">
            Global hotkey: Ctrl+Shift+L launches your first configured game profile.
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Paths</CardTitle>
        </CardHeader>
        <CardContent className="space-y-2 text-sm text-[var(--color-muted)]">
          {paths && (
            <>
              <p>Config: {paths.config_dir}</p>
              <p>Data: {paths.data_dir}</p>
            </>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Backup & Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {profiles.map((p) => (
            <div key={p.id} className="flex flex-wrap gap-2">
              <Button variant="secondary" onClick={() => backup(p.id)} data-focusable="true">
                Backup {p.name}
              </Button>
              <Button
                variant="danger"
                onClick={() => setResetProfile({ id: p.id, name: p.name })}
                data-focusable="true"
              >
                Reset mods — {p.name}
              </Button>
            </div>
          ))}
          <Button variant="secondary" onClick={restore} data-focusable="true">
            Restore profile from backup
          </Button>
          <Button variant="outline" onClick={exportDiag} data-focusable="true">Export Diagnostics</Button>
          {diagnostics && (
            <pre className="max-h-48 overflow-auto rounded-xl bg-[var(--color-secondary)] p-4 text-xs">
              {diagnostics}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>About</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-[var(--color-muted)]">
            NexusDeck {appVersion ?? "…"} — Lightweight Nexus Mods client for Steam Deck and Windows.
            Register with Nexus Mods before public distribution.
          </p>
        </CardContent>
      </Card>

      {resetProfile && (
        <ResetModsDialog
          profileId={resetProfile.id}
          profileName={resetProfile.name}
          open
          onOpenChange={(open) => !open && setResetProfile(null)}
          onComplete={() => void loadProfiles()}
        />
      )}
    </div>
  );
}
