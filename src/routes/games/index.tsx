import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Gamepad2, Search, Sparkles } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { GameCard } from "@/components/game/GameCard";
import { ModGridSkeleton } from "@/components/ui/LoadingSkeleton";
import { EmptyState } from "@/components/ui/EmptyState";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { api } from "@/lib/commands";
import { loadSupportedGames, isSupportedDomain } from "@/lib/games";
import { mergeGameCatalog, splitGameCatalog } from "@/lib/gamesCatalog";
import { formatNumber } from "@/lib/utils";
import type { GameSummary, SupportedGameInfo } from "@/lib/nexus/types";

const PAGE_SIZE = 48;

export const Route = createFileRoute("/games/")({
  component: GamesPage,
});

function GamesPage() {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [apiGames, setApiGames] = useState<GameSummary[]>([]);
  const [totalCount, setTotalCount] = useState(0);
  const [supported, setSupported] = useState<SupportedGameInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadSupportedGames().then(setSupported);
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  const loadPage = useCallback(
    async (offset: number, append: boolean) => {
      if (offset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      try {
        const page = await api.listNexusGames(debouncedQuery, PAGE_SIZE, offset);
        setTotalCount(page.total_count);
        setApiGames((prev) => (append ? [...prev, ...page.games] : page.games));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        if (!append) {
          setApiGames([]);
          setTotalCount(0);
        }
      } finally {
        setLoading(false);
        setLoadingMore(false);
      }
    },
    [debouncedQuery]
  );

  useEffect(() => {
    void loadPage(0, false);
  }, [debouncedQuery, loadPage]);

  useGamepadContextAction(
    GP.X,
    () => {
      const el = document.activeElement?.closest<HTMLElement>("[data-game-domain]");
      const domain = el?.dataset.gameDomain;
      if (domain) navigate({ to: "/games/$domain", params: { domain } });
    },
    "games"
  );

  const catalog = useMemo(() => mergeGameCatalog(supported, apiGames), [supported, apiGames]);
  const { supported: supportedGames, other: otherGames } = useMemo(
    () => splitGameCatalog(catalog),
    [catalog]
  );

  const hasMore = apiGames.length < totalCount;

  return (
    <div className="mx-auto max-w-6xl" data-scroll-pane>
      <section className="page-hero mb-8">
        <div className="relative overflow-hidden p-8 sm:p-10">
          <div className="pointer-events-none absolute inset-0 bg-[image:var(--gradient-surface)]" />
          <div className="relative">
            <div className="mb-3 flex items-center gap-2">
              <Gamepad2 className="h-6 w-6 text-[var(--color-primary)]" />
              <Badge variant="muted">Game library</Badge>
            </div>
            <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">Browse games</h1>
            <p className="mt-2 max-w-2xl text-[var(--color-muted)]">
              {supported.length} titles with full mod install, library, and launch support — plus
              every game on Nexus Mods.
            </p>
            {!loading && totalCount > 0 && (
              <p className="mt-3 text-sm text-[var(--color-muted)]">
                Showing {catalog.length.toLocaleString()} of{" "}
                {Math.max(totalCount, catalog.length).toLocaleString()} games
              </p>
            )}
          </div>
        </div>
      </section>

      <div className="relative mb-8 max-w-xl">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          placeholder="Search all games on Nexus Mods..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="pl-10"
          data-games-search
          data-focusable="true"
        />
      </div>

      {error && (
        <p className="mb-6 rounded-xl bg-[var(--color-danger)]/10 p-4 text-sm text-[var(--color-danger)]">
          {error}. Supported games are still shown below.
        </p>
      )}

      {loading && catalog.length === 0 ? (
        <ModGridSkeleton count={6} />
      ) : catalog.length === 0 ? (
        <EmptyState
          icon={Search}
          title="No games matched your search"
          description="Try a shorter name or clear the search to browse the full catalog."
        />
      ) : (
        <div className="space-y-10">
          {supportedGames.length > 0 && (
            <section>
              <div className="mb-4 flex items-center gap-2">
                <Sparkles className="h-5 w-5 text-[var(--color-primary)]" />
                <h2 className="text-xl font-semibold">NexusDeck supported</h2>
                <Badge variant="success">{supportedGames.length}</Badge>
              </div>
              <p className="mb-5 text-sm text-[var(--color-muted)]">
                Install mods, manage load order, and launch with script extender support.
              </p>
              <div className="grid gap-5 lg:grid-cols-2">
                {supportedGames.map((g) => (
                  <GameCard
                    key={g.domain_name}
                    game={g}
                    supported
                    variant="featured"
                  />
                ))}
              </div>
            </section>
          )}

          {otherGames.length > 0 && (
            <section>
              <div className="mb-4 flex items-center justify-between gap-4">
                <h2 className="text-xl font-semibold">
                  {debouncedQuery ? "Search results" : "All games on Nexus Mods"}
                </h2>
                <span className="text-sm text-[var(--color-muted)]">
                  {formatNumber(otherGames.length)} shown
                </span>
              </div>
              <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {otherGames.map((g) => (
                  <GameCard key={g.domain_name} game={g} supported={false} />
                ))}
              </div>
            </section>
          )}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <Button
                variant="secondary"
                size="lg"
                disabled={loadingMore}
                data-focusable="true"
                onClick={() => void loadPage(apiGames.length, true)}
                className="min-w-[200px]"
              >
                {loadingMore ? "Loading…" : "Load more games"}
              </Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
