import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModCard } from "@/components/mod/ModCard";
import { cn } from "@/lib/utils";
import type { ModSearchFilters, ModSummary } from "@/lib/nexus/types";
import type { ModSort } from "@/lib/nexus/modSorts";
import { useModsStore } from "@/stores";

interface ModRowCarouselProps {
  title: string;
  subtitle?: string;
  mods: ModSummary[];
  domain: string;
  compact?: boolean;
  sort?: ModSort;
  category?: string | null;
  filterPatch?: Partial<ModSearchFilters>;
}

export function ModRowCarousel({
  title,
  subtitle,
  mods,
  domain,
  compact = false,
  sort,
  category,
  filterPatch,
}: ModRowCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);
  const setSort = useModsStore((s) => s.setSort);

  const scroll = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.85, 280);
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (mods.length === 0) return null;

  const seeAllSearch = {
    modId: undefined,
    category: category ?? undefined,
    updatedDays: filterPatch?.updated_since_days ?? undefined,
    minEndorsements: filterPatch?.min_endorsements ?? undefined,
    hideAdult: filterPatch?.hide_adult || undefined,
  };

  return (
    <section>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className={compact ? "text-lg font-bold" : "text-2xl font-bold"}>{title}</h2>
          {subtitle && !compact && (
            <p className="mt-0.5 text-sm text-[var(--color-muted)]">{subtitle}</p>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Button asChild variant="outline" size="sm">
            <Link
              to="/games/$domain/mods"
              params={{ domain }}
              search={seeAllSearch}
              className="focusable"
              data-focusable="true"
              onClick={() => {
                if (sort) setSort(sort);
              }}
            >
              See all
            </Link>
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="focusable"
            onClick={() => scroll("left")}
            aria-label={`Scroll ${title} left`}
            data-focusable="true"
          >
            <ChevronLeft className="h-5 w-5" />
          </Button>
          <Button
            variant="secondary"
            size="icon"
            className="focusable"
            onClick={() => scroll("right")}
            aria-label={`Scroll ${title} right`}
            data-focusable="true"
          >
            <ChevronRight className="h-5 w-5" />
          </Button>
        </div>
      </div>

      <div
        ref={scrollerRef}
        className="scrollbar-thin flex snap-x snap-mandatory gap-3 overflow-x-auto pb-1"
        data-scroll-carousel
      >
        {mods.map((mod) => (
          <div
            key={mod.mod_id}
            className={cn(
              "shrink-0 snap-start",
              compact ? "w-[220px] sm:w-[240px]" : "w-[min(100%,280px)] sm:w-[300px]"
            )}
            data-nexus-mod-id={mod.mod_id}
            data-focusable="true"
            tabIndex={-1}
          >
            <ModCard mod={mod} domain={domain} className="h-full" compact={compact} />
          </div>
        ))}
      </div>
    </section>
  );
}
