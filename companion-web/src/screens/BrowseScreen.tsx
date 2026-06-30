import { useCallback, useEffect, useRef, useState } from "react";
import { ActiveFilterBar } from "../components/ActiveFilterBar";
import { BrowseFilterSheet } from "../components/BrowseFilterSheet";
import { CompanionEssentialsCard } from "../components/CompanionEssentialsCard";
import { CcHeroCard, CcListRow, CcTile, GameBar } from "../components/modTiles";
import { FilterIcon, SearchIcon } from "../components/icons";
import { fetchBrowseShelf, searchModsFiltered, type PairedDeck } from "../deckApi";
import { usePullToRefresh } from "../hooks/usePullToRefresh";
import {
  DEFAULT_FILTERS,
  activeFilterCount,
  hasActiveFilters,
  type ModBrowseSort,
} from "../lib/modFilters";
import { DISCOVERY_SHELVES, SHELF_DRILL_DOWN } from "../lib/modUi";
import type { CompanionGame, DiscoveryFeeds, ModSearchFilters, ModSummary } from "../types";

const PAGE_SIZE = 20;
const SHELF_PAGE_SIZE = 24;

function ShelfHeader({
  title,
  shelfKey,
  modCount,
  previewCount,
  onSeeAll,
}: {
  title: string;
  shelfKey: string;
  modCount: number;
  previewCount: number;
  onSeeAll: (key: string, title: string) => void;
}) {
  const canSeeAll = SHELF_DRILL_DOWN[shelfKey] && modCount > previewCount;
  return (
    <div className="flex items-center justify-between px-4">
      <p className="cc-section-label !mb-0">{title}</p>
      {canSeeAll && (
        <button type="button" className="cc-btn-ghost text-xs" onClick={() => onSeeAll(shelfKey, title)}>
          See all
        </button>
      )}
    </div>
  );
}

export function BrowseScreen({
  paired,
  games,
  gameDomain,
  setGameDomain,
  discovery,
  searchResults,
  setSearchResults,
  searchTotalCount,
  setSearchTotalCount,
  query,
  setQuery,
  filters = DEFAULT_FILTERS,
  setFilters,
  sort,
  setSort,
  filterSheetOpen,
  setFilterSheetOpen,
  browseSearchTrigger,
  browseBusy,
  setBrowseBusy,
  setBrowseError,
  installedModIds,
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
  searchTotalCount: number;
  setSearchTotalCount: (n: number) => void;
  query: string;
  setQuery: (q: string) => void;
  filters: ModSearchFilters;
  setFilters: (f: ModSearchFilters) => void;
  sort: ModBrowseSort;
  setSort: (s: ModBrowseSort) => void;
  filterSheetOpen: boolean;
  setFilterSheetOpen: (open: boolean) => void;
  browseSearchTrigger: number;
  browseBusy: boolean;
  setBrowseBusy: (b: boolean) => void;
  setBrowseError: (e: string | null) => void;
  installedModIds: ReadonlySet<number>;
  onOpenMod: (mod: ModSummary) => void;
  onOpenCollections: () => void;
  refreshBrowse: () => Promise<void>;
}) {
  const { pullDistance, refreshing, pullProps } = usePullToRefresh(refreshBrowse, true);
  const showResults = query.trim().length > 0 || hasActiveFilters(filters);
  const hasDiscoveryContent = DISCOVERY_SHELVES.some((s) => discovery[s.key].length > 0);
  const activeGame = games.find((g) => g.domain === gameDomain);
  const filterCount = activeFilterCount(filters);
  const canLoadMore = showResults && searchResults.length < searchTotalCount;
  const [shelfView, setShelfView] = useState<{ key: string; title: string } | null>(null);
  const [shelfMods, setShelfMods] = useState<ModSummary[]>([]);
  const [shelfBusy, setShelfBusy] = useState(false);
  const [shelfHasMore, setShelfHasMore] = useState(true);

  const isInstalled = (modId: number) => installedModIds.has(modId);

  const loadShelf = useCallback(
    async (key: string, offset = 0) => {
      const spec = SHELF_DRILL_DOWN[key];
      if (!spec) return;
      setShelfBusy(true);
      try {
        const mods = await fetchBrowseShelf(paired, gameDomain, {
          sort: spec.sort,
          offset,
          updated_since_days: spec.updated_since_days,
        });
        setShelfMods((prev) => (offset === 0 ? mods : [...prev, ...mods]));
        setShelfHasMore(mods.length >= SHELF_PAGE_SIZE);
        setBrowseError(null);
      } catch (err) {
        setBrowseError(err instanceof Error ? err.message : String(err));
      } finally {
        setShelfBusy(false);
      }
    },
    [paired, gameDomain, setBrowseError]
  );

  const openShelf = (key: string, title: string) => {
    setShelfView({ key, title });
    setShelfMods([]);
    setShelfHasMore(true);
    void loadShelf(key, 0);
  };

  const runSearch = useCallback(
    async (
      options: {
        append?: boolean;
        filters?: ModSearchFilters;
        sort?: ModBrowseSort;
        query?: string;
      } = {}
    ) => {
      const nextFilters = options.filters ?? filters;
      const nextSort = options.sort ?? sort;
      const nextQuery = (options.query ?? query).trim();
      if (!nextQuery && !hasActiveFilters(nextFilters)) return;
      setBrowseBusy(true);
      try {
        const offset = options.append ? searchResults.length : 0;
        const result = await searchModsFiltered(paired, gameDomain, {
          query: nextQuery,
          sort: nextSort,
          offset,
          count: PAGE_SIZE,
          filters: nextFilters,
        });
        setSearchResults(options.append ? [...searchResults, ...result.mods] : result.mods);
        setSearchTotalCount(result.total_count);
        setBrowseError(null);
      } catch (err) {
        setBrowseError(err instanceof Error ? err.message : String(err));
      } finally {
        setBrowseBusy(false);
      }
    },
    [
      paired,
      gameDomain,
      query,
      sort,
      filters,
      searchResults,
      setBrowseBusy,
      setBrowseError,
      setSearchResults,
      setSearchTotalCount,
    ]
  );

  const runSearchRef = useRef(runSearch);
  runSearchRef.current = runSearch;

  useEffect(() => {
    if (browseSearchTrigger === 0) return;
    void runSearchRef.current();
  }, [browseSearchTrigger]);

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
        <button
          type="button"
          className="cc-filter-btn"
          aria-label="Open filters"
          onClick={() => setFilterSheetOpen(true)}
        >
          <FilterIcon className="h-5 w-5" />
          {filterCount > 0 && <span className="cc-filter-badge">{filterCount}</span>}
        </button>
        <div className="cc-search-field min-w-0 flex-1">
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
        <button
          type="button"
          className="cc-btn shrink-0 px-4"
          disabled={browseBusy}
          onClick={() => void runSearch()}
        >
          Go
        </button>
      </div>

      {showResults && (
        <ActiveFilterBar
          filters={filters}
          onChange={(next) => {
            setFilters(next);
            void runSearch({ filters: next });
          }}
        />
      )}

      {showResults ? (
        <section>
          <p className="cc-section-label px-4">
            Results{" "}
            <span className="cc-count">
              {searchTotalCount > 0 ? searchTotalCount : searchResults.length}
            </span>
          </p>
          <div className="cc-list">
            {searchResults.map((mod) => (
              <CcListRow key={mod.mod_id} mod={mod} installed={isInstalled(mod.mod_id)} onOpen={onOpenMod} />
            ))}
          </div>
          {canLoadMore && (
            <div className="px-4 pb-4 pt-2">
              <button
                type="button"
                className="cc-btn-secondary w-full"
                disabled={browseBusy}
                onClick={() => void runSearch({ append: true })}
              >
                {browseBusy ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
      ) : shelfView ? (
        <section>
          <div className="flex items-center justify-between px-4">
            <p className="cc-section-label !mb-0">{shelfView.title}</p>
            <button type="button" className="cc-btn-ghost text-xs" onClick={() => setShelfView(null)}>
              ← Back
            </button>
          </div>
          <div className="cc-list">
            {shelfMods.map((mod) => (
              <CcListRow key={mod.mod_id} mod={mod} installed={isInstalled(mod.mod_id)} onOpen={onOpenMod} />
            ))}
          </div>
          {shelfHasMore && shelfMods.length > 0 && (
            <div className="px-4 pb-4 pt-2">
              <button
                type="button"
                className="cc-btn-secondary w-full"
                disabled={shelfBusy}
                onClick={() => void loadShelf(shelfView.key, shelfMods.length)}
              >
                {shelfBusy ? "Loading…" : "Load more"}
              </button>
            </div>
          )}
        </section>
      ) : (
        DISCOVERY_SHELVES.map((shelf) => {
          const mods = discovery[shelf.key];
          if (!mods.length) return null;
          const previewCount = shelf.previewCount ?? 6;
          if (shelf.layout === "hero") {
            return (
              <section key={shelf.key} className="cc-section">
                <ShelfHeader
                  title={shelf.title}
                  shelfKey={shelf.key}
                  modCount={mods.length}
                  previewCount={previewCount}
                  onSeeAll={openShelf}
                />
                <div className="cc-hero-track">
                  {mods.slice(0, previewCount).map((mod) => (
                    <CcHeroCard
                      key={mod.mod_id}
                      mod={mod}
                      installed={isInstalled(mod.mod_id)}
                      onOpen={onOpenMod}
                    />
                  ))}
                </div>
              </section>
            );
          }
          if (shelf.layout === "shelf") {
            return (
              <section key={shelf.key} className="cc-section">
                <ShelfHeader
                  title={shelf.title}
                  shelfKey={shelf.key}
                  modCount={mods.length}
                  previewCount={previewCount}
                  onSeeAll={openShelf}
                />
                <div className="cc-shelf-track">
                  {mods.slice(0, previewCount).map((mod) => (
                    <CcTile
                      key={mod.mod_id}
                      mod={mod}
                      installed={isInstalled(mod.mod_id)}
                      className="cc-shelf-tile"
                      onOpen={onOpenMod}
                    />
                  ))}
                </div>
              </section>
            );
          }
          return (
            <section key={shelf.key} className="cc-section">
              <ShelfHeader
                title={shelf.title}
                shelfKey={shelf.key}
                modCount={mods.length}
                previewCount={previewCount}
                onSeeAll={openShelf}
              />
              <div className="cc-list">
                {mods.slice(0, previewCount).map((mod) => (
                  <CcListRow
                    key={mod.mod_id}
                    mod={mod}
                    installed={isInstalled(mod.mod_id)}
                    onOpen={onOpenMod}
                  />
                ))}
              </div>
            </section>
          );
        })
      )}

      {!browseBusy && !hasDiscoveryContent && !showResults && (
        <p className="px-4 text-sm text-[var(--cc-muted)]">
          No mods loaded yet. Search above, open filters, or browse collections.
        </p>
      )}

      <BrowseFilterSheet
        open={filterSheetOpen}
        paired={paired}
        gameDomain={gameDomain}
        filters={filters}
        sort={sort}
        onFiltersChange={setFilters}
        onSortChange={setSort}
        onApply={(next) => {
          setFilters(next.filters);
          setSort(next.sort);
          void runSearch({ filters: next.filters, sort: next.sort });
        }}
        onClose={() => setFilterSheetOpen(false)}
      />
    </div>
  );
}
