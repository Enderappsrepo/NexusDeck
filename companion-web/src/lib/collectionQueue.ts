import { fetchModFiles, type PairedDeck } from "../deckApi";
import { useInstallQueueStore } from "../stores/installQueueStore";
import type { CollectionModDiffEntry, CompanionCollectionDetail } from "../types";

function shouldQueueMod(
  mod: CollectionModDiffEntry,
  includeOptional: boolean,
  includeOutdated: boolean
): boolean {
  if (mod.status === "installed") return false;
  if (mod.optional && !includeOptional) return false;
  if (mod.status === "missing") return true;
  if (includeOutdated && (mod.status === "outdated" || mod.status === "wrong_file")) return true;
  return false;
}

export async function queueCollectionModsToCompanion(
  paired: PairedDeck,
  gameDomain: string,
  collection: CompanionCollectionDetail,
  options: { includeOptional: boolean; includeOutdated: boolean }
): Promise<{ added: number; skipped: number }> {
  const targets = collection.diff.mods.filter((m) =>
    shouldQueueMod(m, options.includeOptional, options.includeOutdated)
  );

  let added = 0;
  let skipped = 0;

  for (const mod of targets) {
    const preferredFileId = mod.collection_file_id;
    if (!preferredFileId) {
      skipped += 1;
      continue;
    }

    try {
      const files = await fetchModFiles(paired, gameDomain, mod.mod_id);
      const file =
        files.find((f) => f.file_id === preferredFileId) ??
        files.find((f) => f.is_primary) ??
        files[0];
      if (!file) {
        skipped += 1;
        continue;
      }

      const ok = useInstallQueueStore.getState().enqueue({
        gameDomain,
        modId: mod.mod_id,
        modName: mod.name,
        fileId: file.file_id,
        fileName: file.file_name || file.name,
        expectedSizeKb: file.size_kb,
        fileVersion: file.version || null,
        source: "collection",
        collectionSlug: collection.detail.slug,
        collectionName: collection.detail.name,
      });
      if (ok) added += 1;
      else skipped += 1;
    } catch {
      skipped += 1;
    }
  }

  return { added, skipped };
}
