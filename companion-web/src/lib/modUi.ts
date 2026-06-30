import type { ModSummary } from "../types";

export function coverUrl(mod: { picture_url?: string | null; hero_image_url?: string | null }) {
  return mod.hero_image_url || mod.picture_url || null;
}

export function stripHtml(html: string): string {
  const el = document.createElement("div");
  el.innerHTML = html;
  return el.textContent?.trim() ?? "";
}

export function formatCount(n?: number): string {
  if (n == null || n <= 0) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function formatUpdated(ts?: number): string | null {
  if (!ts) return null;
  const d = new Date(ts * 1000);
  return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
}

export function nexusModUrl(domain: string, modId: number): string {
  return `https://www.nexusmods.com/${domain}/mods/${modId}`;
}

export const DISCOVERY_SHELVES: {
  key: keyof import("../types").DiscoveryFeeds;
  title: string;
  layout: "hero" | "shelf" | "stack";
  previewCount?: number;
}[] = [
  { key: "featured", title: "Featured", layout: "hero", previewCount: 6 },
  { key: "top_endorsed", title: "Top rated", layout: "shelf", previewCount: 8 },
  { key: "most_downloaded", title: "Top downloaded", layout: "shelf", previewCount: 8 },
  { key: "trending", title: "Trending now", layout: "shelf", previewCount: 8 },
  { key: "rising_stars", title: "Rising stars", layout: "stack", previewCount: 6 },
  { key: "newly_added", title: "Newly added", layout: "stack", previewCount: 6 },
  { key: "recently_updated", title: "Recently updated", layout: "stack", previewCount: 6 },
  { key: "hot_this_week", title: "Hot this week", layout: "stack", previewCount: 6 },
  { key: "community_favorites", title: "Community favorites", layout: "stack", previewCount: 6 },
];

/** Params for GET /browse/shelf when drilling into a discovery shelf. */
export const SHELF_DRILL_DOWN: Record<
  string,
  { sort: string; updated_since_days?: number }
> = {
  featured: { sort: "endorsements" },
  top_endorsed: { sort: "endorsements" },
  most_downloaded: { sort: "downloads" },
  trending: { sort: "trending", updated_since_days: 30 },
  rising_stars: { sort: "endorsements", updated_since_days: 14 },
  newly_added: { sort: "created" },
  recently_updated: { sort: "updated" },
  hot_this_week: { sort: "downloads", updated_since_days: 7 },
  community_favorites: { sort: "downloads", updated_since_days: 30 },
};

export const OUTDATED_DEVICE_MSG =
  "Your NexusDeck app is out of date — update it on your PC or Deck, then open the companion at http://YOUR_DEVICE_IP:8731/app/ (not GitHub Pages).";

export type { ModSummary };
