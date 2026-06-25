import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import {
  FlaskConical,
  FolderInput,
  Heart,
  Search,
  SlidersHorizontal,
} from "lucide-react";
import { ModSearchBar } from "@/components/mod/ModSearchBar";
import { ModFilterPanel } from "@/components/mod/ModFilterPanel";
import { ModCard } from "@/components/mod/ModCard";
import { ImportModDialog } from "@/components/mod/ImportModDialog";
import { PostSetupBanner } from "@/components/game/PostSetupBanner";
import { SetupRequiredState } from "@/components/game/SetupRequiredState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SegmentedControl } from "@/components/ui/SegmentedControl";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { EmptyState } from "@/components/ui/EmptyState";
import { CardSkeleton, ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { useModsStore, useGamesStore, useAuthStore, useDownloadsStore } from "@/stores";
import { api } from "@/lib/commands";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { cn, gameGradient } from "@/lib/utils";
import type { ModSearchFilters, SupportedGameInfo } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";
import { getGameMeta, loadSupportedGames } from "@/lib/games";
import {
  useGamepadContextAction,
  useGamepadRouterState,
  useGamepadTabs,
} from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { focusedBrowseModId } from "@/lib/gamepad/domHelpers";
import { useEndorseFocusedMod } from "@/hooks/useEndorseFocusedMod";

const SORT_OPTIONS = ["endorsements", "downloads", "updated"] as const;
type SortValue = (typeof SORT_OPTIONS)[number];

const SORT_SEGMENTS: { value: SortValue; label: string }[] = [
  { value: "endorsements", label: "Endorsed" },
  { value: "downloads", label: "Downloaded" },
  { value: "updated", label: "Updated" },
];

function parseFiltersFromSearch(search: Record<string, unknown>): ModSearchFilters {
  const tagsRaw = search.tags;
  const tags =
    typeof tagsRaw === "string"
      ? tagsRaw.split(",").filter(Boolean)
      : Array.isArray(tagsRaw)
        ? tagsRaw.map(String)
        : [];

  return {
    category: typeof search.category === "string" ? search.category : null,
    tags,
    min_endorsements:
      typeof search.minEndorsements === "number" ? search.minEndorsements : null,
    hide_adult: search.hideAdult === true || search.hideAdult === "true",
    updated_since_days:
      typeof search.updatedDays === "number" ? search.updatedDays : null,
  };
}

export interface ModsSearch {
  q?: string;
  modId?: number;
  welcome?: string;
  category?: string;
  tags?: string;
  minEndorsements?: number;
  hideAdult?: boolean;
  updatedDays?: number;
}

export const Route = createFileRoute("/games/$domain/mods/")({
  component: ModBrowserPage,
  validateSearch: (s: Record<string, unknown>): ModsSearch => ({
    q: typeof s.q === "string" ? s.q : undefined,
    modId: typeof s.modId === "number" ? s.modId : undefined,
    welcome: typeof s.welcome === "string" ? s.welcome : undefined,
    category: typeof s.category === "string" ? s.category : undefined,
    tags: typeof s.tags === "string" ? s.tags : undefined,
    minEndorsements:
      typeof s.minEndorsements === "number" ? s.minEndorsements : undefined,
    hideAdult: s.hideAdult === true || s.hideAdult === "true" ? true : undefined,
    updatedDays: typeof s.updatedDays === "number" ? s.updatedDays : undefined,
  }),
});

function ModBrowserPage() {
  const { domain } = useParams({ from: "/games/$domain/mods/" });
  const search = Route.useSearch();
  const navigate = useNavigate();
  const {
    mods,
    loading,
    loadingMore,
    error,
    query,
    sort,
    filters,
    categories,
    totalCount,
    hasMore,
    setQuery,
    setSort,
    setFilters,
    loadCategories,
    search: runSearch,
    loadMore,
  } = useModsStore();
  const { getProfile } = useGamesStore();
  const user = useAuthStore((s) => s.user);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const profile = getProfile(domain);
  const [importOpen, setImportOpen] = useState(false);
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);
  const [installedIds, setInstalledIds] = useState<Set<number>>(new Set());
  const [welcomeDismissed, setWelcomeDismissed] = useState(
    () => sessionStorage.getItem(`nexusdeck_welcome_${domain}`) === "1"
  );
  const sentinelRef = useRef<HTMLDivElement>(null);
  const { controllerActive } = useGamepadRouterState();
  const autoFocusedRef = useRef(false);

  useEffect(() => {
    loadSupportedGames().then(setSupportedGames);
  }, []);

  // Controller: once results land, move focus onto the first mod card so the
  // d-pad goes mod→mod immediately instead of starting on the page chrome.
  // Fires once per results load; never yanks focus out of the grid, the search
  // box, or an open filter panel.
  useEffect(() => {
    if (loading) {
      autoFocusedRef.current = false;
      return;
    }
    if (autoFocusedRef.current || !controllerActive || mods.length === 0 || filtersOpen) {
      return;
    }
    const active = document.activeElement as HTMLElement | null;
    if (active && active.closest("[data-nexus-mod-id], input, textarea")) return;
    autoFocusedRef.current = true;
    const raf = requestAnimationFrame(() => {
      document.querySelector<HTMLElement>("[data-nexus-mod-id]")?.focus();
    });
    return () => cancelAnimationFrame(raf);
  }, [loading, controllerActive, mods.length, filtersOpen]);

  useGamepadTabs([...SORT_OPTIONS], sort, setSort);

  useGamepadContextAction(
    GP.X,
    () => {
      const modIdNum = focusedBrowseModId();
      if (!modIdNum || !profile) return;
      void (async () => {
        try {
          const modFiles = await api.getModFiles(domain, modIdNum);
          const primary = modFiles.find((f) => f.is_primary) ?? modFiles[0];
          if (!primary) {
            navigate({
              to: "/games/$domain/mods/$modId",
              params: { domain, modId: String(modIdNum) },
            });
            return;
          }
          const progress = await api.startModDownload({
            gameDomain: domain,
            modId: modIdNum,
            fileId: primary.file_id,
            fileName: modFileDownloadName(primary),
            stagingPath: profile.staging_path,
            expectedSizeKb: primary.size_kb,
            modName: mods.find((m) => m.mod_id === modIdNum)?.name,
            profileId: profile.id,
          });
          setProgress(progress);
        } catch {
          navigate({
            to: "/games/$domain/mods/$modId",
            params: { domain, modId: String(modIdNum) },
          });
        }
      })();
      return true;
    },
    "browse"
  );

  useEndorseFocusedMod(domain, mods, "browse");

  useEffect(() => {
    loadCategories(domain);
  }, [domain, loadCategories]);

  // Which catalog mods are already in this profile's library (by Nexus mod id),
  // so the grid can flag them. Refreshes when the install queue changes length.
  useEffect(() => {
    if (!profile) return;
    let active = true;
    api
      .listInstalledMods(profile.id)
      .then((installed) => {
        if (active) setInstalledIds(new Set(installed.map((m) => m.nexus_mod_id)));
      })
      .catch(() => {});
    return () => {
      active = false;
    };
  }, [profile?.id]);

  useEffect(() => {
    const filters = parseFiltersFromSearch(search as Record<string, unknown>);
    setFilters({ ...DEFAULT_FILTERS, ...filters });
    setQuery(search.q ?? "");
    runSearch(domain);
  }, [domain, search, setFilters, setQuery, runSearch, sort]);

  useEffect(() => {
    if (search.modId) {
      navigate({
        to: "/games/$domain/mods/$modId",
        params: { domain, modId: String(search.modId) },
      });
    }
  }, [search.modId, domain, navigate]);

  // Lazy/infinite loading: fetch the next page as the sentinel nears the
  // viewport. Works for mouse scroll and controller focus alike (focusing a
  // card near the end scrolls it — and the sentinel — into the margin). The
  // store guards against overlapping fetches, so repeat fires are harmless.
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) void loadMore(domain);
      },
      { root: sentinel.closest("main"), rootMargin: "600px 0px" }
    );
    observer.observe(sentinel);
    return () => observer.disconnect();
  }, [domain, loadMore, hasMore, mods.length]);

  const applyFiltersToUrl = () => {
    const { filters, query: currentQuery } = useModsStore.getState();
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: {
        q: currentQuery.trim() || undefined,
        modId: undefined,
        category: filters.category ?? undefined,
        tags: filters.tags.length > 0 ? filters.tags.join(",") : undefined,
        minEndorsements: filters.min_endorsements ?? undefined,
        hideAdult: filters.hide_adult || undefined,
        updatedDays: filters.updated_since_days ?? undefined,
      },
    });
  };

  const handleSearch = () => {
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: {
        q: query.trim() || undefined,
        modId: undefined,
        category: search.category,
        tags: search.tags,
        minEndorsements: search.minEndorsements,
        hideAdult: search.hideAdult,
        updatedDays: search.updatedDays,
      },
    });
  };

  // One-tap category filter from the inline chip row (no need to open Filters).
  const selectCategory = (category: string | null) => {
    setFilters({ ...filters, category });
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: {
        q: query.trim() || undefined,
        modId: undefined,
        category: category ?? undefined,
        tags: search.tags,
        minEndorsements: search.minEndorsements,
        hideAdult: search.hideAdult,
        updatedDays: search.updatedDays,
      },
    });
  };

  if (!profile) {
    return (
      <SetupRequiredState
        domain={domain}
        gameName={getGameMeta(domain, supportedGames)?.display_name}
      />
    );
  }

  const gameMeta = getGameMeta(domain, supportedGames);
  const showWelcomeBanner = search.welcome === "1" && !welcomeDismissed;

  const isPremium = user?.is_premium ?? false;
  const resultLabel = query.trim() ? `Results for "${query.trim()}"` : "Popular mods";
  const activeFilterCount = [
    filters.category,
    filters.min_endorsements,
    filters.updated_since_days,
    filters.hide_adult,
    filters.tags.length > 0,
  ].filter(Boolean).length;

  return (
    <div className="mx-auto max-w-6xl" data-scroll-pane>
      {showWelcomeBanner && (
        <div className="mb-6">
          <PostSetupBanner
          domain={domain}
          gameName={gameMeta?.display_name ?? profile.name}
          showDeckFix={domain === "skyrimspecialedition"}
          onDismiss={() => {
            sessionStorage.setItem(`nexusdeck_welcome_${domain}`, "1");
            setWelcomeDismissed(true);
            navigate({
              to: "/games/$domain/mods",
              params: { domain },
              search: { ...search, welcome: undefined, modId: undefined },
              replace: true,
            });
          }}
          />
        </div>
      )}

      {/* Page header */}
      <header className="page-hero mb-6">
        <div className="relative p-5 sm:p-8">
          <div
            className={cn(
              "pointer-events-none absolute inset-0 bg-gradient-to-br opacity-40",
              gameGradient(domain)
            )}
          />
          <div className="relative">
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <Link
                  to="/games/$domain"
                  params={{ domain }}
                  className="focusable mb-2 inline-block text-sm text-[var(--color-muted)] hover:text-[var(--color-primary)]"
                  data-focusable="true"
                >
                  ← {profile.name}
                </Link>
                <h1 className="text-3xl font-bold tracking-tight">Mod Browser</h1>
                <p className="mt-1 text-[var(--color-muted)]">
                  Search and browse the Nexus Mods catalog
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                {isPremium ? (
                  <Badge variant="success">Premium — API downloads</Badge>
                ) : (
                  <Badge variant="warning">Free — browser download or Import</Badge>
                )}
              </div>
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="secondary" size="sm" onClick={() => setImportOpen(true)}>
                <FolderInput className="h-4 w-4" />
                Import / Test install
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={async () => {
                  await api.createPracticeMod(profile.id);
                  setImportOpen(true);
                }}
              >
                <FlaskConical className="h-4 w-4" />
                Quick practice test
              </Button>
            </div>
          </div>
        </div>
      </header>

      {!user && <SignInPrompt className="mb-4" />}

      {/* Sticky toolbar — stacks on mobile, spreads out on larger screens */}
      <div className="mods-toolbar">
        <div className="flex flex-col gap-3 rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] p-3 shadow-[var(--shadow-md)] sm:gap-4 sm:p-5">
          {/* Search gets its own full-width row */}
          <ModSearchBar
            value={query}
            onChange={setQuery}
            onSearch={handleSearch}
            loading={loading}
            placeholder={`Search ${profile.name} mods...`}
          />

          {/* Sort + filters: full-width stacked controls on mobile, inline on sm+ */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <SegmentedControl
              ariaLabel="Sort mods"
              size="sm"
              value={sort as SortValue}
              onChange={(v) => setSort(v)}
              options={SORT_SEGMENTS}
              fill
              className="w-full sm:w-auto"
            />
            <Button
              variant={filtersOpen ? "default" : "secondary"}
              size="lg"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="w-full shrink-0 sm:w-auto"
              aria-expanded={filtersOpen}
            >
              <SlidersHorizontal className="h-5 w-5" />
              Filters
              {activeFilterCount > 0 && (
                <Badge variant="default" className="ml-1">
                  {activeFilterCount}
                </Badge>
              )}
            </Button>
          </div>

          {filtersOpen && (
            <ModFilterPanel onApply={applyFiltersToUrl} embedded />
          )}
        </div>
      </div>

      {/* Category quick-filter chips — one tap, no need to open Filters */}
      {categories.length > 0 && (
        <div className="mb-5 flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => selectCategory(null)}
            className={cn(
              "game-nav-chip focusable shrink-0",
              !filters.category &&
                "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
            )}
            data-focusable="true"
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.category_id}
              type="button"
              onClick={() => selectCategory(c.name)}
              className={cn(
                "game-nav-chip focusable shrink-0",
                filters.category === c.name &&
                  "border-[var(--color-primary)]/60 bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
              )}
              data-focusable="true"
            >
              {c.name}
            </button>
          ))}
        </div>
      )}

      {/* Results header */}
      <div className="page-header mb-5">
        <div>
          <h2 className="page-header-title">{resultLabel}</h2>
          {!loading && (
            <p className="page-header-subtitle">
              {totalCount > 0
                ? `Showing ${mods.length.toLocaleString()} of ${totalCount.toLocaleString()}`
                : mods.length > 0
                  ? `${mods.length} mods`
                  : "No results"}
            </p>
          )}
        </div>
        {!loading && mods.length > 0 && (
          <div className="flex gap-2">
            <span className="stat-pill">
              <Heart className="h-3.5 w-3.5" />
              Sorted by {sort === "endorsements" ? "endorsements" : sort === "downloads" ? "downloads" : "update date"}
            </span>
            {query.trim() && (
              <span className="stat-pill">
                <Search className="h-3.5 w-3.5" />
                Search active
              </span>
            )}
          </div>
        )}
      </div>

      {error && (
        <ApiErrorBanner
          context="mods"
          error={error}
          onRetry={() => runSearch(domain)}
          className="mb-4"
        />
      )}

      {loading && mods.length === 0 && <ModGridSkeleton count={6} className="mb-4" />}

      {!loading && !error && mods.length === 0 && (
        <EmptyState
          icon={Search}
          title={query.trim() ? "No mods matched your search" : "No mods found"}
          description={
            query.trim()
              ? "Try a different search term or adjust your filters."
              : "Check your API key in Settings and try again."
          }
          className="mb-6"
        />
      )}

      <div className="mod-grid">
        {mods.map((mod) => (
          <ModCard
            key={mod.mod_id}
            mod={mod}
            domain={domain}
            installed={installedIds.has(mod.mod_id)}
          />
        ))}
        {loadingMore &&
          Array.from({ length: 4 }).map((_, i) => (
            <CardSkeleton key={`more-skeleton-${i}`} />
          ))}
      </div>

      {hasMore && mods.length > 0 && (
        <>
          {/* Sentinel: auto-loads the next page as it nears the viewport. */}
          <div ref={sentinelRef} aria-hidden className="h-px w-full" />
          <div className="mt-8 flex justify-center">
            <Button
              variant="secondary"
              onClick={() => loadMore(domain)}
              disabled={loadingMore}
              className="min-w-[200px]"
              data-focusable="true"
            >
              {loadingMore ? "Loading…" : "Load more mods"}
            </Button>
          </div>
        </>
      )}

      <ImportModDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        profile={profile}
      />
    </div>
  );
}
