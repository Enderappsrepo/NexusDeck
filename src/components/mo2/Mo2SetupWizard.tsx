import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { api } from "@/lib/commands";
import type { Mo2Status } from "@/lib/autofix-types";

interface Mo2SetupWizardProps {
  profileId: string;
  onComplete?: () => void;
}

export function Mo2SetupWizard({ profileId, onComplete }: Mo2SetupWizardProps) {
  const [status, setStatus] = useState<Mo2Status | null>(null);
  const [modsPath, setModsPath] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");

  const refresh = async () => {
    const s = await api.getMo2Status(profileId);
    setStatus(s);
    if (s.instance_path) setModsPath(s.instance_path);
  };

  const install = async () => {
    setBusy(true);
    setMessage("");
    try {
      const s = await api.installMo2(profileId);
      setStatus(s);
      setMessage(s.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  const configure = async () => {
    setBusy(true);
    setMessage("");
    try {
      const s = await api.configureMo2Instance(profileId, modsPath.trim() || null);
      setStatus(s);
      setMessage(s.message);
      onComplete?.();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Mod Organizer 2</CardTitle>
        <CardDescription>
          Recommended for large Skyrim mod lists. Mods stay outside the Proton prefix for better Deck performance.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <Button variant="outline" size="sm" onClick={() => void refresh()} data-focusable="true">
          Refresh status
        </Button>
        {status && (
          <p className={status.installed ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>
            {status.message}
          </p>
        )}
        <Input
          placeholder="Mods folder (optional — default ~/Games/SkyrimSE/mods)"
          value={modsPath}
          onChange={(e) => setModsPath(e.target.value)}
          data-focusable="true"
        />
        <div className="flex flex-wrap gap-3">
          <Button onClick={() => void install()} disabled={busy} data-focusable="true">
            {busy ? "Working…" : "Install MO2 (Linux)"}
          </Button>
          <Button variant="secondary" onClick={() => void configure()} disabled={busy} data-focusable="true">
            Save instance paths
          </Button>
        </div>
        <p className="text-sm text-[var(--color-muted)]">
          In MO2: Configure Executables → add skse64_loader.exe from your game folder as default.
        </p>
        {message && <p className="text-sm">{message}</p>}
      </CardContent>
    </Card>
  );
}
