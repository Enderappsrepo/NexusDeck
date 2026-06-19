import { useCallback, useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { ChevronLeft, ChevronRight, Heart, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { formatNumber } from "@/lib/utils";
import type { ModSummary } from "@/lib/nexus/types";

interface ModHeroCarouselProps {
  mods: ModSummary[];
  domain: string;
  label?: string;
}

export function ModHeroCarousel({ mods, domain, label = "Featured" }: ModHeroCarouselProps) {
  const [index, setIndex] = useState(0);
  const count = mods.length;

  const goTo = useCallback(
    (next: number) => {
      if (count === 0) return;
      setIndex((next + count) % count);
    },
    [count]
  );

  useEffect(() => {
    setIndex(0);
  }, [mods]);

  useEffect(() => {
    if (count <= 1) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduced) return;

    const timer = window.setInterval(() => goTo(index + 1), 7000);
    return () => window.clearInterval(timer);
  }, [count, index, goTo]);

  if (count === 0) return null;

  const mod = mods[index];

  return (
    <section className="relative overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] shadow-[var(--shadow-md)]">
      <div className="relative aspect-[21/9] min-h-[200px] w-full bg-[var(--color-secondary)] sm:min-h-[260px]">
        {mod.picture_url ? (
          <img
            src={mod.picture_url}
            alt=""
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center text-[var(--color-muted)]">
            <ImageOff className="h-12 w-12 opacity-50" />
          </div>
        )}
        <div className="absolute inset-0 bg-gradient-to-t from-black via-black/50 to-transparent" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/60 via-transparent to-transparent" />

        <div className="absolute inset-x-0 bottom-0 p-5 sm:p-8">
          <Badge className="mb-3" variant="default">
            {label}
          </Badge>
          {mod.adult_content && (
            <Badge className="mb-3 ml-2" variant="nsfw">
              Adult
            </Badge>
          )}
          <h2 className="max-w-3xl text-2xl font-bold leading-tight text-white sm:text-3xl">
            {mod.name}
          </h2>
          <p className="mt-2 line-clamp-2 max-w-2xl text-sm text-white/80 sm:text-base">
            {mod.summary}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-3 text-sm text-white/70">
            <span className="inline-flex items-center gap-1">
              <Heart className="h-4 w-4" />
              {formatNumber(mod.endorsements)} endorsements
            </span>
            <span>v{mod.version}</span>
            <span>{mod.author}</span>
          </div>
          <Link
            to="/games/$domain/mods/$modId"
            params={{ domain, modId: String(mod.mod_id) }}
            className="focusable mt-4 inline-block"
            data-focusable="true"
          >
            <Button size="lg">View mod</Button>
          </Link>
        </div>

        {count > 1 && (
          <>
            <Button
              variant="secondary"
              size="icon"
              className="focusable absolute left-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70"
              onClick={() => goTo(index - 1)}
              aria-label="Previous featured mod"
              data-focusable="true"
            >
              <ChevronLeft className="h-6 w-6" />
            </Button>
            <Button
              variant="secondary"
              size="icon"
              className="focusable absolute right-3 top-1/2 -translate-y-1/2 bg-black/50 hover:bg-black/70"
              onClick={() => goTo(index + 1)}
              aria-label="Next featured mod"
              data-focusable="true"
            >
              <ChevronRight className="h-6 w-6" />
            </Button>
            <div className="absolute bottom-4 right-4 flex gap-1.5 sm:bottom-auto sm:top-4">
              {mods.map((m, i) => (
                <button
                  key={m.mod_id}
                  type="button"
                  onClick={() => setIndex(i)}
                  className={`focusable h-2 rounded-full transition-all ${
                    i === index ? "w-6 bg-[var(--color-primary)]" : "w-2 bg-white/40 hover:bg-white/70"
                  }`}
                  aria-label={`Go to slide ${i + 1}`}
                  data-focusable="true"
                />
              ))}
            </div>
          </>
        )}
      </div>
    </section>
  );
}
