import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, LayoutGrid, Search, ShieldAlert, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ModHeroCarousel } from "@/components/home/ModHeroCarousel";
import { ModRowCarousel } from "@/components/home/ModRowCarousel";
import { ModCard } from "@/components/mod/ModCard";
import { api } from "@/lib/commands";
import { getUserMessage } from "@/lib/apiError";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { cn } from "@/lib/utils";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import type { ModSummary } from "@/lib/nexus/types";

interface DiscoveryFeeds {
  featured: ModSummary[];
  topEndorsed: ModSummary[];
  mostDownloaded: ModSummary[];
  recentlyUpdated: ModSummary[];
}

const EMPTY_FEEDS: DiscoveryFeeds = {
  featured: [],
  topEndorsed: [],
  mostDownloaded: [],
  recentlyUpdated: [],
};

type DiscoverView = "highlights" | "browse";
type BrowseSort = "endorsements" | "downloads" | "updated";

const BROWSE_PAGE = 24;

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

  const [view, setView] = useState<DiscoverView>("highlights");
  const [sort, setSort] = useState<BrowseSort>("endorsements");
  const [hideAdult, setHideAdult] = useState(false);
  const [browseMods, setBrowseMods] = useState<ModSummary[]>([]);
  const [browseLoading, setBrowseLoading] = useState(false);
  const [browseLoadingMore, setBrowseLoadingMore] = useState(false);
  const [browseError, setBrowseError] = useState<unknown>(null);
  const [browseTotal, setBrowseTotal] = useState(0);
  const [browseHasMore, setBrowseHasMore] = useState(false);
  const [browseNonce, setBrowseNonce] = useState(0);

  const showHero = sections === "hero" || sections === "all";
  const showRows = sections === "rows" || sections === "all";

  const discoverTabIds =
    view === "browse"
      ? (["endorsements", "downloads", "updated"] as const)
      : (["highlights", "browse"] as const);
  const activeDiscoverTab = view === "browse" ? sort : view;

  useGamepadTabs(
    [...discoverTabIds],
    activeDiscoverTab,
    (tab) => {
      if (view === "browse") {
        setSort(tab as BrowseSort);
      } else {
        setView(tab as DiscoverView);
      }
    }
  );

  const loadDiscovery = () => {
    setLoading(true);
    setError(null);

    Promise.all([
      api.searchModsFiltered(domain, "", "endorsements", 0, 12, DEFAULT_FILTERS),
      api.getTrendingMods(domain, 12),
      api.searchModsFiltered(domain, "", "updated", 0, 12, DEFAULT_FILTERS),
    ])
      .then(([endorsedResult, downloaded, updatedResult]) => {
        setFeeds({
          featured: endorsedResult.mods.slice(0, 6),
          topEndorsed: endorsedResult.mods,
          mostDownloaded: downloaded,
          recentlyUpdated: updatedResult.mods,
        });
      })
      .catch((e) => {
        setError(e);
        setFeeds(EMPTY_FEEDS);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    loadDiscovery();
  }, [domain]);

  // Browse grid — paginated, driven by the toolbar. Reset on sort/filter change.
  useEffect(() => {
    if (!showRows || view !== "browse") return;
    let active = true;
    setBrowseLoading(true);
    setBrowseError(null);
    api
      .searchModsFiltered(domain, "", sort, 0, BROWSE_PAGE, {
        ...DEFAULT_FILTERS,
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
  }, [showRows, view, domain, sort, hideAdult, browseNonce]);

  const loadMoreBrowse = () => {
    setBrowseLoadingMore(true);
    setBrowseError(null);
    api
      .searchModsFiltered(domain, "", sort, browseMods.length, BROWSE_PAGE, {
        ...DEFAULT_FILTERS,
        hide_adult: hideAdult,
      })
      .then((result) => {
        setBrowseMods((prev) => [...prev, ...result.mods]);
        setBrowseHasMore(result.mods.length >= BROWSE_PAGE);
      })
      .catch((e) => setBrowseError(e))
      .finally(() => setBrowseLoadingMore(false));
  };

  const hasAnyMods =
    feeds.featured.length > 0 ||
    feeds.topEndorsed.length > 0 ||
    feeds.mostDownloaded.length > 0 ||
    feeds.recentlyUpdated.length > 0;

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
          <Link to="/games/$domain/mods" params={{ domain }} search={{ modId: undefined }}>
            <Button>Browse all mods</Button>
          </Link>
        </div>
      }
      className="py-10"
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
            <SegmentedControl
              ariaLabel="Sort mods"
              size="sm"
              value={sort}
              onChange={setSort}
              options={[
                { value: "endorsements", label: "Endorsed" },
                { value: "downloads", label: "Downloaded" },
                { value: "updated", label: "Updated" },
              ]}
            />
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

      {view === "highlights" ? (
        loading ? (
          <ModGridSkeleton count={3} />
        ) : !hasAnyMods ? (
          emptyState
        ) : (
          <div className={compact ? "space-y-6" : "space-y-8"}>
            <ModRowCarousel
              title="Most endorsed"
              mods={feeds.topEndorsed}
              domain={domain}
              compact={compact}
            />
            <ModRowCarousel
              title="Most downloaded"
              mods={feeds.mostDownloaded}
              domain={domain}
              compact={compact}
            />
            <ModRowCarousel
              title="Recently updated"
              mods={feeds.recentlyUpdated}
              domain={domain}
              compact={compact}
            />
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
          description="Try a different sort, or turn off the adult-content filter."
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
