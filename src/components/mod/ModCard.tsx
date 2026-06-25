import { memo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Download, Heart, ImageOff } from "lucide-react";
import { cn, formatNumber, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ModSummary } from "@/lib/nexus/types";

interface ModCardProps {
  mod: ModSummary;
  domain: string;
  className?: string;
  compact?: boolean;
  /** Already in the current profile's library — shows an "Installed" badge. */
  installed?: boolean;
}

export const ModCard = memo(function ModCard({ mod, domain, className, compact = false, installed = false }: ModCardProps) {
  const navigate = useNavigate();
  const [imgFailed, setImgFailed] = useState(false);

  const openMod = () => {
    navigate({
      to: "/games/$domain/mods/$modId",
      params: { domain, modId: String(mod.mod_id) },
    });
  };

  return (
    <button
      type="button"
      onClick={openMod}
      className={cn(
        "nd-card focusable group flex w-full flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] text-left shadow-[var(--shadow-sm)] transition-all hover:-translate-y-0.5 hover:border-[var(--color-primary)]/50 hover:shadow-[var(--shadow-lg)] motion-reduce:hover:translate-y-0",
        className
      )}
      data-focusable="true"
      data-nexus-mod-id={mod.mod_id}
    >
      <div
        className={cn(
          "relative w-full overflow-hidden bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-background)]",
          compact ? "aspect-[16/9]" : "aspect-[16/10]"
        )}
      >
        {mod.picture_url && !imgFailed ? (
          <img
            src={mod.picture_url}
            alt={mod.name}
            draggable={false}
            width={640}
            height={compact ? 360 : 400}
            className="nd-card-img pointer-events-none h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full flex-col items-center justify-center gap-2 text-[var(--color-muted)]">
            <ImageOff className="h-8 w-8 opacity-60" />
            <span className="text-sm">No preview</span>
          </div>
        )}
        {mod.adult_content && (
          <Badge variant="nsfw" className="absolute left-3 top-3">
            Adult
          </Badge>
        )}
        {installed && (
          <Badge variant="success" className="absolute right-3 top-3 gap-1">
            <Check className="h-3 w-3" />
            Installed
          </Badge>
        )}
        <div className="pointer-events-none absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
        <div className="absolute bottom-3 left-3 flex flex-wrap gap-1.5">
          <span className="inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
            <Heart className="h-3 w-3 text-red-400" />
            {formatNumber(mod.endorsements)}
          </span>
          {mod.mod_downloads > 0 && (
            <span className="inline-flex items-center gap-1 rounded-lg bg-black/60 px-2 py-1 text-xs font-semibold text-white backdrop-blur-sm">
              <Download className="h-3 w-3 text-sky-300" />
              {formatNumber(mod.mod_downloads)}
            </span>
          )}
        </div>
      </div>

      <div className={cn("flex flex-1 flex-col", compact ? "gap-1.5 p-3" : "gap-2 p-4")}>
        <h3
          className={cn(
            "font-bold leading-snug group-hover:text-[var(--color-primary)]",
            compact ? "line-clamp-1 text-sm" : "line-clamp-2 text-base"
          )}
        >
          {mod.name}
        </h3>
        {!compact && (
          <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-muted)]">
            {mod.summary}
          </p>
        )}
        <div
          className={cn(
            "mt-auto flex items-center justify-between gap-2 text-xs text-[var(--color-muted)]",
            compact ? "pt-1" : "border-t border-[var(--color-border)] pt-3"
          )}
        >
          <span className="truncate font-medium">v{mod.version}</span>
          {!compact && <span className="truncate">{mod.author}</span>}
          {mod.updated_timestamp > 0 && (
            <span className="shrink-0">{formatRelativeDate(mod.updated_timestamp)}</span>
          )}
        </div>
      </div>
    </button>
  );
});
