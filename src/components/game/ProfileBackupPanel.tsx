import { useState } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { open } from "@tauri-apps/plugin-dialog";
import { Download, Upload, Cloud, Gamepad2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { api } from "@/lib/commands";
import { useGamesStore } from "@/stores";

export function ProfileBackupPanel({ profileId }: { profileId: string }) {
  const loadProfiles = useGamesStore((s) => s.loadProfiles);
  const [busy, setBusy] = useState<"backup" | "restore" | "sync" | "steam" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const backup = async () => {
    setBusy("backup");
    setError(null);
    setMessage(null);
    try {
      const dest = await save({
        defaultPath: "nexusdeck-profile-backup.json",
        filters: [{ name: "NexusDeck backup", extensions: ["json"] }],
      });
      if (!dest) return;
      await api.backupProfile(profileId, dest);
      setMessage("Profile backup saved.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const restore = async () => {
    setBusy("restore");
    setError(null);
    setMessage(null);
    try {
      const src = await open({
        multiple: false,
        filters: [{ name: "NexusDeck backup", extensions: ["json"] }],
      });
      if (!src || Array.isArray(src)) return;
      await api.restoreProfile(src);
      await loadProfiles();
      setMessage("Profile restored from backup.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const exportSync = async () => {
    setBusy("sync");
    setError(null);
    setMessage(null);
    try {
      const dest = await save({
        defaultPath: "nexusdeck-sync-bundle.json",
        filters: [{ name: "NexusDeck sync bundle", extensions: ["json"] }],
      });
      if (!dest) return;
      const json = await api.exportSyncBundle(profileId);
      await api.writeTextFile(dest, json);
      setMessage("Sync bundle exported (mod lists + load order, no binaries).");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const exportSteamInput = async () => {
    setBusy("steam");
    setError(null);
    setMessage(null);
    try {
      const guide = await api.exportSteamInputGuide();
      const dest = await save({
        defaultPath: "nexusdeck-steam-input.txt",
        filters: [{ name: "Text", extensions: ["txt", "md"] }],
      });
      if (!dest) return;
      await api.writeTextFile(dest, guide);
      setMessage("Steam Input layout guide exported.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-1 font-semibold">Profile backup</p>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Export your mod list and profile settings before reimaging your Deck or swapping SD cards.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" loading={busy === "backup"} onClick={() => void backup()} data-focusable="true">
          <Download className="h-4 w-4" />
          Export backup
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "restore"}
          onClick={() => void restore()}
          data-focusable="true"
        >
          <Upload className="h-4 w-4" />
          Restore backup
        </Button>
        <Button
          variant="secondary"
          size="sm"
          loading={busy === "sync"}
          onClick={() => void exportSync()}
          data-focusable="true"
        >
          <Cloud className="h-4 w-4" />
          Sync bundle
        </Button>
        <Button
          variant="outline"
          size="sm"
          loading={busy === "steam"}
          onClick={() => void exportSteamInput()}
          data-focusable="true"
        >
          <Gamepad2 className="h-4 w-4" />
          Steam Input guide
        </Button>
      </div>
      {(message || error) && (
        <p
          className={`mt-3 text-sm ${error ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"}`}
        >
          {error ?? message}
        </p>
      )}
    </Card>
  );
}
