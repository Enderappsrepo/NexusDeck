import { useEffect, useState } from "react";
import { CalendarClock, Package, ShieldCheck, Timer } from "lucide-react";
import { StatTile, type StatTone } from "@/components/ui/StatTile";
import { api } from "@/lib/commands";
import { formatRelativeDate } from "@/lib/utils";
import type { PlaytimeStats } from "@/lib/nexus/types";

interface GameStatStripProps {
  profileId: string;
  playtime?: PlaytimeStats;
}

/**
 * At-a-glance hub stats. Uses only fast local data (installed-mod DB + recorded
 * playtime) so the hero never blocks on a Nexus round-trip.
 */
export function GameStatStrip({ profileId, playtime }: GameStatStripProps) {
  const [installed, setInstalled] = useState<number | null>(null);
  const [enabled, setEnabled] = useState(0);

  useEffect(() => {
    let active = true;
    api
      .listInstalledMods(profileId)
      .then((mods) => {
        if (!active) return;
        setInstalled(mods.length);
        setEnabled(mods.filter((m) => m.enabled).length);
      })
      .catch(() => {
        if (active) setInstalled(0);
      });
    return () => {
      active = false;
    };
  }, [profileId]);

  if (installed === null) {
    return (
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <div
            key={i}
            className="h-[4.25rem] animate-pulse rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] motion-reduce:animate-none"
          />
        ))}
      </div>
    );
  }

  const total = installed;
  const allEnabled = total > 0 && enabled === total;
  const loadOrderTone: StatTone = allEnabled ? "good" : "default";

  const hours = playtime ? Math.floor(playtime.total_secs / 3600) : 0;
  const lastPlayed = playtime?.last_played_at
    ? formatRelativeDate(playtime.last_played_at)
    : "Never";

  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <StatTile icon={Package} label="Mods installed" value={total} />
      <StatTile
        icon={ShieldCheck}
        label="Load order"
        tone={loadOrderTone}
        value={total === 0 ? "Empty" : `${total} in order`}
        bar={total === 0 ? 0 : (enabled / total) * 100}
      />
      <StatTile icon={Timer} label="Playtime" value={hours > 0 ? `${hours}h` : "—"} />
      <StatTile icon={CalendarClock} label="Last played" value={lastPlayed} />
    </div>
  );
}
