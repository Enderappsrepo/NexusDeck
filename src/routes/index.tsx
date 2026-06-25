import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  ArrowRight,
  Gamepad2,
  Library,
  Sparkles,
  TrendingUp,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { GameCard } from "@/components/game/GameCard";
import { GameArt } from "@/components/game/GameArt";
import { useAuthStore, useGamesStore } from "@/stores";
import { SignInPrompt } from "@/components/auth/SignInPrompt";
import { useLaunchStore } from "@/stores/launchStore";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
import { api } from "@/lib/commands";
import { loadSupportedGames, isSupportedDomain } from "@/lib/games";
import { cn, gameGradient } from "@/lib/utils";
import { normalizeGameSummaries } from "@/lib/nexus/games";
import type { GameSummary, SupportedGameInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/")({
  component: HomePage,
});

function HomePage() {
  const user = useAuthStore((s) => s.user);
  const authError = useAuthStore((s) => s.error);
  const { profiles, loadProfiles } = useGamesStore();
  const [games, setGames] = useState<GameSummary[]>([]);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    loadSupportedGames().then(setSupportedGames);
  }, []);

  useEffect(() => {
    api
      .listNexusGames("", 8, 0)
      .then((page) => setGames(normalizeGameSummaries(page.games)))
      .catch(() => setGames([]));
  }, []);

  const primaryProfile = profiles[0];
  const launchFromStore = useLaunchStore((s) => s.launch);

  useGamepadContextAction(
    GP.X,
    () => {
      if (primaryProfile) launchFromStore(primaryProfile.id).catch(() => {});
    },
    "home"
  );

  return (
    <div className="page-section mx-auto max-w-5xl" data-scroll-pane>
      {!user && (
        <SignInPrompt
          className="mb-6"
        />
      )}
      {authError && !user && (
        <p className="mb-6 text-sm text-[var(--color-danger)]">{authError}</p>
      )}
      {/* Hero */}
      <section className="page-hero">
        <div className="relative p-5 sm:p-10">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="max-w-2xl">
              <div className="mb-4 flex items-center gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--color-primary)] text-lg font-bold text-white shadow-[var(--shadow-md)]">
                  ND
                </div>
                <Badge variant="muted">Nexus Mods client</Badge>
              </div>
              <h1 className="text-4xl font-bold tracking-tight sm:text-5xl">
                Welcome back{user ? `, ${user.name.split(" ")[0]}` : ""}
              </h1>
              <p className="mt-4 text-lg leading-relaxed text-[var(--color-muted)]">
                Browse, install, and launch modded games from one place — built
                for Steam Deck and Windows.
              </p>
              <div className="mt-6 flex flex-wrap items-center gap-3">
                {user?.is_premium && (
                  <Badge variant="success">Premium member</Badge>
                )}
                {profiles.length > 0 && (
                  <span className="stat-pill">
                    <Library className="h-3.5 w-3.5" />
                    {profiles.length} game{profiles.length !== 1 ? "s" : ""} configured
                  </span>
                )}
              </div>
            </div>

            {primaryProfile && (
              <div className="w-full sm:w-auto sm:min-w-[240px]">
                <p className="mb-2 text-sm font-medium text-[var(--color-muted)]">
                  Jump back in
                </p>
                <Link
                  to="/games/$domain"
                  params={{ domain: primaryProfile.game_domain }}
                  className="focusable relative block overflow-hidden rounded-2xl border border-[var(--color-border)] transition-colors hover:border-[var(--color-primary)]/40"
                  data-focusable="true"
                >
                  <div className="relative h-24">
                    <GameArt domain={primaryProfile.game_domain} variant="tile" />
                    <div className="absolute inset-0 bg-gradient-to-r from-black/70 to-black/30" />
                  </div>
                  <div className="flex items-center gap-3 p-4">
                    <div className="min-w-0 flex-1">
                      <p className="truncate font-semibold">{primaryProfile.name}</p>
                      <p className="truncate text-sm text-[var(--color-muted)]">
                        {primaryProfile.game_domain}
                      </p>
                    </div>
                    <ArrowRight className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
                  </div>
                </Link>
              </div>
            )}
          </div>
        </div>
      </section>

      {/* Library */}
      <section>
        <div className="section-label">
          <div className="section-label-icon">
            <Library className="h-5 w-5" />
          </div>
          <div>
            <h2>My Library</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Your configured games and profiles
            </p>
          </div>
        </div>

        {profiles.length === 0 ? (
          <EmptyState
            icon={Zap}
            title="No games configured yet"
            description="Pick a supported Bethesda game to start browsing, downloading, and installing mods."
            action={
              <div className="grid w-full max-w-lg gap-2 sm:grid-cols-2">
                {supportedGames.filter((g) => g.domain).map((g) => (
                  <Link
                    key={g.domain}
                    to="/games/$domain/setup"
                    params={{ domain: g.domain }}
                  >
                    <Button variant="secondary" className="w-full">
                      <Sparkles className="h-4 w-4" />
                      {g.display_name}
                    </Button>
                  </Link>
                ))}
              </div>
            }
          />
        ) : (
          <div className="grid gap-5 sm:grid-cols-2">
            {profiles.map((p) => (
              <article
                key={p.id}
                className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)]"
              >
                <div className="relative h-36 overflow-hidden">
                  <GameArt domain={p.game_domain} variant="tile" />
                  <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
                  <div className="absolute bottom-4 left-5 right-5">
                    <h3 className="text-xl font-bold text-white drop-shadow">{p.name}</h3>
                    <p className="text-sm text-white/75">{p.game_domain}</p>
                  </div>
                </div>

                <div className="space-y-3 p-5">
                  <p className="truncate text-sm text-[var(--color-muted)]">
                    {p.game_path}
                  </p>
                  <LaunchButton
                    profileId={p.id}
                    gameDomain={p.game_domain}
                    compact
                    className="w-full"
                  />
                  <div className="grid grid-cols-2 gap-2">
                    <Link
                      to="/games/$domain"
                      params={{ domain: p.game_domain }}
                      className="focusable block"
                      data-focusable="true"
                    >
                      <Button variant="secondary" className="w-full">
                        Dashboard
                      </Button>
                    </Link>
                    <Link
                      to="/games/$domain/mods"
                      params={{ domain: p.game_domain }}
                      search={{ modId: undefined }}
                      className="focusable block"
                      data-focusable="true"
                    >
                      <Button variant="outline" className="w-full">
                        Browse mods
                      </Button>
                    </Link>
                  </div>
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Popular on Nexus */}
      <section>
        <div className="section-label">
          <div className="section-label-icon">
            <TrendingUp className="h-5 w-5" />
          </div>
          <div>
            <h2>Popular on Nexus</h2>
            <p className="text-sm text-[var(--color-muted)]">
              Discover games with active modding communities
            </p>
          </div>
        </div>

        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {games.length > 0 ? (
            games.slice(0, 8).map((g) => (
              <GameCard
                key={g.domain_name}
                game={g}
                supported={isSupportedDomain(g.domain_name)}
              />
            ))
          ) : (
            supportedGames.slice(0, 4).map((g) => (
              <GameCard
                key={g.domain}
                game={{
                  domain_name: g.domain,
                  name: g.display_name,
                  id: 0,
                }}
                supported
              />
            ))
          )}
        </div>
        <div className="mt-6 text-center">
          <Link to="/games">
            <Button variant="secondary" data-focusable="true">
              Browse all games
            </Button>
          </Link>
        </div>
      </section>
    </div>
  );
}
