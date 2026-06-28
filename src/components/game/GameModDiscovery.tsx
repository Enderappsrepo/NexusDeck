import { useCallback, useEffect, useMemo, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, LayoutGrid, Search, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ModHeroCarousel } from "@/components/home/ModHeroCarousel";
import { ModRowCarousel } from "@/components/home/ModRowCarousel";
import { ModCard } from "@/components/mod/ModCard";
import { ModCategoryChips } from "@/components/mod/ModCategoryChips";
import { api } from "@/lib/commands";
import { getUserMessage } from "@/lib/apiError";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import {
  MOD_SORT_OPTIONS,
  MOD_SORT_SEGMENTS,
  MOD_SORT_SEGMENTS_COMPACT,
  type ModSort,
} from "@/lib/nexus/modSorts";
import type { ModSearchFilters } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { focusedBrowseModId } from "@/lib/gamepad/domHelpers";
import { useEndorseFocusedMod } from "@/hooks/useEndorseFocusedMod";
import { useGamesStore, useDownloadsStore, useModsStore } from "@/stores";
import { modFileDownloadName, type ModSummary } from "@/lib/nexus/types";

interface DiscoveryFeeds {
  featured: ModSummary[];
  topEndorsed: ModSummary[];
  mostDownloaded: ModSummary[];
  trending: ModSummary[];
  newlyAdded: ModSummary[];
  recentlyUpdated: ModSummary[];
  hotThisWeek: ModSummary[];
}

const EMPTY_FEEDS: DiscoveryFeeds = {
  featured: [],
  topEndorsed: [],
  mostDownloaded: [],
  trending: [],
  newlyAdded: [],
  recentlyUpdated: [],
  hotThisWeek: [],
};

type DiscoverView = "highlights" | "browse";

const BROWSE_PAGE = 24;
const FEED_COUNT = 12;

const DISCOVERY_FEED_ROWS: {
  key: keyof Omit<DiscoveryFeeds, "featured">;
  title: string;
  sort: ModSort;
  filterPatch?: Partial<ModSearchFilters>;
}[] = [
  { key: "topEndorsed", title: "Most endorsed", sort: "endorsements" },
  { key: "mostDownloaded", title: "Most downloaded", sort: "downloads" },
  { key: "trending", title: "Trending now", sort: "trending", filterPatch: { updated_since_days: 30 } },
  { key: "newlyAdded", title: "Newly added", sort: "created" },
  { key: "recentlyUpdated", title: "Recently updated", sort: "updated" },
  { key: "hotThisWeek", title: "Hot this week", sort: "endorsements", filterPatch: { updated_since_days: 7 } },
];

interface GameModDiscoveryProps {
  domain: string;
  signedIn: boolean;
  sections?: "hero" | "rows" | "all";
  compact?: boolean;
}

export function GameModDiscovery({
  domain,
  signedIn,
  sections = "all",
  compact = false,
}: GameModDiscoveryProps) {
  const [feeds, setFeeds] = useState<DiscoveryFeeds>(EMPTY_FEEDS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<unknown>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);

  const [view, setView] = useState<DiscoverView>("highlights");
  const [sort, setSort] = useState<ModSort>("endorsements");
  const [hideAdult, setHideAdult] = useState(false);
  const [browseMods, setBrowseMods] = useState<ModSummary[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState<unknown>(null);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseNonce, setBrowseNonce] = useState(0);

  const { categories, categoriesLoading, loadCategories } = useModsStore();

  const showHero = sections === "hero" || sections === "all";
  const showRows = sections === "rows" || sections === "all";

  const discoverTabIds =
    view === "browse" ? [...MOD_SORT_OPTIONS] : (["highlights", "browse"] as const);
  const activeDiscoverTab = view === "browse" ? sort : view;

  useGamepadTabs(
    showRows ? [...discoverTabIds] : [],
    activeDiscoverTab,
    (tab) => {
      if (view === "browse") {
        setSort(tab as ModSort);
      } else {
        setView(tab as DiscoverView);
      }
    }
  );

  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const setProgress = useDownloadsStore((s) => s.setProgress);

  const categoryFilters = useMemo(
    (): ModSearchFilters => ({
      ...DEFAULT_FILTERS,
      category: selectedCategory,
    }),
    [selectedCategory]
  );

  useEffect(() => {
    if (showRows) loadCategories(domain);
  }, [domain, showRows, loadCategories]);

  useGamepadContextAction(
    GP.X,
    () => {
      if (view !== "browse") return;
      const modIdNum = focusedBrowseModId();
      if (!modIdNum || !profile) return;
      void (async () => {
        try {
          const modFiles = await api.getModFiles(domain, modIdNum);
          const primary = modFiles.find((f) => f.is_primary) ?? modFiles[0];
          if (!primary) return;
          const modName =
            browseMods.find((m) => m.mod_id === modIdNum)?.name ??
            feeds.topEndorsed.find((m) => m.mod_id === modIdNum)?.name;
          const progress = await api.startModDownload({
            gameDomain: domain,
            modId: modIdNum,
            fileId: primary.file_id,
            fileName: modFileDownloadName(primary),
            stagingPath: profile.staging_path,
            expectedSizeKb: primary.size_kb,
            modName,
            profileId: profile.id,
          });
          setProgress(progress);
        } catch {
          // Fall through — user can open mod detail manually
        }
      })();
      return true;
    },
    "discover"
  );

  const endorseMods =
    view === "browse"
      ? browseMods
      : [
          ...feeds.topEndorsed,
          ...feeds.mostDownloaded,
          ...feeds.trending,
          ...feeds.newlyAdded,
          ...feeds.recentlyUpdated,
          ...feeds.hotThisWeek,
        ];
  useEndorseFocusedMod(domain, endorseMods, "discover");

  const loadDiscovery = useCallback(() => {
    setLoading(true);
    setError(null);

    void Promise.allSettled(
      DISCOVERY_FEED_ROWS.map((row) =>
        api.searchModsFiltered(
          domain,
          "",
          row.sort,
          0,
          FEED_COUNT,
          { ...categoryFilters, ...row.filterPatch }
        )
      )
    ).then((results) => {
      const next = { ...EMPTY_FEEDS } as DiscoveryFeeds;
      let anySuccess = false;

      DISCOVERY_FEED_ROWS.forEach((row, i) => {
        const result = results[i];
        if (result.status === "fulfilled") {
          next[row.key] = result.value.mods;
          anySuccess = true;
        } else {
          console.warn(`[NexusDeck] Discovery feed "${row.title}" failed:`, result.reason);
        }
      });

      next.featured = next.topEndorsed.slice(0, 6);
      setFeeds(next);

      if (!anySuccess) {
        const firstFailure = results.find((r) => r.status === "rejected");
        setError(
          firstFailure && firstFailure.status === "rejected"
            ? firstFailure.reason
            : new Error("Could not load mods")
        );
      }
    }).finally(() => setLoading(false));
  }, [domain, categoryFilters]);

  useEffect(() => {
    if (showRows || showHero) loadDiscovery();
  }, [loadDiscovery, showRows, showHero]);

  // Browse grid — paginated, driven by the toolbar. Reset on sort/filter change.
  useEffect(() => {
    if (!showRows || view !== "browse") return;
    let active = true;
    setBrowseLoading(true);
    setBrowseError(null);
    api
      .searchModsFiltered(domain, "", sort, 0, BROWSE_PAGE, {
        ...categoryFilters,
        hide_adult: hideAdult,
      })
      .then((result) => {
        if (!active) return;
        setBrowseMods(result.mods);
        setBrowseTotal(result.total_count);
        setBrowseHasMore(result.mods.length >= BROWSE_PAGE);
      })
      .catch((e) => {
        if (!active) return;
        setBrowseError(e);
        setBrowseMods([]);
      })
      .finally(() => {
        if (active) setBrowseLoading(false);
      });
    return () => {
      active = false;
    };
  }, [showRows, view, domain, sort, hideAdult, browseNonce, categoryFilters]);

  const loadMoreBrowse = () => {
    setBrowseLoadingMore(true);
    setBrowseError(null);
    api
      .searchModsFiltered(domain, "", sort, browseMods.length, BROWSE_PAGE, {
        ...categoryFilters,
        hide_adult: hideAdult,
      })
      .then((result) => {
        setBrowseMods((prev) => [...prev, ...result.mods]);
        setBrowseHasMore(result.mods.length >= BROWSE_PAGE);
      })
      .catch((e) => setBrowseError(e))
      .finally(() => setBrowseLoadingMore(false));
  };

  const hasAnyMods = Object.values(feeds).some((list) => list.length > 0);

  const sortSegments = compact ? MOD_SORT_SEGMENTS_COMPACT : MOD_SORT_SEGMENTS;

  const emptyState = (
    <EmptyState
      icon={Sparkles}
      title="No mods to show"
      description={
        error
          ? getUserMessage("mods", error).userMessage
          : signedIn
            ? "Search above to find mods for this game."
            : "Sign in with your Nexus API key in Settings to browse mods."
      }
      action={
        <div className="flex flex-wrap justify-center gap-2">
          {!!error && (
            <Button variant="secondary" onClick={loadDiscovery}>
              Retry
            </Button>
          )}
          {!signedIn ? (
            <Link to="/settings">
              <Button>Open Settings</Button>
            </Link>
          ) : (
            <Link to="/games/$domain/mods" params={{ domain }} search={{ modId: undefined }}>
              <Button>Browse all mods</Button>
            </Link>
          )}
        </div>
      }
      className="py-10"
    />
  );

  const categoryChips = showRows && (
    <ModCategoryChips
      categories={categories}
      selected={selectedCategory}
      onSelect={setSelectedCategory}
      loading={categoriesLoading}
      className="mb-4"
    />
  );

  // Hero-only usage (Play tab) — unchanged behavior.
  if (!showRows) {
    if (loading) return <ModGridSkeleton count={3} />;
    if (!hasAnyMods) return emptyState;
    return (
      <div className={compact ? "space-y-6" : "space-y-8"}>
        {showHero && (
          <ModHeroCarousel mods={feeds.featured} domain={domain} label="Featured" />
        )}
      </div>
    );
  }

  // Discover usage — Highlights / Browse switcher.
  return (
    <div className={compact ? "space-y-5" : "space-y-6"}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SegmentedControl
          ariaLabel="Discover view"
          size="sm"
          value={view}
          onChange={setView}
          options={[
            { value: "highlights", label: "Highlights", icon: Sparkles },
            { value: "browse", label: "Browse", icon: LayoutGrid },
          ]}
        />
        {view === "browse" && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="max-w-full overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
              <SegmentedControl
                ariaLabel="Sort mods"
                size="sm"
                value={sort}
                onChange={setSort}
                options={sortSegments}
              />
            </div>
            <button
              type="button"
              onClick={() => setHideAdult((v) => !v)}
              aria-pressed={hideAdult}
              className={cn(
                "focusable inline-flex min-h-[40px] items-center gap-1.5 rounded-lg border px-3 text-sm font-medium transition-colors",
                hideAdult
                  ? "border-[var(--color-primary)]/50 bg-[var(--color-primary)]/12 text-[var(--color-primary)]"
                  : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
              )}
              data-focusable="true"
            >
              <ShieldAlert className="h-4 w-4" />
              Hide adult
              {hideAdult && <Check className="h-4 w-4" />}
            </button>
          </div>
        )}
      </div>

      {categoryChips}

      {view === "highlights" ? (
        loading ? (
          <ModGridSkeleton count={3} />
        ) : !hasAnyMods ? (
          emptyState
        ) : (
          <div className={compact ? "space-y-6" : "space-y-8"}>
            {DISCOVERY_FEED_ROWS.map((row) => (
              <ModRowCarousel
                key={row.key}
                title={row.title}
                mods={feeds[row.key]}
                domain={domain}
                compact={compact}
                sort={row.sort}
                category={selectedCategory}
                filterPatch={row.filterPatch}
              />
            ))}
          </div>
        )
      ) : browseLoading ? (
        <ModGridSkeleton count={6} />
      ) : browseError && browseMods.length === 0 ? (
        <EmptyState
          icon={Search}
          title="Couldn't load mods"
          description={getUserMessage("mods", browseError).userMessage}
          action={
            <Button variant="secondary" onClick={() => setBrowseNonce((n) => n + 1)}>
              Retry
            </Button>
          }
          className="py-10"
        />
      ) : browseMods.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No mods found"
          description="Try a different sort, category, or turn off the adult-content filter."
          className="py-10"
        />
      ) : (
        <>
          <p className="text-sm text-[var(--color-muted)]">
            {browseTotal.toLocaleString()} mod{browseTotal !== 1 ? "s" : ""}
          </p>
          <div className="mod-grid">
            {browseMods.map((mod) => (
              <ModCard key={mod.mod_id} mod={mod} domain={domain} compact={compact} />
            ))}
          </div>
          {browseHasMore && (
            <div className="mt-8 flex justify-center">
              <Button
                variant="secondary"
                size="lg"
                onClick={loadMoreBrowse}
                disabled={browseLoadingMore}
                className="min-w-[200px]"
              >
                {browseLoadingMore ? "Loading more…" : "Load more mods"}
              </Button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
