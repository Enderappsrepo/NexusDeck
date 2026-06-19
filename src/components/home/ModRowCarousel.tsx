import { useRef } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ModCard } from "@/components/mod/ModCard";
import type { ModSummary } from "@/lib/nexus/types";

interface ModRowCarouselProps {
  title: string;
  subtitle?: string;
  mods: ModSummary[];
  domain: string;
}

export function ModRowCarousel({ title, subtitle, mods, domain }: ModRowCarouselProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  const scroll = (direction: "left" | "right") => {
    const el = scrollerRef.current;
    if (!el) return;
    const amount = Math.max(el.clientWidth * 0.85, 280);
    el.scrollBy({ left: direction === "left" ? -amount : amount, behavior: "smooth" });
  };

  if (mods.length === 0) return null;

  return (
    <section>
      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">{title}</h2>
          {subtitle && <p className="mt-1 text-sm text-[var(--color-muted)]">{subtitle}</p>}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Link
            to="/games/$domain/mods"
            params={{ domain }}
            search={{ modId: undefined }}
            className="focusable"
            data-focusable="true"
          >
            <Button variant="outline" size="sm">
              See all
            </Button>
          </Link>
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
        className="scrollbar-thin flex snap-x snap-mandatory gap-4 overflow-x-auto pb-2"
      >
        {mods.map((mod) => (
          <div key={mod.mod_id} className="w-[min(100%,280px)] shrink-0 snap-start sm:w-[300px]">
            <ModCard mod={mod} domain={domain} className="h-full" />
          </div>
        ))}
      </div>
    </section>
  );
}
