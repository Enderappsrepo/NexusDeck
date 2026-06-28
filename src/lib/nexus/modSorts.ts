export const MOD_SORT_OPTIONS = [
  "endorsements",
  "downloads",
  "updated",
  "created",
  "trending",
] as const;

export type ModSort = (typeof MOD_SORT_OPTIONS)[number];

export const MOD_SORT_SEGMENTS: { value: ModSort; label: string }[] = [
  { value: "endorsements", label: "Endorsed" },
  { value: "downloads", label: "Downloaded" },
  { value: "updated", label: "Updated" },
  { value: "created", label: "New" },
  { value: "trending", label: "Trending" },
];

export const MOD_SORT_SEGMENTS_COMPACT: { value: ModSort; label: string }[] = [
  { value: "endorsements", label: "Top" },
  { value: "downloads", label: "DLs" },
  { value: "updated", label: "Updated" },
  { value: "created", label: "New" },
  { value: "trending", label: "Hot" },
];

const SORT_LABELS: Record<ModSort, string> = {
  endorsements: "endorsements",
  downloads: "downloads",
  updated: "update date",
  created: "creation date",
  trending: "recent downloads",
};

export function modSortLabel(sort: string): string {
  return SORT_LABELS[sort as ModSort] ?? sort;
}
