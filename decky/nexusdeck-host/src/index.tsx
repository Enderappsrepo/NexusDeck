import { definePlugin, PanelSection, DialogButton, Field } from "@decky/ui";
import { callable } from "@decky/api";
import { useCallback, useEffect, useState } from "react";
import { FaWrench } from "react-icons/fa";

interface HostStatus {
  decky_installed: boolean;
  plugin_installed: boolean;
  plugin_version: string;
  message: string;
}

interface HealthResult {
  ok: boolean;
  lines: string[];
}

const getStatus = callable<[], HostStatus>("get_status");
const runHealthCheck = callable<[], HealthResult>("run_health_check");
const launchNexusdeck = callable<[], string>("launch_nexusdeck");
const exportSupportBundle = callable<[], { path: string; message: string }>(
  "export_support_bundle"
);

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

  const onHealth = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await runHealthCheck();
      setHealth(result.lines);
      setMessage(result.ok ? "All critical checks passed." : "Some checks failed — see list.");
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onLaunch = async () => {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(await launchNexusdeck());
    } catch (e) {
      setMessage(String(e));
    } finally {
      setBusy(false);
    }
  };

  const onExport = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const result = await exportSupportBundle();
      setMessage(result.message);
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
        {message && <Field label="Last action">{message}</Field>}
      </PanelSection>
      <PanelSection title="Actions">
        <DialogButton onClick={onHealth} disabled={busy}>
          Run health check
        </DialogButton>
        <DialogButton onClick={onLaunch} disabled={busy}>
          Launch NexusDeck
        </DialogButton>
        <DialogButton onClick={onExport} disabled={busy}>
          Export support bundle
        </DialogButton>
      </PanelSection>
      {health.length > 0 && (
        <PanelSection title="Health report">
          {health.map((line) => (
            <div key={line} style={{ fontSize: 12, marginBottom: 4 }}>
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
