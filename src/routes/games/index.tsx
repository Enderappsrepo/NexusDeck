import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Input } from "@/components/ui/input";
import { GameCard } from "@/components/game/GameCard";
import { api } from "@/lib/commands";
import { normalizeGameSummaries } from "@/lib/nexus/games";
import { loadSupportedGames, isSupportedDomain } from "@/lib/games";
import type { GameSummary, SupportedGameInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/")({
  component: GamesPage,
});

function GamesPage() {
  const [query, setQuery] = useState("");
  const [games, setGames] = useState<GameSummary[]>([]);
  const [supported, setSupported] = useState<SupportedGameInfo[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSupportedGames().then(setSupported);
  }, []);

  useEffect(() => {
    setLoading(true);
    api
      .listNexusGames(query, 24)
      .then((games) => setGames(normalizeGameSummaries(games)))
      .catch(() => setGames([]))
      .finally(() => setLoading(false));
  }, [query]);

  const supportedFirst = [...games].sort((a, b) => {
    const aSupported = isSupportedDomain(a.domain_name) ? 0 : 1;
    const bSupported = isSupportedDomain(b.domain_name) ? 0 : 1;
    return aSupported - bSupported || a.name.localeCompare(b.name);
  });

  return (
    <div className="mx-auto max-w-5xl">
      <div className="mb-6">
        <h1 className="text-3xl font-bold">Games</h1>
        <p className="mt-1 text-[var(--color-muted)]">
          {supported.length} Bethesda titles with full mod install and launch support
        </p>
      </div>

      <Input
        placeholder="Search games..."
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        className="mb-6 max-w-md"
      />

      {loading && <p className="text-[var(--color-muted)]">Loading games...</p>}

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {supportedFirst.map((g) => (
          <GameCard
            key={g.domain_name}
            game={g}
            supported={isSupportedDomain(g.domain_name)}
          />
        ))}
      </div>

      {!loading && supportedFirst.length === 0 && (
        <p className="text-[var(--color-muted)]">No games matched your search.</p>
      )}
    </div>
  );
}
