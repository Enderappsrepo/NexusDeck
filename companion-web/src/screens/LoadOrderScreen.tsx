import { useCallback, useEffect, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "../components/icons";
import { LoadOrderIssuesPanel } from "../components/LoadOrderIssuesPanel";
import { GameBar } from "../components/modTiles";
import {
  fetchLoadOrderState,
  rescanLibrary,
  sortLoadOrder,
  syncPluginsTxt,
  type PairedDeck,
} from "../deckApi";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { hapticSuccess } from "../lib/haptic";
import type { CompanionGame, LoadOrderState } from "../types";

export function LoadOrderScreen({
  paired,
  games,
  gameDomain,
  setGameDomain,
  onReorder,
  onMoveToPosition,
}: {
  paired: PairedDeck;
  games: CompanionGame[];
  gameDomain: string;
  setGameDomain: (d: string) => void;
  onReorder?: (modId: string, direction: "up" | "down") => void;
  onMoveToPosition?: (modId: string, position: number) => void;
}) {
  const [tab, setTab] = useState<"mods" | "plugins">("mods");
  const [state, setState] = useState<LoadOrderState | null>(null);
  const [busy, setBusy] = useState(true);
  const [actionBusy, setActionBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setBusy(true);
    setError(null);
    try {
      setState(await fetchLoadOrderState(paired, gameDomain));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setState(null);
    } finally {
      setBusy(false);
    }
  }, [paired, gameDomain]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const { pullProps, refreshing } = usePullToRefresh(refresh, true);

  const runSort = async () => {
    setActionBusy(true);
    try {
      setState(await sortLoadOrder(paired, gameDomain));
      hapticSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const runSync = async () => {
    setActionBusy(true);
    try {
      await syncPluginsTxt(paired, gameDomain);
      await refresh();
      hapticSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const runRescan = async () => {
    setActionBusy(true);
    try {
      await rescanLibrary(paired, gameDomain);
      await refresh();
      hapticSuccess();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setActionBusy(false);
    }
  };

  const mods = state?.mods ?? [];

  return (
    <div className="cc-browse-wrap" {...pullProps}>
      <GameBar games={games} gameDomain={gameDomain} onSelect={setGameDomain} />

      <div className="grid grid-cols-2 gap-2 px-4">
        <button type="button" className="cc-btn" disabled={actionBusy} onClick={() => void runSort()}>
          LOOT Sort
        </button>
        <button type="button" className="cc-btn-secondary" disabled={actionBusy} onClick={() => void runSync()}>
          Sync plugins.txt
        </button>
      </div>
      <div className="px-4 pt-2">
        <button type="button" className="cc-btn-ghost text-xs" disabled={actionBusy} onClick={() => void runRescan()}>
          Rescan library from disk
        </button>
      </div>

      <div className="cc-game-bar px-4">
        <button
          type="button"
          className={tab === "mods" ? "cc-chip cc-chip-active" : "cc-chip"}
          onClick={() => setTab("mods")}
        >
          Mods
        </button>
        <button
          type="button"
          className={tab === "plugins" ? "cc-chip cc-chip-active" : "cc-chip"}
          onClick={() => setTab("plugins")}
        >
          Plugins
        </button>
      </div>

      {busy || refreshing ? (
        <p className="px-4 text-xs text-[var(--cc-muted)]">Loading load order…</p>
      ) : null}
      {error && <p className="cc-banner-err mx-4">{error}</p>}
      {state && <LoadOrderIssuesPanel issues={state.loot_issues ?? []} compact />}

      {state && tab === "mods" && (
        <div className="cc-library-list px-2">
          {mods.map((mod, index) => (
            <div key={mod.id} className="cc-library-row">
              {onReorder && (
                <div className="cc-reorder">
                  <button
                    type="button"
                    className="cc-reorder-btn"
                    aria-label="Move up"
                    disabled={index === 0 || actionBusy}
                    onClick={() => onReorder(mod.id, "up")}
                  >
                    <ChevronUpIcon />
                  </button>
                  <button
                    type="button"
                    className="cc-reorder-index min-w-[2rem]"
                    disabled={actionBusy}
                    onClick={() => {
                      if (!onMoveToPosition) return;
                      const raw = window.prompt(
                        `Move "${mod.name}" to position (1–${mods.length}):`,
                        String(index + 1)
                      );
                      const pos = raw ? Number.parseInt(raw, 10) : NaN;
                      if (Number.isFinite(pos) && pos >= 1 && pos <= mods.length) {
                        onMoveToPosition(mod.id, pos - 1);
                        void refresh();
                      }
                    }}
                  >
                    {index + 1}
                  </button>
                  <button
                    type="button"
                    className="cc-reorder-btn"
                    aria-label="Move down"
                    disabled={index === mods.length - 1 || actionBusy}
                    onClick={() => onReorder(mod.id, "down")}
                  >
                    <ChevronDownIcon />
                  </button>
                </div>
              )}
              {!onReorder && <span className="cc-reorder-index w-8 text-center">{index + 1}</span>}
              <div className="cc-library-main">
                <span className="cc-library-name">{mod.name}</span>
                <span className="cc-library-meta">
                  {(mod.plugins ?? []).length ? (mod.plugins ?? []).join(", ") : "No plugins"}
                  {!mod.enabled ? " · disabled" : ""}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {state && tab === "plugins" && (
        <div className="cc-list px-2">
          {(state.plugins ?? []).map((p) => (
            <div key={p.name} className="cc-list-row pointer-events-none">
              <div className="cc-list-body">
                <p className="cc-list-title font-mono text-sm">{p.name}</p>
                <p className="cc-list-author">
                  {p.kind}
                  {p.mod_name ? ` · ${p.mod_name}` : ""}
                  {!p.enabled ? " · disabled" : ""}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}

      {state?.message && <p className="px-4 text-xs text-[var(--cc-muted)]">{state.message}</p>}
    </div>
  );
}
