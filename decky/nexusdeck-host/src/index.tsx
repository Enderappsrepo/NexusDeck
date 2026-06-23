import { definePlugin, PanelSection, DialogButton, Field } from "@decky/ui";
import { callable } from "@decky/api";
import { useCallback, useEffect, useState } from "react";
import { FaWrench } from "react-icons/fa";

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

const getStatus = callable<[], HostStatus>("get_status");
const runHealthCheck = callable<[], HealthResult>("run_health_check");
const launchNexusdeck = callable<[], LaunchResult>("launch_nexusdeck");
const openStagingFolder = callable<[], string>("open_staging_folder");
const exportSupportBundle = callable<[], { path: string; message: string }>(
  "export_support_bundle"
);

function lineColor(line: string): string {
  if (line.startsWith("FAIL")) return "#f87171";
  if (line.startsWith("WARN")) return "#fbbf24";
  return "#a3e635";
}

function Content() {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [health, setHealth] = useState<string[]>([]);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getStatus()
      .then(setStatus)
      .catch((e) => setMessage(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const runAction = async (action: () => Promise<string | LaunchResult | { message: string }>) => {
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

  return (
    <>
      <PanelSection title="NexusDeck Host">
        <Field label="Status">{status?.message ?? "Loading…"}</Field>
        {status && (
          <>
            <Field label="Plugin">v{status.plugin_version}</Field>
            <Field label="NexusDeck">
              {status.flatpak_registered || status.nexusdeck_installed
                ? "Installed"
                : "Not installed"}
            </Field>
            <Field label="Protontricks">
              {status.protontricks_ok ? "Ready" : "Missing — see Settings guide"}
            </Field>
            <Field label="Steam shortcut">
              {status.steam_shortcut_present
                ? "Found"
                : "Not found — add from NexusDeck Settings"}
            </Field>
          </>
        )}
        {message && (
          <Field label="Last action">
            <div style={{ whiteSpace: "pre-wrap", fontSize: 12 }}>{message}</div>
          </Field>
        )}
      </PanelSection>

      <PanelSection title="Launch & folders">
        <DialogButton onClick={() => void runAction(launchNexusdeck)} disabled={busy}>
          Open NexusDeck
        </DialogButton>
        <DialogButton onClick={() => void runAction(openStagingFolder)} disabled={busy}>
          Open ~/NexusDeck staging
        </DialogButton>
      </PanelSection>

      <PanelSection title="Diagnostics">
        <DialogButton onClick={() => void onHealth()} disabled={busy}>
          Run health check
        </DialogButton>
        <DialogButton
          onClick={() => void runAction(exportSupportBundle)}
          disabled={busy}
        >
          Export support bundle
        </DialogButton>
        <DialogButton onClick={() => refresh()} disabled={busy}>
          Refresh status
        </DialogButton>
      </PanelSection>

      {health.length > 0 && (
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
