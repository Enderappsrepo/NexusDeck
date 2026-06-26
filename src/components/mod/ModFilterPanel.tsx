import { useState, type ReactNode } from "react";
import { ChevronDown, ChevronUp, SlidersHorizontal } from "lucide-react";
import { useModsStore } from "@/stores";
import type { ModSearchFilters } from "@/lib/nexus/types";
import { DEFAULT_FILTERS } from "@/lib/nexus/filters";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { OptionCard } from "@/components/mod/OptionCard";
import { cn } from "@/lib/utils";

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "focusable min-h-[44px] rounded-full border px-4 text-sm font-medium transition-colors",
        active
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/15 text-[var(--color-primary)]"
          : "border-[var(--color-border)] bg-[var(--color-secondary)] text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
      )}
      data-focusable="true"
    >
      {children}
    </button>
  );
}

const QUICK_PRESETS: { label: string; patch: Partial<ModSearchFilters> }[] = [
  { label: "Popular (1k+)", patch: { min_endorsements: 1000 } },
  { label: "Recent (30d)", patch: { updated_since_days: 30 } },
  { label: "Hide adult", patch: { hide_adult: true } },
];

interface ModFilterPanelProps {
  onApply: () => void;
  embedded?: boolean;
  /** Apply preset filters immediately (dialog mode). */
  applyPresetsImmediately?: boolean;
}

export function ModFilterPanel({
  onApply,
  embedded = false,
  applyPresetsImmediately = false,
}: ModFilterPanelProps) {
  const { filters, categories, categoriesLoading, setFilters } = useModsStore();
  const [expanded, setExpanded] = useState(embedded);

  const update = (patch: Partial<ModSearchFilters>) => {
    setFilters({ ...filters, ...patch });
  };

  const applyPreset = (patch: Partial<ModSearchFilters>) => {
    const next = { ...filters, ...patch };
    setFilters(next);
    if (applyPresetsImmediately) {
      onApply();
    }
  };

  const clearFilters = () => {
    setFilters({ ...DEFAULT_FILTERS });
    onApply();
  };

  const activeCount = [
    filters.category,
    filters.author,
    filters.min_endorsements,
    filters.updated_since_days,
    filters.hide_adult,
    filters.tags.length > 0,
  ].filter(Boolean).length;

  const filterFields = (
    <div className="space-y-4">
      <div className="space-y-2">
        <span className="text-sm font-medium text-[var(--color-muted)]">Quick presets</span>
        <div className="flex flex-wrap gap-2">
          {QUICK_PRESETS.map((preset) => (
            <FilterChip
              key={preset.label}
              active={false}
              onClick={() => applyPreset(preset.patch)}
            >
              {preset.label}
            </FilterChip>
          ))}
        </div>
      </div>

      <div className="flex justify-end">
        <Button variant="ghost" size="sm" onClick={clearFilters}>
          Clear all
        </Button>
      </div>

      <div className="space-y-2">
        <span className="text-sm font-medium text-[var(--color-muted)]">Category</span>
        <div className="flex flex-wrap gap-2">
          <FilterChip active={!filters.category} onClick={() => update({ category: null })}>
            All
          </FilterChip>
          {categoriesLoading && (
            <span className="self-center text-sm text-[var(--color-muted)]">Loading…</span>
          )}
          {categories.map((c) => (
            <FilterChip
              key={`${c.category_id}-${c.name}`}
              active={filters.category === c.name}
              onClick={() => update({ category: c.name })}
            >
              {c.name}
            </FilterChip>
          ))}
        </div>
      </div>

      <label className="block space-y-2">
        <span className="text-sm font-medium text-[var(--color-muted)]">Author</span>
        <input
          type="text"
          value={filters.author ?? ""}
          onChange={(e) => update({ author: e.target.value.trim() || null })}
          className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-secondary)] px-3"
          data-focusable="true"
          placeholder="Exact author name"
          autoComplete="off"
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
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
      </div>

      <OptionCard
        control="checkbox"
        checked={filters.hide_adult}
        onToggle={() => update({ hide_adult: !filters.hide_adult })}
        title="Hide adult content"
      />

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
