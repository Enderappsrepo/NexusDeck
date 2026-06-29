import { useEffect, useState } from "react";
import {
  fetchEssentialsManifest,
  fetchEssentialsStatus,
  startEssentialsOnDeck,
  type PairedDeck,
} from "../deckApi";
import { hapticSuccess } from "../lib/haptic";
import type { GameEssentialsManifest, GameEssentialModStatus } from "../types";

export function CompanionEssentialsCard({
  paired,
  gameDomain,
  canInstall,
}: {
  paired: PairedDeck;
  gameDomain: string;
  canInstall: boolean;
}) {
  const [manifest, setManifest] = useState<GameEssentialsManifest | null>(null);
  const [status, setStatus] = useState<GameEssentialModStatus[]>([]);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!canInstall || !gameDomain) {
      setManifest(null);
      return;
    }
    void fetchEssentialsManifest(paired, gameDomain)
      .then(setManifest)
      .catch(() => setManifest(null));
    void fetchEssentialsStatus(paired, gameDomain)
      .then(setStatus)
      .catch(() => setStatus([]));
  }, [paired, gameDomain, canInstall]);

  if (!manifest || !canInstall) return null;

  const installedCount = status.filter((s) => s.installed).length;

  return (
    <div className="cc-panel mx-4 space-y-3">
      <div>
        <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
          One-Click Essentials
        </p>
        <p className="mt-1 text-sm text-[var(--cc-muted)]">{manifest.description}</p>
      </div>
      <ul className="space-y-1 text-xs text-[var(--cc-muted)]">
        {manifest.mods.slice(0, 4).map((mod) => {
          const st = status.find((s) => s.id === mod.id);
          return (
            <li key={mod.id} className="flex items-center gap-2">
              <span>{st?.installed ? "✓" : "○"}</span>
              <span>{mod.name}</span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="cc-btn w-full"
        disabled={busy}
        onClick={() => {
          void (async () => {
            setBusy(true);
            setMessage(null);
            try {
              const queued = await startEssentialsOnDeck(paired, {
                game_domain: gameDomain,
                include_setup: true,
              });
              hapticSuccess();
              setMessage(
                queued.length > 0
                  ? `Queued ${queued.length} mod${queued.length === 1 ? "" : "s"} on your device.`
                  : "Setup complete — essentials already installed."
              );
              const next = await fetchEssentialsStatus(paired, gameDomain);
              setStatus(next);
            } catch (e) {
              setMessage(e instanceof Error ? e.message : String(e));
            } finally {
              setBusy(false);
            }
          })();
        }}
      >
        {busy ? "Sending to device…" : installedCount > 0 ? "Install remaining essentials" : "Install essentials on device"}
      </button>
      {message && <p className="text-xs text-[var(--cc-success)]">{message}</p>}
    </div>
  );
}
