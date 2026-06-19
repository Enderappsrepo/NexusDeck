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

  return { id, name, domain_name: domain_name.trim() };
}

export function normalizeGameSummaries(raw: unknown[]): GameSummary[] {
  return raw.map(normalizeGameSummary).filter((g): g is GameSummary => g !== null);
}
