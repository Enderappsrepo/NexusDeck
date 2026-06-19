import { useEffect } from "react";
import { Gamepad2, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useGamesStore } from "@/stores";
import { useLaunchStore } from "@/stores/launchStore";

export function GameRunningBanner() {
  const profiles = useGamesStore((s) => s.profiles);
  const { runningByProfile, refreshAllRunningStates, stopGame } = useLaunchStore();

  useEffect(() => {
    const profileIds = profiles.map((p) => p.id);
    if (profileIds.length === 0) return;

    refreshAllRunningStates(profileIds);
    const interval = setInterval(() => {
      refreshAllRunningStates(profileIds);
    }, 3000);
    return () => clearInterval(interval);
  }, [profiles, refreshAllRunningStates]);

  const active = profiles.find((p) => runningByProfile[p.id]?.running);
  if (!active) return null;

  return (
    <div className="flex shrink-0 items-center justify-between gap-4 border-b border-[var(--color-success)]/30 bg-[var(--color-success)]/10 px-6 py-3">
      <div className="flex items-center gap-3">
        <Gamepad2 className="h-5 w-5 text-[var(--color-success)]" />
        <div>
          <p className="font-semibold">Game Running</p>
          <p className="text-sm text-[var(--color-muted)]">{active.name}</p>
        </div>
      </div>
      <Button
        variant="outline"
        size="sm"
        onClick={() => stopGame(active.id)}
        data-focusable="true"
      >
        <XCircle className="h-4 w-4" />
        Close Game
      </Button>
    </div>
  );
}
