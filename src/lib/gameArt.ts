import { gameGradient } from "@/lib/utils";

export interface GameArtAssets {
  /** Fallback gradient classes (Tailwind bg-gradient stops) — always present. */
  tint: string;
  /** `r, g, b` triplet for the per-game accent glow layered over the gradient. */
  accent: string;
  /** Wide key art for hero banners. Drop files in /public/games and reference here. */
  hero?: string;
  /** Landscape tile art for cards. */
  tile?: string;
}

/**
 * Per-game art metadata keyed by Nexus domain.
 *
 * The `accent` glow ships today and needs no asset — it enriches the existing
 * flat gradient with a per-game colored light source. Add `hero`/`tile` paths
 * (files under /public/games) to layer real key art on top; <GameArt> masks and
 * scrims it automatically so titles stay legible.
 */
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

export function gameArt(domain: string): GameArtAssets {
  const entry = ART[domain];
  return {
    tint: gameGradient(domain),
    accent: entry?.accent ?? DEFAULT_ACCENT,
    hero: entry?.hero,
    tile: entry?.tile,
  };
}
