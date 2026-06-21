import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
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
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { useModsStore, useGamesStore, useAuthStore, useDownloadsStore } from "@/stores";
import { api } from "@/lib/commands";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { cn, gameGradient } from "@/lib/utils";
import type { ModSearchFilters } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";
import { useGamepadContextAction, useGamepadTabs } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { focusedBrowseModId } from "@/lib/gamepad/domHelpers";
import { useEndorseFocusedMod } from "@/hooks/useEndorseFocusedMod";

const SORT_OPTIONS = ["endorsements", "downloads", "updated"] as const;

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

  useGamepadTabs([...SORT_OPTIONS], sort, setSort);

  useGamepadContextAction(
    GP.X,
    async () => {
      const modIdNum = focusedBrowseModId();
      if (!modIdNum || !profile) return;
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
    },
    "browse"
  );

  useEndorseFocusedMod(domain, mods, "browse");

  useEffect(() => {
    loadCategories(domain);
  }, [domain, loadCategories]);

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

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <p className="text-[var(--color-muted)]">
          Set up this game before browsing mods.
        </p>
        <Link to="/games/$domain/setup" params={{ domain }}>
          <Button size="lg" className="mt-6">
            Set up game
          </Button>
        </Link>
      </div>
    );
  }

  const isPremium = user?.is_premium ?? false;
  const resultLabel = query.trim() ? `Results for "${query.trim()}"` : "Popular mods";

  return (
    <div className="mx-auto max-w-6xl" data-scroll-pane>
      {/* Page header */}
      <header className="page-hero mb-6">
        <div className="relative p-6 sm:p-8">
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

      {/* Sticky toolbar */}
      <div className="mods-toolbar">
        <div className="flex flex-col gap-4 rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] p-4 shadow-[var(--shadow-md)] sm:p-5">
          <div className="flex flex-wrap items-end gap-3">
            <ModSearchBar
              value={query}
              onChange={setQuery}
              onSearch={handleSearch}
              loading={loading}
              placeholder={`Search ${profile.name} mods...`}
              className="min-w-[200px] flex-1"
            />
            <select
              value={sort}
              onChange={(e) => setSort(e.target.value)}
              className="focusable h-14 rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-base transition-colors focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-focus)] focus-visible:outline-none"
              data-focusable="true"
              aria-label="Sort mods by"
            >
              <option value="endorsements">Most Endorsed</option>
              <option value="downloads">Most Downloaded</option>
              <option value="updated">Recently Updated</option>
            </select>
            <Button
              variant={filtersOpen ? "default" : "secondary"}
              size="lg"
              onClick={() => setFiltersOpen(!filtersOpen)}
              className="shrink-0"
            >
              <SlidersHorizontal className="h-5 w-5" />
              Filters
            </Button>
          </div>

          {filtersOpen && (
            <ModFilterPanel onApply={applyFiltersToUrl} embedded />
          )}
        </div>
      </div>

      {/* Results header */}
      <div className="page-header mb-5">
        <div>
          <h2 className="page-header-title">{resultLabel}</h2>
          {!loading && (
            <p className="page-header-subtitle">
              {totalCount > 0
                ? `${totalCount.toLocaleString()} mods found`
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
          <ModCard key={mod.mod_id} mod={mod} domain={domain} />
        ))}
      </div>

      {hasMore && mods.length > 0 && (
        <div className="mt-10 flex justify-center">
          <Button
            variant="secondary"
            size="lg"
            onClick={() => loadMore(domain)}
            disabled={loadingMore}
            className="min-w-[200px]"
          >
            {loadingMore ? "Loading more..." : "Load more mods"}
          </Button>
        </div>
      )}

      <ImportModDialog
        open={importOpen}
        onOpenChange={setImportOpen}
        profile={profile}
      />
    </div>
  );
}
