import type { ModFileInfo } from "../types";

const HIDDEN = new Set(["REMOVED", "ARCHIVED"]);
const MAIN = new Set(["MAIN", "UPDATE"]);

/** Deduplicate by file_id (Nexus sometimes lists the same file more than once). */
export function dedupeModFiles(files: ModFileInfo[]): ModFileInfo[] {
  const byId = new Map<number, ModFileInfo>();
  for (const f of files) {
    const existing = byId.get(f.file_id);
    if (!existing || (f.is_primary && !existing.is_primary)) {
      byId.set(f.file_id, f);
    }
  }
  return [...byId.values()];
}

export function groupModFiles(files: ModFileInfo[]) {
  const visible = dedupeModFiles(files).filter(
    (f) => !HIDDEN.has((f.category_name ?? "").toUpperCase())
  );

  const mainFiles = visible.filter(
    (f) => f.is_primary || MAIN.has((f.category_name ?? "").toUpperCase())
  );
  const mainIds = new Set(mainFiles.map((f) => f.file_id));
  const otherFiles = visible.filter((f) => !mainIds.has(f.file_id));

  return { mainFiles, otherFiles, all: visible };
}

export function pickDefaultFile(files: ModFileInfo[]): ModFileInfo | undefined {
  const { mainFiles, all } = groupModFiles(files);
  return mainFiles.find((f) => f.is_primary) ?? mainFiles[0] ?? all[0];
}
