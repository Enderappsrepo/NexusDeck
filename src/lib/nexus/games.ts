import type { GameSummary } from "@/lib/nexus/types";

/** Normalize Nexus game payloads (GraphQL uses camelCase). */
export function normalizeGameSummary(raw: unknown): GameSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const row = raw as Record<string, unknown>;

  const id =
    typeof row.id === "number"
      ? row.id
      : typeof row.id === "string"
        ? Number.parseInt(row.id, 10)
        : NaN;
  if (!Number.isFinite(id)) return null;

  const name = typeof row.name === "string" ? row.name.trim() : "";
  if (!name) return null;

  const domain_name =
    typeof row.domain_name === "string"
      ? row.domain_name
      : typeof row.domainName === "string"
        ? row.domainName
        : typeof row.domain === "string"
          ? row.domain
          : "";
  if (!domain_name.trim()) return null;

  const mod_count =
    typeof row.mod_count === "number"
      ? row.mod_count
      : typeof row.modCount === "number"
        ? row.modCount
        : undefined;

  const genre =
    typeof row.genre === "string" && row.genre.trim()
      ? row.genre.trim()
      : undefined;

  const tile_url =
    typeof row.tile_url === "string"
      ? row.tile_url
      : typeof row.tileUrl === "string"
        ? row.tileUrl
        : undefined;

  const hero_url =
    typeof row.hero_url === "string"
      ? row.hero_url
      : typeof row.heroUrl === "string"
        ? row.heroUrl
        : undefined;

  return {
    id,
    name,
    domain_name: domain_name.trim(),
    mod_count,
    genre,
    tile_url,
    hero_url,
  };
}

export function normalizeGameSummaries(raw: unknown[]): GameSummary[] {
  return raw.map(normalizeGameSummary).filter((g): g is GameSummary => g !== null);
}
