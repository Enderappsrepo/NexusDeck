import { useEffect, useState } from "react";
import {
  applyLoadOrderOnDevice,
  COMPANION_API_VERSION,
  fetchDeviceSettings,
  syncPresetsOnDevice,
  syncPluginsTxt,
  type PairedDeck,
} from "../deckApi";
import { requestNotificationPermission } from "../lib/notifications";
import { THEME_PRESETS } from "../lib/themes";
import { useCompanionSettings } from "../stores/companionSettingsStore";
import type { CompanionDeviceSettings, CompanionGame } from "../types";

export function SettingsScreen({
  paired,
  games,
  gameDomain,
  onDisconnect,
}: {
  paired: PairedDeck | null;
  games: CompanionGame[];
  gameDomain: string;
  onDisconnect: () => void;
}) {
  const settings = useCompanionSettings();
  const [device, setDevice] = useState<CompanionDeviceSettings | null>(null);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [syncBusy, setSyncBusy] = useState(false);

  useEffect(() => {
    if (!paired) return;
    void fetchDeviceSettings(paired)
      .then(setDevice)
      .catch((e) => setDeviceError(e instanceof Error ? e.message : String(e)));
  }, [paired]);

  const runSync = async (action: "loot" | "plugins" | "presets") => {
    if (!paired || !gameDomain) return;
    setSyncBusy(true);
    setSyncNote(null);
    try {
      if (action === "loot") {
        const r = await applyLoadOrderOnDevice(paired, gameDomain);
        setSyncNote(r.message);
      } else if (action === "plugins") {
        const r = await syncPluginsTxt(paired, gameDomain);
        setSyncNote(`Synced ${r.plugin_count} plugin(s) to plugins.txt.`);
      } else {
        const r = await syncPresetsOnDevice(paired, gameDomain);
        setSyncNote(r.message);
      }
    } catch (e) {
      setSyncNote(e instanceof Error ? e.message : String(e));
    } finally {
      setSyncBusy(false);
    }
  };

  return (
    <div className="cc-body space-y-4">
      <section className="cc-panel space-y-3">
        <p className="cc-panel-label">Appearance</p>
        <div className="grid grid-cols-2 gap-2">
          {THEME_PRESETS.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`cc-file text-left ${settings.theme === t.id ? "cc-file-active" : ""}`}
              onClick={() => settings.setTheme(t.id)}
            >
              <span className="block font-medium">{t.label}</span>
              <span className="text-[10px] text-[var(--cc-muted)]">{t.description}</span>
            </button>
          ))}
        </div>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Compact library rows</span>
          <input
            type="checkbox"
            checked={settings.compactUi}
            onChange={(e) => settings.setCompactUi(e.target.checked)}
          />
        </label>
      </section>

      <section className="cc-panel space-y-3">
        <p className="cc-panel-label">Connection</p>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Default game</span>
          <select
            className="cc-input max-w-[50%] py-1 text-sm"
            value={settings.defaultGameDomain || gameDomain}
            onChange={(e) => settings.setDefaultGameDomain(e.target.value)}
          >
            {games.map((g) => (
              <option key={g.domain} value={g.domain}>
                {g.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Auto-reconnect</span>
          <input
            type="checkbox"
            checked={settings.autoReconnect}
            onChange={(e) => settings.setAutoReconnect(e.target.checked)}
          />
        </label>
        <label className="flex items-center justify-between gap-3 text-sm">
          <span>Haptic feedback</span>
          <input
            type="checkbox"
            checked={settings.haptics}
            onChange={(e) => settings.setHaptics(e.target.checked)}
          />
        </label>
      </section>

      <section className="cc-panel space-y-3">
        <p className="cc-panel-label">Notifications</p>
        <select
          className="cc-input w-full"
          value={settings.notifications}
          onChange={(e) => {
            const v = e.target.value as typeof settings.notifications;
            settings.setNotifications(v);
            if (v !== "none") void requestNotificationPermission();
          }}
        >
          <option value="install_complete">Install complete only</option>
          <option value="download_progress">Install + download progress</option>
          <option value="none">Off</option>
        </select>
      </section>

      {paired && (
        <section className="cc-panel space-y-3">
          <p className="cc-panel-label">Device sync</p>
          {deviceError && <p className="text-xs text-[var(--cc-danger)]">{deviceError}</p>}
          {device && (
            <ul className="space-y-1 text-xs text-[var(--cc-muted)]">
              <li>NexusDeck v{device.app_version}</li>
              <li>Companion API v{device.companion_api ?? COMPANION_API_VERSION}</li>
              <li>Nexus API key: {device.nexus_configured ? "configured" : "missing"}</li>
              <li>
                Downloads: {device.download_settings.max_concurrent} concurrent
                {device.download_settings.speed_limit_kbps
                  ? ` · ${device.download_settings.speed_limit_kbps} KB/s cap`
                  : ""}
              </li>
            </ul>
          )}
          {syncNote && <p className="cc-banner-ok text-xs">{syncNote}</p>}
          <div className="flex flex-col gap-2">
            <button type="button" className="cc-btn-secondary" disabled={syncBusy} onClick={() => void runSync("loot")}>
              LOOT sort + apply on device
            </button>
            <button type="button" className="cc-btn-secondary" disabled={syncBusy} onClick={() => void runSync("plugins")}>
              Sync plugins.txt
            </button>
            <button type="button" className="cc-btn-secondary" disabled={syncBusy} onClick={() => void runSync("presets")}>
              Configure BodySlide paths
            </button>
          </div>
        </section>
      )}

      <section className="cc-panel space-y-2">
        <p className="cc-panel-label">About</p>
        <p className="text-xs text-[var(--cc-muted)]">
          Companion API v{COMPANION_API_VERSION} · paired with {paired?.name ?? "no device"}
        </p>
        {paired && (
          <button type="button" className="cc-btn-secondary w-full" onClick={onDisconnect}>
            Disconnect
          </button>
        )}
      </section>
    </div>
  );
}
