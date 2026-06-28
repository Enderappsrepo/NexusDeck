import type { ModCategory } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

interface ModCategoryChipsProps {
  categories: ModCategory[];
  selected: string | null;
  onSelect: (category: string | null) => void;
  loading?: boolean;
  className?: string;
}

export function ModCategoryChips({
  categories,
  selected,
  onSelect,
  loading = false,
  className,
}: ModCategoryChipsProps) {
  if (loading && categories.length === 0) {
    return (
      <div className={cn("text-sm text-[var(--color-muted)]", className)}>Loading categories…</div>
    );
  }

  if (categories.length === 0) return null;

  return (
    <div
      className={cn(
        "flex gap-2 overflow-x-auto pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden",
        className
      )}
    >
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={cn(
          "game-nav-chip focusable shrink-0",
          !selected &&
            "border-transparent bg-[image:var(--gradient-primary)] font-semibold text-[#2a1206]"
        )}
        data-focusable="true"
      >
        All
      </button>
      {categories.map((c) => (
        <button
          key={c.category_id}
          type="button"
          onClick={() => onSelect(c.name)}
          className={cn(
            "game-nav-chip focusable shrink-0",
            selected === c.name &&
              "border-transparent bg-[image:var(--gradient-primary)] font-semibold text-[#2a1206]"
          )}
          data-focusable="true"
        >
          {c.name}
        </button>
      ))}
    </div>
  );
}
