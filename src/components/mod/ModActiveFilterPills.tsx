import { X } from "lucide-react";
import type { ModSearchFilters } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

interface ModActiveFilterPillsProps {
  filters: ModSearchFilters;
  query?: string;
  onClearQuery?: () => void;
  onUpdateFilters: (patch: Partial<ModSearchFilters>) => void;
  onApply: () => void;
  className?: string;
}

function Pill({
  label,
  onRemove,
}: {
  label: string;
  onRemove: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onRemove}
      className={cn(
        "focusable inline-flex min-h-[36px] max-w-full items-center gap-1.5 rounded-full border border-[var(--color-primary)]/40",
        "bg-[var(--color-primary)]/10 px-3 py-1 text-sm font-medium text-[var(--color-primary)]"
      )}
      data-focusable="true"
      aria-label={`Remove filter: ${label}`}
    >
      <span className="truncate">{label}</span>
      <X className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
    </button>
  );
}

export function ModActiveFilterPills({
  filters,
  query,
  onClearQuery,
  onUpdateFilters,
  onApply,
  className,
}: ModActiveFilterPillsProps) {
  const pills: { key: string; label: string; remove: () => void }[] = [];

  if (query?.trim()) {
    pills.push({
      key: "query",
      label: `Search: ${query.trim()}`,
      remove: () => onClearQuery?.(),
    });
  }

  if (filters.author?.trim()) {
    const author = filters.author.trim();
    pills.push({
      key: "author",
      label: `Author: ${author}`,
      remove: () => {
        onUpdateFilters({ author: null });
        onApply();
      },
    });
  }

  if (filters.category) {
    pills.push({
      key: "category",
      label: filters.category,
      remove: () => {
        onUpdateFilters({ category: null });
        onApply();
      },
    });
  }

  if (filters.min_endorsements != null && filters.min_endorsements > 0) {
    pills.push({
      key: "endorsements",
      label: `${filters.min_endorsements.toLocaleString()}+ endorsements`,
      remove: () => {
        onUpdateFilters({ min_endorsements: null });
        onApply();
      },
    });
  }

  if (filters.updated_since_days != null && filters.updated_since_days > 0) {
    pills.push({
      key: "updated",
      label: `Updated ${filters.updated_since_days}d`,
      remove: () => {
        onUpdateFilters({ updated_since_days: null });
        onApply();
      },
    });
  }

  if (filters.hide_adult) {
    pills.push({
      key: "hide-adult",
      label: "Hide adult",
      remove: () => {
        onUpdateFilters({ hide_adult: false });
        onApply();
      },
    });
  }

  for (const tag of filters.tags) {
    pills.push({
      key: `tag-${tag}`,
      label: tag,
      remove: () => {
        onUpdateFilters({ tags: filters.tags.filter((t) => t !== tag) });
        onApply();
      },
    });
  }

  if (pills.length === 0) return null;

  return (
    <div className={cn("mb-3 flex flex-wrap gap-2", className)}>
      {pills.map((pill) => (
        <Pill key={pill.key} label={pill.label} onRemove={pill.remove} />
      ))}
    </div>
  );
}
