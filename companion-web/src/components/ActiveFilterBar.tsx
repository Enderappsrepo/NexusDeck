import type { ModSearchFilters } from "../types";
import { DEFAULT_FILTERS, QUICK_PRESETS } from "../lib/modFilters";

function labelForFilter(key: keyof ModSearchFilters, filters: ModSearchFilters): string | null {
  switch (key) {
    case "category":
      return filters.category ? `Category: ${filters.category}` : null;
    case "author":
      return filters.author ? `Author: ${filters.author}` : null;
    case "min_endorsements":
      return filters.min_endorsements
        ? `${filters.min_endorsements.toLocaleString()}+ endorsements`
        : null;
    case "updated_since_days":
      return filters.updated_since_days
        ? `Updated ${filters.updated_since_days}d`
        : null;
    case "hide_adult":
      return filters.hide_adult ? "Hide adult" : null;
    default:
      return null;
  }
}

export function ActiveFilterBar({
  filters,
  onChange,
}: {
  filters: ModSearchFilters;
  onChange: (next: ModSearchFilters) => void;
}) {
  const chips: { key: string; label: string; remove: () => void }[] = [];

  for (const key of [
    "category",
    "author",
    "min_endorsements",
    "updated_since_days",
    "hide_adult",
  ] as const) {
    const label = labelForFilter(key, filters);
    if (label) {
      chips.push({
        key,
        label,
        remove: () => onChange({ ...filters, [key]: DEFAULT_FILTERS[key] }),
      });
    }
  }

  for (const tag of filters.tags) {
    chips.push({
      key: `tag:${tag}`,
      label: tag,
      remove: () =>
        onChange({ ...filters, tags: filters.tags.filter((t) => t !== tag) }),
    });
  }

  if (!chips.length) return null;

  return (
    <div className="cc-filter-bar px-4 pb-2">
      <div className="flex flex-wrap gap-2">
        {chips.map((chip) => (
          <button
            key={chip.key}
            type="button"
            className="cc-filter-chip"
            onClick={chip.remove}
            aria-label={`Remove filter ${chip.label}`}
          >
            <span>{chip.label}</span>
            <span aria-hidden="true">×</span>
          </button>
        ))}
      </div>
    </div>
  );
}
