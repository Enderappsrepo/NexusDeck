import { Link } from "@tanstack/react-router";
import { Download, Heart, ImageOff } from "lucide-react";
import { cn, formatNumber, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ModSummary } from "@/lib/nexus/types";

interface ModCardProps {
  mod: ModSummary;
  domain: string;
  className?: string;
}

export function ModCard({ mod, domain, className }: ModCardProps) {
  return (
    <Link
      to="/games/$domain/mods/$modId"
      params={{ domain, modId: String(mod.mod_id) }}
      className={cn(
        "focusable group flex flex-col overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] text-left shadow-[var(--shadow-sm)] transition-all hover:border-[var(--color-primary)]/50 hover:shadow-[var(--shadow-md)]",
        className
      )}
      data-focusable="true"
    >
      <div className="relative aspect-[16/10] w-full overflow-hidden bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-background)]">
        {mod.picture_url ? (
          <img
            src={mod.picture_url}
            alt={mod.name}
            className="h-full w-full object-cover transition-transform duration-300 group-hover:scale-[1.03] motion-reduce:transform-none"
            loading="lazy"
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
        <div className="absolute inset-x-0 bottom-0 h-20 bg-gradient-to-t from-black/80 via-black/40 to-transparent" />
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

      <div className="flex flex-1 flex-col gap-2 p-4">
        <h3 className="line-clamp-2 text-base font-bold leading-snug group-hover:text-[var(--color-primary)]">
          {mod.name}
        </h3>
        <p className="line-clamp-2 text-sm leading-relaxed text-[var(--color-muted)]">
          {mod.summary}
        </p>
        <div className="mt-auto flex items-center justify-between gap-2 border-t border-[var(--color-border)] pt-3 text-xs text-[var(--color-muted)]">
          <span className="truncate font-medium">v{mod.version}</span>
          <span className="truncate">{mod.author}</span>
          {mod.updated_timestamp > 0 && (
            <span className="shrink-0">{formatRelativeDate(mod.updated_timestamp)}</span>
          )}
        </div>
      </div>
    </Link>
  );
}
