import type { ModSearchFilters } from "../types";

export const DEFAULT_FILTERS: ModSearchFilters = {
  category: null,
  tags: [],
  min_endorsements: null,
  hide_adult: false,
  updated_since_days: null,
  author: null,
};

export type ModBrowseSort = "downloads" | "endorsements" | "created";

export const MOD_SORT_OPTIONS: { value: ModBrowseSort; label: string }[] = [
  { value: "downloads", label: "Downloads" },
  { value: "endorsements", label: "Endorsements" },
  { value: "created", label: "Newest" },
];

export const QUICK_PRESETS: { label: string; patch: Partial<ModSearchFilters> }[] = [
  { label: "Popular (1k+)", patch: { min_endorsements: 1000 } },
  { label: "Recent (30d)", patch: { updated_since_days: 30 } },
  { label: "Hot this week", patch: { updated_since_days: 7 } },
  { label: "Hide adult", patch: { hide_adult: true } },
];

export function hasActiveFilters(filters?: ModSearchFilters | null): boolean {
  if (!filters) return false;
  return (
    !!filters.category ||
    (filters.tags?.length ?? 0) > 0 ||
    !!filters.author ||
    !!filters.min_endorsements ||
    !!filters.updated_since_days ||
    filters.hide_adult
  );
}

export function activeFilterCount(filters?: ModSearchFilters | null): number {
  if (!filters) return 0;
  return [
    filters.category,
    filters.author,
    filters.min_endorsements,
    filters.updated_since_days,
    filters.hide_adult,
    (filters.tags?.length ?? 0) > 0,
  ].filter(Boolean).length;
}

export function appendTagFilter(filters: ModSearchFilters | null | undefined, tag: string): ModSearchFilters {
  const base = filters ?? DEFAULT_FILTERS;
  const trimmed = tag.trim();
  if (!trimmed) return base;
  if (base.tags.some((t) => t.toLowerCase() === trimmed.toLowerCase())) return base;
  return { ...base, tags: [...base.tags, trimmed] };
}

function browseFiltersKey(domain: string) {
  return `nexusdeck_browse_filters_${domain}`;
}

export function loadStoredBrowseFilters(domain: string): ModSearchFilters {
  try {
    const raw = sessionStorage.getItem(browseFiltersKey(domain));
    if (!raw) return DEFAULT_FILTERS;
    const parsed = JSON.parse(raw) as Partial<ModSearchFilters>;
    return { ...DEFAULT_FILTERS, ...parsed, tags: parsed.tags ?? [] };
  } catch {
    return DEFAULT_FILTERS;
  }
}

export function storeBrowseFilters(domain: string, filters: ModSearchFilters) {
  sessionStorage.setItem(browseFiltersKey(domain), JSON.stringify(filters));
}

function browseSortKey(domain: string) {
  return `nexusdeck_browse_sort_${domain}`;
}

export function loadStoredBrowseSort(domain: string): ModBrowseSort {
  try {
    const raw = sessionStorage.getItem(browseSortKey(domain));
    if (raw === "downloads" || raw === "endorsements" || raw === "created") return raw;
  } catch {
    /* ignore */
  }
  return "downloads";
}

export function storeBrowseSort(domain: string, sort: ModBrowseSort) {
  sessionStorage.setItem(browseSortKey(domain), sort);
}

export function filtersToSearchParams(
  filters: ModSearchFilters,
  params: URLSearchParams
): void {
  if (filters.category) params.set("category", filters.category);
  if (filters.tags.length) params.set("tags", filters.tags.join(","));
  if (filters.min_endorsements != null) {
    params.set("min_endorsements", String(filters.min_endorsements));
  }
  if (filters.hide_adult) params.set("hide_adult", "true");
  if (filters.updated_since_days != null) {
    params.set("updated_since_days", String(filters.updated_since_days));
  }
  if (filters.author?.trim()) params.set("author", filters.author.trim());
}
