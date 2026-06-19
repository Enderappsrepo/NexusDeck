import { useEffect, useState } from "react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/commands";
import { useLaunchStore } from "@/stores/launchStore";
import type { SteamShortcutInfo } from "@/lib/nexus/types";

interface SteamShortcutDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  configId: string;
}

export function SteamShortcutDialog({
  open,
  onOpenChange,
  profileId,
  configId,
}: SteamShortcutDialogProps) {
  const { addToast } = useLaunchStore();
  const [name, setName] = useState("Fallout 4 - Modded");
  const [writeVdf, setWriteVdf] = useState(true);
  const [shortcuts, setShortcuts] = useState<SteamShortcutInfo[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open && profileId) {
      api.listSteamShortcuts(profileId).then(setShortcuts).catch(() => setShortcuts([]));
    }
  }, [open, profileId]);

  const create = async () => {
    if (!configId) return;
    setLoading(true);
    try {
      const info = await api.createSteamShortcut(profileId, configId, name, writeVdf);
      addToast(
        "Steam shortcut created",
        writeVdf
          ? "Shortcut metadata saved. Restart Steam if needed."
          : `Launch via ${info.steam_uri}`,
        "success"
      );
      setShortcuts(await api.listSteamShortcuts(profileId));
    } catch (e) {
      addToast("Shortcut failed", e instanceof Error ? e.message : String(e), "error");
    } finally {
      setLoading(false);
    }
  };

  const remove = async (id: string) => {
    await api.deleteSteamShortcut(id);
    setShortcuts(await api.listSteamShortcuts(profileId));
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Add modded game to Steam">
      <div className="space-y-4">
        <p className="text-sm text-[var(--color-muted)]">
          Creates a Steam shortcut for this game profile using your current launch config
          (F4SE, args, etc.). To add NexusDeck itself, use Settings → Steam launcher.
        </p>
        <div>
          <Label htmlFor="shortcut-name">Display name</Label>
          <Input
            id="shortcut-name"
            className="mt-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>
        <div className="flex items-center justify-between">
          <Label htmlFor="write-vdf">Write to Steam shortcuts.vdf</Label>
          <Switch id="write-vdf" checked={writeVdf} onCheckedChange={setWriteVdf} />
        </div>
        <Button loading={loading} onClick={create} disabled={!configId}>
          Create shortcut
        </Button>

        {shortcuts.length > 0 && (
          <div className="space-y-2 border-t border-[var(--color-border)] pt-4">
            <p className="text-sm font-semibold">Saved shortcuts</p>
            {shortcuts.map((s) => (
              <div
                key={s.id}
                className="flex items-center justify-between rounded-xl border border-[var(--color-border)] p-3"
              >
                <div>
                  <p className="font-medium">{s.display_name}</p>
                  <p className="text-xs text-[var(--color-muted)]">{s.steam_uri}</p>
                </div>
                <Button variant="ghost" size="sm" onClick={() => remove(s.id)}>
                  Remove
                </Button>
              </div>
            ))}
          </div>
        )}
      </div>
    </AppDialog>
  );
}
