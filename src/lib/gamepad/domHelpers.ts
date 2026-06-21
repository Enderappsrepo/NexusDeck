/** Nearest ancestor carrying a data attribute (e.g. mod row / browse card). */
export function closestDataset(
  el: Element | null | undefined,
  key: string
): string | undefined {
  if (!el) return undefined;
  const node = el.closest<HTMLElement>(`[data-${key}]`);
  return node?.dataset[key];
}

export function focusedLibraryModId(): string | undefined {
  return closestDataset(document.activeElement, "modId");
}

export function focusedBrowseModId(): number | undefined {
  const raw = closestDataset(document.activeElement, "nexusModId");
  if (!raw) return undefined;
  const id = Number(raw);
  return Number.isNaN(id) ? undefined : id;
}

export function focusedDownloadId(): string | undefined {
  return closestDataset(document.activeElement, "downloadId");
}

export function focusedCollectionSlug(): string | undefined {
  return closestDataset(document.activeElement, "collectionSlug");
}

export function isDownloadRowComplete(): boolean {
  const el = document.activeElement?.closest<HTMLElement>("[data-download-status]");
  return el?.dataset.downloadStatus === "complete";
}
