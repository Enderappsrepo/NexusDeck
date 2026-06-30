import { useCallback } from "react";
import { CompanionEssentialsCard } from "../components/CompanionEssentialsCard";
import { CcHeroCard, CcListRow, CcTile, GameBar } from "../components/modTiles";
import { SearchIcon } from "../components/icons";
import { searchModsViaDeck, type PairedDeck } from "../deckApi";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import { DISCOVERY_SHELVES } from "../lib/modUi";
import type { CompanionGame, DiscoveryFeeds, ModSummary } from "../types";

export function BrowseScreen({
  paired,
  games,
  gameDomain,
  setGameDomain,
  discovery,
  searchResults,
  setSearchResults,
  query,
  setQuery,
  browseBusy,
  setBrowseBusy,
  setBrowseError,
  onOpenMod,
  onOpenCollections,
  refreshBrowse,
}: {
  paired: PairedDeck;
  games: CompanionGame[];
  gameDomain: string;
  setGameDomain: (d: string) => void;
  discovery: DiscoveryFeeds;
  searchResults: ModSummary[];
  setSearchResults: (m: ModSummary[]) => void;
  query: string;
  setQuery: (q: string) => void;
  browseBusy: boolean;
  setBrowseBusy: (b: boolean) => void;
  setBrowseError: (e: string | null) => void;
  onOpenMod: (mod: ModSummary) => void;
  onOpenCollections: () => void;
  refreshBrowse: () => Promise<void>;
}) {
  const { pullDistance, refreshing, pullProps } = usePullToRefresh(refreshBrowse, true);
  const showSearch = query.trim().length > 0;
  const hasDiscoveryContent = DISCOVERY_SHELVES.some((s) => discovery[s.key].length > 0);
  const activeGame = games.find((g) => g.domain === gameDomain);

  const runSearch = useCallback(async () => {
    if (!query.trim()) return;
    setBrowseBusy(true);
    try {
      setSearchResults(await searchModsViaDeck(paired, gameDomain, query.trim()));
      setBrowseError(null);
    } catch (err) {
      setBrowseError(err instanceof Error ? err.message : String(err));
    } finally {
      setBrowseBusy(false);
    }
  }, [paired, gameDomain, query, setBrowseBusy, setBrowseError, setSearchResults]);

  return (
    <div className="cc-browse-wrap" {...pullProps}>
      {(pullDistance > 8 || refreshing) && (
        <div
          className="cc-pull-indicator"
          style={{ height: refreshing ? 36 : Math.min(pullDistance * 0.45, 48) }}
        >
          <span className="text-[10px] uppercase tracking-wider text-[var(--cc-gold)]">
            {refreshing ? "Refreshing…" : pullDistance >= 72 ? "Release to refresh" : "Pull to refresh"}
          </span>
        </div>
      )}

      <GameBar games={games} gameDomain={gameDomain} onSelect={setGameDomain} />
      <CompanionEssentialsCard paired={paired} gameDomain={gameDomain} canInstall={!!activeGame?.can_install} />

      <div className="px-4 pb-2">
        <button type="button" className="cc-btn-secondary w-full" onClick={onOpenCollections}>
          Browse Nexus Collections
        </button>
      </div>

      <div className="cc-search">
        <div className="cc-search-field">
          <SearchIcon className="cc-search-ico" />
          <input
            className="cc-search-input"
            placeholder="Search catalog…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void runSearch();
            }}
          />
        </div>
        <button type="button" className="cc-btn shrink-0 px-4" disabled={browseBusy} onClick={() => void runSearch()}>
          Go
        </button>
      </div>

      {browseBusy && <p className="px-4 text-xs uppercase tracking-wider text-[var(--cc-muted)]">Loading…</p>}

      {showSearch ? (
        <section>
          <p className="cc-section-label px-4">
            Results <span className="cc-count">{searchResults.length}</span>
          </p>
          <div className="cc-list">
            {searchResults.map((mod) => (
              <CcListRow key={mod.mod_id} mod={mod} onOpen={onOpenMod} />
            ))}
          </div>
        </section>
      ) : (
        DISCOVERY_SHELVES.map((shelf) => {
          const mods = discovery[shelf.key];
          if (!mods.length) return null;
          if (shelf.layout === "hero") {
            return (
              <section key={shelf.key} className="cc-section">
                <p className="cc-section-label px-4">{shelf.title}</p>
                <div className="cc-hero-track">
                  {mods.slice(0, 6).map((mod) => (
                    <CcHeroCard key={mod.mod_id} mod={mod} onOpen={onOpenMod} />
                  ))}
                </div>
              </section>
            );
          }
          if (shelf.layout === "shelf") {
            return (
              <section key={shelf.key} className="cc-section">
                <p className="cc-section-label px-4">{shelf.title}</p>
                <div className="cc-shelf-track">
                  {mods.map((mod) => (
                    <CcTile key={mod.mod_id} mod={mod} className="cc-shelf-tile" onOpen={onOpenMod} />
                  ))}
                </div>
              </section>
            );
          }
          return (
            <section key={shelf.key} className="cc-section">
              <p className="cc-section-label px-4">{shelf.title}</p>
              <div className="cc-list">
                {mods.slice(0, 6).map((mod) => (
                  <CcListRow key={mod.mod_id} mod={mod} onOpen={onOpenMod} />
                ))}
              </div>
            </section>
          );
        })
      )}

      {!browseBusy && !hasDiscoveryContent && !showSearch && (
        <p className="px-4 text-sm text-[var(--cc-muted)]">No mods loaded yet. Search above or browse collections.</p>
      )}
    </div>
  );
}
