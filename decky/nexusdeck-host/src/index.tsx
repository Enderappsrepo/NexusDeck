import {
  definePlugin,
  PanelSection,
  DialogButton,
  Field,
  ToggleField,
} from "@decky/ui";
import { callable } from "@decky/api";
import { useCallback, useEffect, useState } from "react";
import { FaGamepad, FaSteam, FaWrench } from "react-icons/fa";

interface HostStatus {
  plugin_version: string;
  protontricks_ok: boolean;
  nexusdeck_installed: boolean;
  flatpak_registered: boolean;
  steam_shortcut_present: boolean;
  message: string;
}

interface HealthResult {
  ok: boolean;
  lines: string[];
}

interface LaunchResult {
  success: boolean;
  message: string;
  method?: string;
}

interface SteamShortcutResult {
  success: boolean;
  already_existed?: boolean;
  needs_steam_closed?: boolean;
  shortcuts_path?: string;
  app_id?: number;
  message: string;
}

const getStatus = callable<[], HostStatus>("get_status");
const runHealthCheck = callable<[], HealthResult>("run_health_check");
const launchNexusdeck = callable<[], LaunchResult>("launch_nexusdeck");
const openStagingFolder = callable<[], string>("open_staging_folder");
const exportSupportBundle = callable<[], { path: string; message: string }>(
  "export_support_bundle"
);
const addSteamShortcut = callable<[], SteamShortcutResult>("add_steam_shortcut");
const addSteamShortcutWhenReady = callable<
  [timeoutSec?: number],
  SteamShortcutResult
>("add_steam_shortcut_when_ready");
const quitSteamClient = callable<[], { success: boolean; message: string }>("quit_steam_client");
const fixGamingModeLaunch = callable<[], { success: boolean; message: string }>(
  "fix_gaming_mode_launch"
);

function lineColor(line: string): string {
  if (line.startsWith("FAIL")) return "#f87171";
  if (line.startsWith("WARN")) return "#fbbf24";
  if (line.startsWith("INFO")) return "#94a3b8";
  return "#a3e635";
}

function StatusBadge({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span style={{ color: ok ? "#a3e635" : "#fbbf24", fontWeight: 600 }}>
      {ok ? "✓" : "!"} {label}
    </span>
  );
}

function Content() {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [health, setHealth] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHealth, setShowHealth] = useState(false);

  const refresh = useCallback(() => {
    getStatus()
      .then(setStatus)
      .catch((e) => setMessage(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const [steamBusy, setSteamBusy] = useState(false);

  const addToSteam = async () => {
    setSteamBusy(true);
    setMessage(null);
    try {
      const result = await addSteamShortcutWhenReady(180);
      setMessage(result.message);
      refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSteamBusy(false);
    }
  };

  const quitSteam = async () => {
    setSteamBusy(true);
    try {
      const result = await quitSteamClient();
      setMessage(result.message);
    } catch (e) {
      setMessage(String(e));
    } finally {
      setSteamBusy(false);
    }
  };

  const runAction = async (
    action: () => Promise<string | LaunchResult | { message: string }>
  ) => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await action();
      if (typeof result === "string") {
        setMessage(result);
      } else if ("method" in result && result.method) {
        setMessage(`${result.message} (${result.method})`);
      } else {
        setMessage(result.message);
      }
      refresh();
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onHealth = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await runHealthCheck();
      setHealth(result.lines);
      setShowHealth(true);
      setMessage(
        result.ok
          ? "All critical checks passed."
          : "Some checks failed — review the report below."
      );
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const ready =
    status &&
    (status.flatpak_registered || status.nexusdeck_installed) &&
    status.steam_shortcut_present;

  return (
    <>
      <PanelSection title="NexusDeck">
        <Field label="Status">{status?.message ?? "Loading…"}</Field>
        {status && (
          <>
            <Field label="Version">v{status.plugin_version}</Field>
            <Field label="Checks">
              <div style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 12 }}>
                <StatusBadge
                  ok={status.flatpak_registered || status.nexusdeck_installed}
                  label="NexusDeck installed"
                />
                <StatusBadge ok={status.steam_shortcut_present} label="Steam shortcut" />
                <StatusBadge ok={status.protontricks_ok} label="Protontricks" />
              </div>
            </Field>
          </>
        )}
        {message && (
          <Field label="Last action">
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{message}</div>
          </Field>
        )}
      </PanelSection>

      <PanelSection title="Launch">
        <DialogButton onClick={() => void runAction(launchNexusdeck)} disabled={busy}>
          <FaGamepad style={{ marginRight: 6 }} />
          Open NexusDeck
        </DialogButton>
        {!status?.steam_shortcut_present && (
          <>
            <DialogButton onClick={() => void addToSteam()} disabled={busy || steamBusy}>
              <FaSteam style={{ marginRight: 6 }} />
              Add to Steam (auto)
            </DialogButton>
            <DialogButton onClick={() => void quitSteam()} disabled={busy || steamBusy}>
              Quit Steam
            </DialogButton>
          </>
        )}
        <DialogButton onClick={() => void runAction(fixGamingModeLaunch)} disabled={busy}>
          Fix Gaming Mode launch
        </DialogButton>
        <DialogButton onClick={() => void runAction(openStagingFolder)} disabled={busy}>
          Open ~/NexusDeck staging
        </DialogButton>
        {!ready && (
          <div style={{ fontSize: 11, color: "#94a3b8", marginTop: 6 }}>
            Add to Steam (auto) closes Steam if needed, writes the shortcut, then you can reopen Steam.
          </div>
        )}
      </PanelSection>

      <PanelSection title="Diagnostics">
        <DialogButton onClick={() => void onHealth()} disabled={busy}>
          Run health check
        </DialogButton>
        <DialogButton onClick={() => void runAction(exportSupportBundle)} disabled={busy}>
          Export support bundle
        </DialogButton>
        <DialogButton onClick={() => refresh()} disabled={busy}>
          Refresh status
        </DialogButton>
        <ToggleField
          label="Show health report"
          checked={showHealth}
          onChange={(v) => setShowHealth(v)}
        />
      </PanelSection>

      {showHealth && health.length > 0 && (
        <PanelSection title="Health report">
          {health.map((line) => (
            <div key={line} style={{ fontSize: 12, marginBottom: 4, color: lineColor(line) }}>
              {line}
            </div>
          ))}
        </PanelSection>
      )}
    </>
  );
}

export default definePlugin(() => ({
  title: "NexusDeck",
  content: <Content />,
  icon: <FaWrench />,
}));
