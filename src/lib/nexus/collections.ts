import type { CollectionModEntry } from "@/lib/nexus/types";

function preferModEntry(
  existing: CollectionModEntry,
  candidate: CollectionModEntry
): boolean {
  if (existing.optional && !candidate.optional) return true;
  if (!existing.optional && candidate.optional) return false;
  if (existing.file_id == null && candidate.file_id != null) return true;
  if (existing.file_id != null && candidate.file_id == null) return false;
  return false;
}

/** One mod per Nexus mod id — required beats optional, then prefer a concrete file id. */
export function dedupeCollectionMods(mods: CollectionModEntry[]): CollectionModEntry[] {
  if (mods.length <= 1) return mods;

  const firstIndex = new Map<number, number>();
  const best = new Map<number, CollectionModEntry>();

  mods.forEach((entry, i) => {
    if (!firstIndex.has(entry.mod_id)) firstIndex.set(entry.mod_id, i);
    const existing = best.get(entry.mod_id);
    if (!existing || preferModEntry(existing, entry)) {
      best.set(entry.mod_id, entry);
    }
  });

  return [...best.keys()]
    .sort((a, b) => (firstIndex.get(a) ?? 0) - (firstIndex.get(b) ?? 0))
    .map((id) => best.get(id)!);
}

/** Skip mods already downloading or queued in the active downloads map. */
export function modDownloadInFlight(
  modId: number,
  active: Record<string, { mod_id: number; status: string }>
): boolean {
  return Object.values(active).some(
    (d) =>
      d.mod_id === modId &&
      d.status !== "failed" &&
      d.status !== "cancelled" &&
      d.status !== "complete"
  );
}
