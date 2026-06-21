import { isSupportedDomain } from "@/lib/games";
import type { GameSummary, SupportedGameInfo } from "@/lib/nexus/types";

export function mergeGameCatalog(
  supported: SupportedGameInfo[],
  nexusGames: GameSummary[]
): GameSummary[] {
  const byDomain = new Map<string, GameSummary>();

  for (const game of nexusGames) {
    if (game.domain_name) byDomain.set(game.domain_name, game);
  }

  for (const s of supported) {
    const existing = byDomain.get(s.domain);
    if (existing) {
      byDomain.set(s.domain, {
        ...existing,
        name: existing.name || s.display_name,
      });
    } else {
      byDomain.set(s.domain, {
        id: 0,
        name: s.display_name,
        domain_name: s.domain,
      });
    }
  }

  return [...byDomain.values()].sort((a, b) => {
    const aSupported = isSupportedDomain(a.domain_name) ? 0 : 1;
    const bSupported = isSupportedDomain(b.domain_name) ? 0 : 1;
    if (aSupported !== bSupported) return aSupported - bSupported;
    return a.name.localeCompare(b.name);
  });
}

export function splitGameCatalog(games: GameSummary[]) {
  const supported = games.filter((g) => isSupportedDomain(g.domain_name));
  const other = games.filter((g) => !isSupportedDomain(g.domain_name));
  return { supported, other };
}
