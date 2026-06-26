import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { open, save } from "@tauri-apps/plugin-dialog";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { Label } from "@/components/ui/label";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore, useSettingsStore } from "@/stores";
import { api } from "@/lib/commands";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { AddToSteamPanel } from "@/components/steam/AddToSteamPanel";
import { DeckyHostPanel } from "@/components/decky/DeckyHostPanel";
import { ProtontricksGuidePanel } from "@/components/proton/ProtontricksGuidePanel";
import { ResetModsDialog } from "@/components/mod/ResetModsDialog";
import { ResetAppDialog } from "@/components/settings/ResetAppDialog";
import { UninstallAppDialog } from "@/components/settings/UninstallAppDialog";
import type { HardwareAccelerationMode, SevenZipInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/settings")({
  component: SettingsPage,
});

function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, login, loading: authLoading, error: authError } = useAuthStore();
  const { profiles, loadProfiles } = useGamesStore();
  const {
    downloadSettings,
    performanceMode,
    navMode,
    deckDetected,
    gyroScroll,
    loadSettings,
    setDownloadSettings,
    setPerformanceMode,
    setNavMode,
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
  const [pauseOnBattery, setPauseOnBattery] = useState(
    () => downloadSettings.pause_on_battery ?? false
  );
  const [bandwidthSaver, setBandwidthSaver] = useState(
    () => downloadSettings.bandwidth_saver ?? false
  );
  const [clearDownloadAfterInstall, setClearDownloadAfterInstall] = useState(
    () => localStorage.getItem("nexusdeck_clear_download_after_install") !== "false"
  );
  const [resetProfile, setResetProfile] = useState<{ id: string; name: string } | null>(null);
  const [resetAppOpen, setResetAppOpen] = useState(false);
  const [uninstallOpen, setUninstallOpen] = useState(false);
  const [rerunningOnboarding, setRerunningOnboarding] = useState(false);
  const [appVersion, setAppVersion] = useState<string | null>(null);
  const [isLinux, setIsLinux] = useState(false);
  const [hardwareAcceleration, setHardwareAcceleration] =
    useState<HardwareAccelerationMode>("on");
  const [hwAccelSaved, setHwAccelSaved] = useState(false);
  const [logsDir, setLogsDir] = useState<string | null>(null);
  const [verboseLogging, setVerboseLogging] = useState(false);
  const [exportingLogs, setExportingLogs] = useState(false);
  const [installingSteamInput, setInstallingSteamInput] = useState(false);
  const [protonMasterLogPath, setProtonMasterLogPath] = useState<string | null>(null);
  const [protonLogPreview, setProtonLogPreview] = useState<string | null>(null);
  const [loadingProtonLog, setLoadingProtonLog] = useState(false);
  const [apiKey, setApiKey] = useState("");
  const [sevenZip, setSevenZip] = useState<SevenZipInfo | null>(null);
  const [downloadSaveState, setDownloadSaveState] = useState<"idle" | "saving" | "saved">("idle");
  const [backupError, setBackupError] = useState<string | null>(null);
  const downloadSaveTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const connectApiKey = async () => {
    if (!apiKey.trim()) return;
    try {
      await login(apiKey.trim());
      setApiKey("");
    } catch {
      /* error shown via authError */
    }
  };

  useEffect(() => {
    loadProfiles();
    loadSettings();
    loadLaunchSettings();
    api.getAppPaths().then(setPaths);
    api.getPlatformInfo()
      .then((p) => {
        setAppVersion(p.app_version);
        setIsLinux(p.is_linux);
      })
      .catch(() => {});
    api.getAppPrefs()
      .then((prefs) => setHardwareAcceleration(prefs.hardware_acceleration))
      .catch(() => {});
    api.getLogsDir().then(setLogsDir).catch(() => {});
    api.getVerboseLogging().then(setVerboseLogging).catch(() => {});
    api.getProtonMasterLogPath().then(setProtonMasterLogPath).catch(() => {});
    api.getSevenZipInfo().then(setSevenZip).catch(() => setSevenZip(null));
  }, [loadProfiles, loadSettings, loadLaunchSettings]);

  const persistDownloadSettings = useCallback(
    async (overrides?: Partial<{
      max_concurrent: number;
      speed_limit_kbps: number;
      auto_install_after_download: boolean;
      pause_on_battery: boolean;
      bandwidth_saver: boolean;
    }>) => {
      setDownloadSaveState("saving");
      try {
        await setDownloadSettings({
          max_concurrent: overrides?.max_concurrent ?? maxConcurrent,
          speed_limit_kbps: overrides?.speed_limit_kbps ?? speedLimit,
          auto_install_after_download:
            overrides?.auto_install_after_download ?? autoInstallAfterDownload,
          pause_on_battery: overrides?.pause_on_battery ?? pauseOnBattery,
          bandwidth_saver: overrides?.bandwidth_saver ?? bandwidthSaver,
        });
        setDownloadSaveState("saved");
        if (downloadSaveTimer.current) clearTimeout(downloadSaveTimer.current);
        downloadSaveTimer.current = setTimeout(() => setDownloadSaveState("idle"), 2000);
      } catch {
        setDownloadSaveState("idle");
      }
    },
    [
      autoInstallAfterDownload,
      bandwidthSaver,
      maxConcurrent,
      pauseOnBattery,
      setDownloadSettings,
      speedLimit,
    ]
  );

  useEffect(() => {
    return () => {
      if (downloadSaveTimer.current) clearTimeout(downloadSaveTimer.current);
    };
  }, []);

  useEffect(() => {
    setMaxConcurrent(downloadSettings.max_concurrent);
    setSpeedLimit(downloadSettings.speed_limit_kbps);
    setAutoInstallAfterDownload(downloadSettings.auto_install_after_download ?? false);
    setPauseOnBattery(downloadSettings.pause_on_battery ?? false);
    setBandwidthSaver(downloadSettings.bandwidth_saver ?? false);
  }, [downloadSettings]);

  const exportDiag = async () => {
    const d = await api.exportDiagnostics();
    setDiagnostics(d);
  };

  const exportLogs = async () => {
    setExportingLogs(true);
    try {
      const dest = await save({
        defaultPath: "nexusdeck-logs.zip",
        filters: [{ name: "Zip archive", extensions: ["zip"] }],
      });
      if (dest) {
        await api.exportInstallLogsTo({ destPath: dest, lastN: 10 });
        alert(`Logs exported to ${dest}`);
      }
    } finally {
      setExportingLogs(false);
    }
  };

  const toggleVerboseLogging = async (enabled: boolean) => {
    setVerboseLogging(enabled);
    await api.setVerboseLogging(enabled);
  };

  const viewProtonLog = async () => {
    if (!protonMasterLogPath) return;
    setLoadingProtonLog(true);
    try {
      const text = await api.readProtonLog(protonMasterLogPath);
      setProtonLogPreview(text || "(Proton log is empty — run a Proton fix or dependency install first.)");
    } catch (e) {
      setProtonLogPreview(e instanceof Error ? e.message : String(e));
    } finally {
      setLoadingProtonLog(false);
    }
  };

  const backup = async (profileId: string) => {
    setBackupError(null);
    try {
      const dest = `${paths?.config_dir}/backup-${profileId}.json`;
      await api.backupProfile(profileId, dest);
      alert(`Backup saved to ${dest}`);
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    }
  };

  const restore = async () => {
    setBackupError(null);
    try {
      const selected = await open({
        multiple: false,
        filters: [{ name: "Backup", extensions: ["json"] }],
      });
      if (typeof selected === "string") {
        await api.restoreProfile(selected);
        await loadProfiles();
        alert("Profile restored.");
      }
    } catch (e) {
      setBackupError(e instanceof Error ? e.message : String(e));
    }
  };

  const exportSteamInputGuide = async () => {
    try {
      const guide = await api.exportSteamInputGuide();
      const dest = await save({
        defaultPath: "nexusdeck-steam-input.txt",
        filters: [{ name: "Text", extensions: ["txt", "md"] }],
      });
      if (dest) {
        await api.writeTextFile(dest, guide);
        alert("Steam Input guide exported.");
      }
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    }
  };

  const installSteamInputLayout = async () => {
    setInstallingSteamInput(true);
    try {
      const result = await api.installNexusDeckSteamInputLayout("NexusDeck");
      alert(result.message);
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallingSteamInput(false);
    }
  };

  const rerunOnboarding = async () => {
    setRerunningOnboarding(true);
    try {
      await api.restartOnboarding();
      navigate({ to: "/onboarding" });
    } catch (e) {
      alert(e instanceof Error ? e.message : String(e));
    } finally {
      setRerunningOnboarding(false);
    }
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
            <div className="space-y-4">
              <p className="text-[var(--color-muted)]">
                Sign in with your Nexus Mods personal API key to browse and download mods.
              </p>
              <Input
                type="password"
                placeholder="Nexus API Key"
                value={apiKey}
                onChange={(e) => {
                  setApiKey(e.target.value);
                  if (authError) useAuthStore.setState({ error: null });
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && apiKey.trim() && !authLoading) {
                    void connectApiKey();
                  }
                }}
                data-focusable="true"
              />
              <div className="flex flex-wrap gap-2">
                <Button
                  loading={authLoading}
                  disabled={!apiKey.trim()}
                  onClick={() => void connectApiKey()}
                  data-focusable="true"
                >
                  Connect
                </Button>
                <Button
                  variant="ghost"
                  className="text-[var(--color-primary)]"
                  onClick={() =>
                    void openUrl("https://www.nexusmods.com/users/myaccount?tab=api+access")
                  }
                  data-focusable="true"
                >
                  Get API key
                </Button>
              </div>
              {authError && <p className="text-sm text-[var(--color-danger)]">{authError}</p>}
            </div>
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
              onChange={(e) => {
                const value = Number(e.target.value);
                setMaxConcurrent(value);
                void persistDownloadSettings({ max_concurrent: value });
              }}
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
              onChange={(e) => {
                const value = Number(e.target.value);
                setSpeedLimit(value);
                void persistDownloadSettings({ speed_limit_kbps: value });
              }}
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
              onCheckedChange={(checked) => {
                setAutoInstallAfterDownload(checked);
                void persistDownloadSettings({ auto_install_after_download: checked });
              }}
              data-focusable="true"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Pause downloads on battery</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Hold the download queue while the Deck is unplugged (Linux/SteamOS).
              </p>
            </div>
            <Switch
              checked={pauseOnBattery}
              onCheckedChange={(checked) => {
                setPauseOnBattery(checked);
                void persistDownloadSettings({ pause_on_battery: checked });
              }}
              data-focusable="true"
            />
          </div>
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Limited-bandwidth mode</Label>
              <p className="text-sm text-[var(--color-muted)]">
                One download at a time with a 512 KB/s cap when no speed limit is set.
              </p>
            </div>
            <Switch
              checked={bandwidthSaver}
              onCheckedChange={(checked) => {
                setBandwidthSaver(checked);
                void persistDownloadSettings({ bandwidth_saver: checked });
              }}
              data-focusable="true"
            />
          </div>
          {downloadSaveState !== "idle" && (
            <p className="text-xs text-[var(--color-muted)]">
              {downloadSaveState === "saving" ? "Saving…" : "Saved"}
            </p>
          )}
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
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <Label>Performance mode</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Flattens shadows, removes blur/glass, and makes cards static for smoother
                scrolling. Auto enables it on Steam Deck
                {deckDetected ? " (detected on this device)" : ""}.
              </p>
            </div>
            <SegmentedControl
              size="sm"
              ariaLabel="Performance mode"
              value={performanceMode}
              onChange={setPerformanceMode}
              options={[
                { value: "auto", label: "Auto" },
                { value: "on", label: "On" },
                { value: "off", label: "Off" },
              ]}
            />
          </div>
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="min-w-0">
              <Label>Navigation</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Auto uses the touch-friendly bottom bar on a Steam Deck or narrow window and the
                side rail on wide screens. Force the bottom bar on handhelds that aren't
                auto-detected (ROG Ally, Legion Go).
              </p>
            </div>
            <SegmentedControl
              size="sm"
              ariaLabel="Navigation layout"
              value={navMode}
              onChange={setNavMode}
              options={[
                { value: "auto", label: "Auto" },
                { value: "bottom", label: "Bottom bar" },
                { value: "sidebar", label: "Side rail" },
              ]}
            />
          </div>
          {isLinux && (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <Label>Hardware acceleration</Label>
                <p className="text-sm text-[var(--color-muted)]">
                  Uses the GPU for scrolling and UI (recommended). Turn off only if the window is
                  blank or corrupted — requires restart.
                  {hwAccelSaved ? " Restart NexusDeck to apply." : ""}
                </p>
              </div>
              <SegmentedControl
                size="sm"
                ariaLabel="Hardware acceleration"
                value={hardwareAcceleration}
                onChange={(mode) => {
                  void api.setHardwareAcceleration(mode).then((prefs) => {
                    setHardwareAcceleration(prefs.hardware_acceleration);
                    setHwAccelSaved(true);
                  });
                }}
                options={[
                  { value: "on", label: "On" },
                  { value: "off", label: "Off" },
                ]}
              />
            </div>
          )}
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
            <p className="mt-3 flex flex-wrap gap-3">
              {isLinux && (
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  loading={installingSteamInput}
                  disabled={installingSteamInput}
                  data-focusable="true"
                  onClick={() => void installSteamInputLayout()}
                >
                  Install Steam Input template
                </Button>
              )}
              <button
                type="button"
                className="focusable text-[var(--color-primary)] underline"
                data-focusable="true"
                onClick={() => void exportSteamInputGuide()}
              >
                Export Steam Input profile guide
              </button>
            </p>
          </div>
        </CardContent>
      </Card>

      <AddToSteamPanel />

      <DeckyHostPanel />

      <ProtontricksGuidePanel
        autoVerify={false}
        checkHealthOnMount={false}
        gameDomain={
          profiles.find((p) => p.game_domain === "fallout4" || p.game_domain === "skyrimspecialedition")
            ?.game_domain ?? null
        }
        profileId={
          profiles.find((p) => p.game_domain === "fallout4" || p.game_domain === "skyrimspecialedition")
            ?.id ?? null
        }
      />

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
          {sevenZip && (
            <div
              className={
                sevenZip.available
                  ? "rounded-xl border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-3 text-[var(--color-foreground)]"
                  : "rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-3 text-[var(--color-foreground)]"
              }
            >
              <p className="font-medium">Archive extractor</p>
              <p className="mt-1">{sevenZip.message}</p>
              {sevenZip.path && (
                <p className="mt-1 font-mono text-xs break-all opacity-80">{sevenZip.path}</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Logging & Diagnostics</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div>
              <Label>Verbose logging</Label>
              <p className="text-sm text-[var(--color-muted)]">
                Extra detail for mod installs and Proton operations (JSONL + command output)
              </p>
            </div>
            <Switch
              checked={verboseLogging}
              onCheckedChange={(v) => void toggleVerboseLogging(v)}
            />
          </div>
          {logsDir && (
            <p className="text-sm text-[var(--color-muted)]">
              Logs folder: <span className="font-mono text-xs">{logsDir}</span>
            </p>
          )}
          {protonMasterLogPath && (
            <p className="text-sm text-[var(--color-muted)]">
              Proton master log: <span className="font-mono text-xs">{protonMasterLogPath}</span>
            </p>
          )}
          <div className="flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => void exportLogs()} disabled={exportingLogs} data-focusable="true">
              {exportingLogs ? "Exporting…" : "Export all logs (zip)"}
            </Button>
            <Button
              variant="outline"
              onClick={() => void viewProtonLog()}
              disabled={loadingProtonLog || !protonMasterLogPath}
              data-focusable="true"
            >
              {loadingProtonLog ? "Loading…" : "View proton log"}
            </Button>
          </div>
          {protonLogPreview && (
            <pre className="max-h-64 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-3 font-mono text-xs whitespace-pre-wrap">
              {protonLogPreview}
            </pre>
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
          {backupError && (
            <p className="text-sm text-[var(--color-danger)]">{backupError}</p>
          )}
          {diagnostics && (
            <pre className="max-h-48 overflow-auto rounded-xl bg-[var(--color-secondary)] p-4 text-xs">
              {diagnostics}
            </pre>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Danger zone</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div>
            <p className="font-medium">Run setup wizard again</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Re-open the first-run setup without deleting profiles or mod data.
            </p>
            <Button
              variant="secondary"
              className="mt-3"
              loading={rerunningOnboarding}
              onClick={() => void rerunOnboarding()}
              data-focusable="true"
            >
              Re-run onboarding
            </Button>
          </div>
          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="font-medium text-[var(--color-danger)]">Uninstall NexusDeck</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Remove the app from your system. Choose whether to delete all NexusDeck data and start
              fresh, or keep your library for a future reinstall.
            </p>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => setUninstallOpen(true)}
              data-focusable="true"
            >
              Uninstall…
            </Button>
          </div>
          <div className="border-t border-[var(--color-border)] pt-4">
            <p className="font-medium text-[var(--color-danger)]">Full app reset</p>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Erase all profiles, downloads, launch presets, and your saved API key. Game files and
              staging folders are kept.
            </p>
            <Button
              variant="danger"
              className="mt-3"
              onClick={() => setResetAppOpen(true)}
              data-focusable="true"
            >
              Reset NexusDeck
            </Button>
          </div>
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

      <ResetAppDialog open={resetAppOpen} onOpenChange={setResetAppOpen} />
      <UninstallAppDialog open={uninstallOpen} onOpenChange={setUninstallOpen} />
    </div>
  );
}
