import { useMemo, useState } from "react";
import { ChevronDownIcon, ChevronUpIcon } from "../components/icons";
import { GameBar } from "../components/modTiles";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import type { CompanionGame, CompanionInstalledMod, ModUpdateInfo } from "../types";

export function LibraryScreen({
  games,
  gameDomain,
  setGameDomain,
  libraryMods,
  libraryBusy,
  libraryError,
  libraryActionId,
  updates,
  lootErrorCount,
  compactUi,
  onRefresh,
  onOpenMod,
  onToggle,
  onUninstall,
  onReorder,
  onMoveToPosition,
  onUpdateMod,
  onUpdateAll,
  onGoLoadOrder,
}: {
  games: CompanionGame[];
  gameDomain: string;
  setGameDomain: (d: string) => void;
  libraryMods: CompanionInstalledMod[];
  libraryBusy: boolean;
  libraryError: string | null;
  libraryActionId: string | null;
  updates: ModUpdateInfo[];
  lootErrorCount: number;
  compactUi: boolean;
  onRefresh: () => Promise<void>;
  onOpenMod: (mod: CompanionInstalledMod) => void;
  onToggle: (mod: CompanionInstalledMod) => void;
  onUninstall: (mod: CompanionInstalledMod) => void;
  onReorder: (mod: CompanionInstalledMod, direction: "up" | "down") => void;
  onMoveToPosition: (mod: CompanionInstalledMod, position: number) => void;
  onUpdateMod: (update: ModUpdateInfo) => void;
  onUpdateAll: () => void;
  onGoLoadOrder: () => void;
}) {
  const [query, setQuery] = useState("");
  const { pullProps, refreshing } = usePullToRefresh(onRefresh, true);
  const safeUpdates = Array.isArray(updates) ? updates : [];
  const updateByNexus = new Map(safeUpdates.map((u) => [u.nexus_mod_id, u]));

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return libraryMods;
    return libraryMods.filter(
      (m) => m.name.toLowerCase().includes(q) || String(m.nexus_mod_id).includes(q)
    );
  }, [libraryMods, query]);

  return (
    <div className="cc-browse-wrap" {...pullProps}>
      <GameBar games={games} gameDomain={gameDomain} onSelect={setGameDomain} />

      {lootErrorCount > 0 && (
        <button type="button" className="cc-banner-warn mx-4 text-left text-xs" onClick={onGoLoadOrder}>
          {lootErrorCount} LOOT issue{lootErrorCount === 1 ? "" : "s"} — open Load Order
        </button>
      )}

      <div className="px-4 pb-2">
        <input
          className="cc-input"
          placeholder="Search installed mods…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
      </div>

      {safeUpdates.length > 0 && (
        <div className="px-4 pb-2">
          <button type="button" className="cc-btn-secondary w-full" disabled={!!libraryActionId} onClick={onUpdateAll}>
            Update all ({safeUpdates.length})
          </button>
        </div>
      )}

      {(libraryBusy || refreshing) && (
        <p className="px-4 text-xs uppercase tracking-wider text-[var(--cc-muted)]">Loading library…</p>
      )}
      {libraryError && <p className="cc-banner-err mx-4">{libraryError}</p>}

      {!libraryBusy && libraryMods.length === 0 && !libraryError && (
        <p className="px-4 text-sm text-[var(--cc-muted)]">
          No mods installed for this game yet. Browse and send installs from the Browse tab.
        </p>
      )}

      {libraryMods.length > 0 && (
        <div className="flex items-center justify-between px-4">
          <p className="cc-section-label !mb-0">
            Installed mods · {filtered.length}
            {query.trim() ? ` of ${libraryMods.length}` : ""}
          </p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--cc-muted)]">
            {libraryMods.filter((m) => m.enabled).length} enabled
          </p>
        </div>
      )}

      <div className={`cc-library-list ${compactUi ? "cc-library-compact" : ""}`}>
        {filtered.map((mod, index) => {
          const realIndex = libraryMods.findIndex((m) => m.id === mod.id);
          const update = updateByNexus.get(mod.nexus_mod_id);
          return (
            <div key={mod.id} className="cc-library-row">
              <div className="cc-reorder">
                <button
                  type="button"
                  className="cc-reorder-btn"
                  aria-label="Move up"
                  disabled={realIndex <= 0 || libraryActionId === mod.id}
                  onClick={() => onReorder(mod, "up")}
                >
                  <ChevronUpIcon />
                </button>
                <button
                  type="button"
                  className="cc-reorder-index min-w-[2rem]"
                  aria-label={`Move ${mod.name} to position`}
                  disabled={libraryActionId === mod.id}
                  onClick={() => {
                    const raw = window.prompt(`Move "${mod.name}" to position (1–${libraryMods.length}):`, String(realIndex + 1));
                    const pos = raw ? Number.parseInt(raw, 10) : NaN;
                    if (Number.isFinite(pos) && pos >= 1 && pos <= libraryMods.length) {
                      onMoveToPosition(mod, pos - 1);
                    }
                  }}
                >
                  {realIndex + 1}
                </button>
                <button
                  type="button"
                  className="cc-reorder-btn"
                  aria-label="Move down"
                  disabled={realIndex >= libraryMods.length - 1 || libraryActionId === mod.id}
                  onClick={() => onReorder(mod, "down")}
                >
                  <ChevronDownIcon />
                </button>
              </div>
              <button type="button" className="cc-library-main" onClick={() => onOpenMod(mod)}>
                <span className="cc-library-name">{mod.name}</span>
                <span className="cc-library-meta">
                  {mod.version ? `v${mod.version}` : "Installed mod"}
                  {!mod.enabled ? " · disabled" : ""}
                  {update ? ` · update: v${update.latest_version}` : ""}
                </span>
              </button>
              {update && (
                <button
                  type="button"
                  className="cc-update-badge shrink-0"
                  disabled={libraryActionId === mod.id}
                  onClick={() => onUpdateMod(update)}
                >
                  Update
                </button>
              )}
              <label className="cc-toggle" title={mod.enabled ? "Disable mod" : "Enable mod"}>
                <input
                  type="checkbox"
                  checked={mod.enabled}
                  disabled={libraryActionId === mod.id}
                  onChange={() => onToggle(mod)}
                />
                <span className="cc-toggle-track" />
              </label>
              <button
                type="button"
                className="cc-library-uninstall"
                disabled={libraryActionId === mod.id}
                onClick={() => onUninstall(mod)}
              >
                Uninstall
              </button>
            </div>
          );
        })}
      </div>
    </div>
  );
}
