import { useState } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useModsStore } from "@/stores";
import type { ModSearchFilters } from "@/lib/nexus/types";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ModFilterPanelProps {
  onApply: () => void;
  embedded?: boolean;
}

export function ModFilterPanel({ onApply, embedded = false }: ModFilterPanelProps) {
  const { filters, categories, categoriesLoading, setFilters } = useModsStore();
  const [expanded, setExpanded] = useState(embedded);

  const update = (patch: Partial<ModSearchFilters>) => {
    setFilters({ ...filters, ...patch });
  };

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    onApply();
  };

  const activeCount = [
    filters.category,
    filters.min_endorsements,
    filters.updated_since_days,
    filters.hide_adult,
    filters.tags.length > 0,
  ].filter(Boolean).length;

  const filterFields = (
    <div className="space-y-4">
      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear all
        </Button>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">Category</span>
          <select
            value={filters.category ?? ""}
            onChange={(e) => update({ category: e.target.value || null })}
            className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
            data-focusable="true"
          >
            <option value="">All categories</option>
            {categoriesLoading && (
              <option disabled value="">
                Loading categories...
              </option>
            )}
            {!categoriesLoading && categories.length === 0 && (
              <option disabled value="">
                No categories available
              </option>
            )}
            {categories.map((c) => (
              <option key={`${c.category_id}-${c.name}`} value={c.name}>
                {c.name}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">Min endorsements</span>
          <input
            type="number"
            min={0}
            value={filters.min_endorsements ?? ""}
            onChange={(e) =>
              update({
                min_endorsements: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
            data-focusable="true"
            placeholder="Any"
          />
        </label>

        <label className="space-y-2">
          <span className="text-sm font-medium text-[var(--color-muted)]">
            Updated within (days)
          </span>
          <input
            type="number"
            min={0}
            value={filters.updated_since_days ?? ""}
            onChange={(e) =>
              update({
                updated_since_days: e.target.value ? Number(e.target.value) : null,
              })
            }
            className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
            data-focusable="true"
            placeholder="Any time"
          />
        </label>

        <label className="flex min-h-[48px] cursor-pointer items-center gap-3 rounded-xl bg-[var(--color-secondary)] px-4">
          <input
            type="checkbox"
            checked={filters.hide_adult}
            onChange={(e) => update({ hide_adult: e.target.checked })}
            className="h-5 w-5 accent-[var(--color-primary)]"
          />
          <span>Hide adult content</span>
        </label>
      </div>

      {filters.tags.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {filters.tags.map((tag) => (
            <Badge key={tag} variant="muted">
              {tag}
              <button
                type="button"
                className="ml-2 text-[var(--color-muted)] hover:text-white"
                onClick={() => update({ tags: filters.tags.filter((t) => t !== tag) })}
              >
                ×
              </button>
            </Badge>
          ))}
        </div>
      )}

      <Button variant="secondary" onClick={onApply}>
        Apply filters
      </Button>
    </div>
  );

  if (embedded) {
    return (
      <div className="border-t border-[var(--color-border)] pt-4">
        {filterFields}
      </div>
    );
  }

  return (
    <div className="mb-6 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-sm)]">
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        className="focusable flex w-full min-h-[56px] items-center justify-between gap-3 px-5 py-4 text-left"
        data-focusable="true"
      >
        <div className="flex items-center gap-3">
          <SlidersHorizontal className="h-5 w-5 text-[var(--color-primary)]" />
          <span className="text-lg font-semibold">Filters</span>
          {activeCount > 0 && <Badge variant="default">{activeCount} active</Badge>}
        </div>
        {expanded ? <ChevronUp className="h-5 w-5" /> : <ChevronDown className="h-5 w-5" />}
      </button>

      {expanded && (
        <div className={cn("border-t border-[var(--color-border)] p-5")}>
          {filterFields}
        </div>
      )}
    </div>
  );
}
