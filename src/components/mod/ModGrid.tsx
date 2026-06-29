import { memo, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronLeft, ChevronRight, Download, Heart, ImageOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn, formatNumber } from "@/lib/utils";
import type { ModSummary } from "@/lib/nexus/types";

interface ModGridProps {
  mods: ModSummary[];
  domain: string;
  installedIds: Set<number>;
  onNearEnd?: () => void;
}

// Paged (not infinite) so the DOM stays bounded — ~12 cards on screen keeps
// controller focus nav fast, unlike the old unbounded scrolling list.
const PAGE_SIZE = 12;

/** Grid alternative to the coverflow: scan a page of covers at once. */
export function ModGrid({ mods, domain, installedIds, onNearEnd }: ModGridProps) {
  const navigate = useNavigate();
  const [page, setPage] = useState(0);

  // Reset to the first page when a new result set arrives (different first mod).
  const firstId = mods[0]?.mod_id;
  const prevFirst = useRef(firstId);
  useEffect(() => {
    if (prevFirst.current !== firstId) {
      prevFirst.current = firstId;
      setPage(0);
    }
  }, [firstId]);

  const pageCount = Math.max(1, Math.ceil(mods.length / PAGE_SIZE));
  const clamped = Math.min(page, pageCount - 1);
  const start = clamped * PAGE_SIZE;
  const pageMods = mods.slice(start, start + PAGE_SIZE);

  // Fetch more results before the user reaches the last loaded page.
  useEffect(() => {
    if (onNearEnd && mods.length > 0 && clamped >= pageCount - 2) onNearEnd();
  }, [clamped, pageCount, mods.length, onNearEnd]);

  const goPage = (delta: number) => {
    setPage(Math.max(0, Math.min(pageCount - 1, clamped + delta)));
    document.querySelector<HTMLElement>("[data-scroll-pane]")?.scrollTo({ top: 0 });
  };

  if (mods.length === 0) return null;

  return (
    <div data-mod-grid-view className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {pageMods.map((mod) => (
          <ModGridCard
            key={mod.mod_id}
            mod={mod}
            installed={installedIds.has(mod.mod_id)}
            onOpen={() =>
              navigate({
                to: "/games/$domain/mods/$modId",
                params: { domain, modId: String(mod.mod_id) },
              })
            }
          />
        ))}
      </div>

      {pageCount > 1 && (
        <div className="flex items-center justify-center gap-3 pb-2">
          <Button
            variant="secondary"
            onClick={() => goPage(-1)}
            disabled={clamped === 0}
            data-focusable="true"
          >
            <ChevronLeft className="h-4 w-4" />
            Prev
          </Button>
          <span className="min-w-[6rem] text-center text-sm tabular-nums text-[var(--color-muted)]">
            Page {clamped + 1} of {pageCount}
          </span>
          <Button
            variant="secondary"
            onClick={() => goPage(1)}
            disabled={clamped >= pageCount - 1}
            data-focusable="true"
          >
            Next
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
}

const ModGridCard = memo(function ModGridCard({
  mod,
  installed,
  onOpen,
}: {
  mod: ModSummary;
  installed: boolean;
  onOpen: () => void;
}) {
  const [failed, setFailed] = useState(false);
  return (
    <button
      type="button"
      onClick={onOpen}
      className={cn(
        "focusable group flex flex-col overflow-hidden rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-cyan)]/45"
      )}
      data-focusable="true"
      data-nexus-mod-id={mod.mod_id}
    >
      <div className="relative aspect-video w-full overflow-hidden bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-background)]">
        {mod.picture_url && !failed ? (
          <img
            src={mod.picture_url}
            alt=""
            draggable={false}
            loading="lazy"
            decoding="async"
            className="h-full w-full object-cover"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
            <ImageOff className="h-6 w-6 opacity-50" />
          </div>
        )}
        {mod.adult_content && (
          <span className="absolute left-1.5 top-1.5 rounded bg-black/70 px-1.5 py-0.5 text-[10px] font-semibold text-white">
            18+
          </span>
        )}
        {installed && (
          <span className="absolute right-1.5 top-1.5 inline-flex items-center gap-0.5 rounded bg-[var(--color-success)]/90 px-1.5 py-0.5 text-[10px] font-semibold text-black">
            <Check className="h-3 w-3" />
          </span>
        )}
      </div>
      <div className="flex flex-1 flex-col gap-1 p-2">
        <h3 className="line-clamp-2 text-sm font-semibold leading-snug group-hover:text-[var(--color-primary)]">
          {mod.name}
        </h3>
        <div className="mt-auto flex items-center gap-3 text-[11px] text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3 w-3 text-red-400" />
            {formatNumber(mod.endorsements)}
          </span>
          {mod.mod_downloads > 0 && (
            <span className="inline-flex items-center gap-1">
              <Download className="h-3 w-3 text-sky-300" />
              {formatNumber(mod.mod_downloads)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
});
