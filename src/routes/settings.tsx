import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore, useSettingsStore } from "@/stores";
import { api } from "@/lib/commands";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";

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
    loadSettings,
    setDownloadSettings,
    setBatteryMode,
  } = useSettingsStore();
  const launchSettings = useLaunchStore((s) => s.settings);
  const loadLaunchSettings = useLaunchStore((s) => s.loadSettings);
  const saveLaunchSettings = useLaunchStore((s) => s.saveSettings);
  const [paths, setPaths] = useState<{ config_dir: string; data_dir: string } | null>(null);
  const [diagnostics, setDiagnostics] = useState<string | null>(null);
  const [maxConcurrent, setMaxConcurrent] = useState(downloadSettings.max_concurrent);
  const [speedLimit, setSpeedLimit] = useState(downloadSettings.speed_limit_kbps);

  useEffect(() => {
    loadProfiles();
    loadSettings();
    loadLaunchSettings();
    api.getAppPaths().then(setPaths);
  }, [loadProfiles, loadSettings, loadLaunchSettings]);

  useEffect(() => {
    setMaxConcurrent(downloadSettings.max_concurrent);
    setSpeedLimit(downloadSettings.speed_limit_kbps);
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
    });
  };

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <h1 className="text-3xl font-bold">Settings</h1>

      <Card>
        <CardHeader>
          <CardTitle>Account</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {user ? (
            <>
              <p>Signed in as <strong>{user.name}</strong></p>
              {user.is_premium && <p className="text-[var(--color-success)]">Premium member</p>}
              <Button variant="danger" onClick={logout}>Sign Out</Button>
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
            <input
              type="number"
              min={1}
              max={8}
              value={maxConcurrent}
              onChange={(e) => setMaxConcurrent(Number(e.target.value))}
              className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
              data-focusable="true"
            />
          </label>
          <label className="block space-y-2">
            <span className="text-sm text-[var(--color-muted)]">
              Speed limit (KB/s, 0 = unlimited)
            </span>
            <input
              type="number"
              min={0}
              value={speedLimit}
              onChange={(e) => setSpeedLimit(Number(e.target.value))}
              className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
              data-focusable="true"
            />
          </label>
          <Button onClick={saveDownloadSettings} disabled={settingsLoading}>
            Save download settings
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Steam Deck</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <label className="flex min-h-[48px] cursor-pointer items-center gap-3">
            <input
              type="checkbox"
              checked={batteryMode}
              onChange={(e) => setBatteryMode(e.target.checked)}
              className="h-5 w-5"
            />
            <div>
              <p className="font-medium">Battery mode</p>
              <p className="text-sm text-[var(--color-muted)]">
                Prefer lighter downloads and disable heavy visual mods on battery.
              </p>
            </div>
          </label>
          <div className="rounded-xl bg-[var(--color-secondary)] p-4 text-sm text-[var(--color-muted)]">
            <p className="font-medium text-[var(--color-foreground)]">Gamepad shortcuts</p>
            <ul className="mt-2 space-y-1">
              <li>{GAMEPAD_HINTS.navigate}: Navigate focus</li>
              <li>{GAMEPAD_HINTS.confirm}: Confirm / select</li>
              <li>{GAMEPAD_HINTS.back}: Go back</li>
              <li>{GAMEPAD_HINTS.tabs}: Switch tabs (L1 / R1)</li>
              <li>{GAMEPAD_HINTS.launch}: Quick launch menu (Y on Launch button)</li>
            </ul>
          </div>
        </CardContent>
      </Card>

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
            <Button key={p.id} variant="secondary" onClick={() => backup(p.id)}>
              Backup {p.name}
            </Button>
          ))}
          <Button variant="secondary" onClick={restore}>
            Restore profile from backup
          </Button>
          <Button variant="outline" onClick={exportDiag}>Export Diagnostics</Button>
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
            NexusDeck v0.1.0 — Lightweight Nexus Mods client for Steam Deck and Windows.
            Register with Nexus Mods before public distribution.
          </p>
        </CardContent>
      </Card>
    </div>
  );
}
