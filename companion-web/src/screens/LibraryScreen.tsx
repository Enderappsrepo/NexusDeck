import { ChevronDownIcon, ChevronUpIcon } from "../components/icons";
import { GameBar } from "../components/modTiles";
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
  onOpenMod,
  onToggle,
  onUninstall,
  onReorder,
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
  onOpenMod: (mod: CompanionInstalledMod) => void;
  onToggle: (mod: CompanionInstalledMod) => void;
  onUninstall: (mod: CompanionInstalledMod) => void;
  onReorder: (mod: CompanionInstalledMod, direction: "up" | "down") => void;
  onGoLoadOrder: () => void;
}) {
  const updateByNexus = new Map(updates.map((u) => [u.nexus_mod_id, u]));

  return (
    <div className="cc-browse-wrap">
      <GameBar games={games} gameDomain={gameDomain} onSelect={setGameDomain} />

      {lootErrorCount > 0 && (
        <button type="button" className="cc-banner-warn mx-4 text-left text-xs" onClick={onGoLoadOrder}>
          {lootErrorCount} LOOT issue{lootErrorCount === 1 ? "" : "s"} — open Load Order
        </button>
      )}

      {libraryBusy && (
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
          <p className="cc-section-label !mb-0">Installed mods · {libraryMods.length}</p>
          <p className="text-[10px] uppercase tracking-wider text-[var(--cc-muted)]">
            {libraryMods.filter((m) => m.enabled).length} enabled
          </p>
        </div>
      )}

      <div className={`cc-library-list ${compactUi ? "cc-library-compact" : ""}`}>
        {libraryMods.map((mod, index) => {
          const update = updateByNexus.get(mod.nexus_mod_id);
          return (
            <div key={mod.id} className="cc-library-row">
              <div className="cc-reorder">
                <button
                  type="button"
                  className="cc-reorder-btn"
                  aria-label="Move up"
                  disabled={index === 0 || libraryActionId === mod.id}
                  onClick={() => onReorder(mod, "up")}
                >
                  <ChevronUpIcon />
                </button>
                <span className="cc-reorder-index">{index + 1}</span>
                <button
                  type="button"
                  className="cc-reorder-btn"
                  aria-label="Move down"
                  disabled={index === libraryMods.length - 1 || libraryActionId === mod.id}
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
              {update && <span className="cc-update-badge">Update</span>}
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
