import { useEffect, useState } from "react";
import { Layers, Trash2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { api } from "@/lib/commands";
import type { ModLoadout } from "@/lib/nexus/types";

export function ModLoadoutsPanel({ profileId }: { profileId: string }) {
  const [loadouts, setLoadouts] = useState<ModLoadout[]>([]);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState<string | null>(null);

  const refresh = () => {
    api.listModLoadouts(profileId).then(setLoadouts).catch(() => setLoadouts([]));
  };

  useEffect(() => {
    refresh();
  }, [profileId]);

  const save = async () => {
    if (!name.trim()) return;
    setBusy("save");
    try {
      await api.saveModLoadout(profileId, name.trim());
      setName("");
      refresh();
    } finally {
      setBusy(null);
    }
  };

  const apply = async (id: string) => {
    setBusy(id);
    try {
      await api.applyModLoadout(profileId, id);
      window.dispatchEvent(new Event("nexusdeck-mod-installed"));
    } finally {
      setBusy(null);
    }
  };

  const remove = async (id: string) => {
    setBusy(`del-${id}`);
    try {
      await api.deleteModLoadout(profileId, id);
      refresh();
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card className="p-4">
      <p className="mb-1 flex items-center gap-2 font-semibold">
        <Layers className="h-5 w-5" />
        Mod loadouts
      </p>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Save enabled mods and sort order as named presets (Performance, Graphics, etc.).
      </p>
      <div className="mb-4 flex gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Loadout name"
          data-focusable="true"
        />
        <Button onClick={() => void save()} loading={busy === "save"} data-focusable="true">
          Save current
        </Button>
      </div>
      <ul className="space-y-2">
        {loadouts.map((l) => (
          <li
            key={l.id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-secondary)] p-3 text-sm"
          >
            <span>
              {l.name}{" "}
              <span className="text-[var(--color-muted)]">
                ({l.enabled_mod_ids.length} mods)
              </span>
            </span>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="secondary"
                loading={busy === l.id}
                onClick={() => void apply(l.id)}
                data-focusable="true"
              >
                Apply
              </Button>
              <Button
                size="sm"
                variant="ghost"
                loading={busy === `del-${l.id}`}
                onClick={() => void remove(l.id)}
                data-focusable="true"
              >
                <Trash2 className="h-4 w-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
  );
}
