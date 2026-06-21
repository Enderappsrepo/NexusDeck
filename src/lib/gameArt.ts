import { gameGradient } from "@/lib/utils";

export interface GameArtAssets {
  /** Fallback gradient classes (Tailwind bg-gradient stops) — always present. */
  tint: string;
  /** `r, g, b` triplet for the per-game accent glow layered over the gradient. */
  accent: string;
  /** Wide key art for hero banners. */
  hero?: string;
  /** Landscape tile art for cards. */
  tile?: string;
}

/** Steam CDN art for NexusDeck-supported Bethesda titles (reliable offline fallback). */
const STEAM_ART: Record<string, { hero: string; tile: string }> = {
  fallout4: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/377160/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/377160/library_hero.jpg",
  },
  skyrimspecialedition: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/489830/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/489830/library_hero.jpg",
  },
  skyrim: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/72850/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/72850/library_hero.jpg",
  },
  falloutnv: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/22380/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/22380/library_hero.jpg",
  },
  fallout3: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/22300/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/22300/library_hero.jpg",
  },
  starfield: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/1716740/library_hero.jpg",
  },
  oblivion: {
    tile: "https://cdn.cloudflare.steamstatic.com/steam/apps/22330/header.jpg",
    hero: "https://cdn.cloudflare.steamstatic.com/steam/apps/22330/library_hero.jpg",
  },
};

const ART: Record<string, Omit<GameArtAssets, "tint">> = {
  skyrimspecialedition: { accent: "124, 140, 255" },
  skyrim: { accent: "124, 140, 255" },
  fallout4: { accent: "255, 138, 82" },
  falloutnv: { accent: "234, 179, 8" },
  fallout3: { accent: "132, 204, 22" },
  starfield: { accent: "139, 92, 246" },
  oblivion: { accent: "16, 185, 129" },
};

const DEFAULT_ACCENT = "124, 140, 255";

export interface GameArtOverrides {
  tileUrl?: string | null;
  heroUrl?: string | null;
}

export function gameArt(domain: string, overrides?: GameArtOverrides): GameArtAssets {
  const entry = ART[domain];
  const steam = STEAM_ART[domain];
  return {
    tint: gameGradient(domain),
    accent: entry?.accent ?? DEFAULT_ACCENT,
    hero: overrides?.heroUrl ?? entry?.hero ?? steam?.hero,
    tile: overrides?.tileUrl ?? entry?.tile ?? steam?.tile,
  };
}

export function resolveGameArtUrls(
  domain: string,
  tileUrl?: string | null,
  heroUrl?: string | null
): { tile?: string; hero?: string } {
  const art = gameArt(domain, { tileUrl, heroUrl });
  return { tile: art.tile, hero: art.hero };
}
