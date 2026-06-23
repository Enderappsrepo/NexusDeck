import { definePlugin, PanelSection, DialogButton, Field } from "@decky/ui";
import { callable } from "@decky/api";
import { useCallback, useEffect, useState } from "react";
import { FaWrench } from "react-icons/fa";

interface HostStatus {
  protontricks_ok: boolean;
  nexusdeck_installed: boolean;
  message: string;
}

const getStatus = callable<[], HostStatus>("get_status");
const launchNexusdeck = callable<[], string>("launch_nexusdeck");

function Content() {
  const [status, setStatus] = useState<HostStatus | null>(null);
  const [action, setAction] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const refresh = useCallback(() => {
    getStatus()
      .then(setStatus)
      .catch((e) => setAction(String(e)));
  }, []);

  useEffect(() => {
    refresh();
  }, [refresh]);

  const onLaunch = async () => {
    setBusy(true);
    setAction(null);
    try {
      setAction(await launchNexusdeck());
    } catch (e) {
      setAction(String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <PanelSection title="NexusDeck">
      <Field label="Status">{status?.message ?? "Loading…"}</Field>
      {status && (
        <Field label="Protontricks">
          {status.protontricks_ok ? "Installed" : "Not found — use Settings guide in NexusDeck"}
        </Field>
      )}
      {action && <Field label="">{action}</Field>}
      <DialogButton onClick={onLaunch} disabled={busy}>
        Open NexusDeck
      </DialogButton>
    </PanelSection>
  );
}

export default definePlugin(() => ({
  title: "NexusDeck",
  content: <Content />,
  icon: <FaWrench />,
}));
