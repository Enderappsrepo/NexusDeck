import { memo, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, ChevronRight, Download, Heart, ImageOff } from "lucide-react";
import { cn, formatNumber, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import type { ModSummary } from "@/lib/nexus/types";

interface ModListRowProps {
  mod: ModSummary;
  domain: string;
  className?: string;
  installed?: boolean;
}

/** Compact horizontal row — better for Deck / narrow viewports than tall grid cards. */
export const ModListRow = memo(function ModListRow({
  mod,
  domain,
  className,
  installed = false,
}: ModListRowProps) {
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
        "mod-list-row focusable group flex w-full items-stretch gap-3 rounded-xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)] p-2.5 text-left shadow-[var(--shadow-sm)] transition-colors hover:border-[var(--color-cyan)]/45 hover:bg-[var(--color-card)]",
        className
      )}
      data-focusable="true"
      data-nexus-mod-id={mod.mod_id}
    >
      <div className="relative h-[4.5rem] w-[4.5rem] shrink-0 overflow-hidden rounded-lg bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-background)] sm:h-20 sm:w-20">
        {mod.picture_url && !imgFailed ? (
          <img
            src={mod.picture_url}
            alt=""
            draggable={false}
            width={80}
            height={80}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setImgFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-[var(--color-muted)]">
            <ImageOff className="h-5 w-5 opacity-60" />
          </div>
        )}
        {mod.adult_content && (
          <span className="absolute left-0.5 top-0.5 rounded bg-black/70 px-1 py-0.5 text-[10px] font-semibold text-white">
            18+
          </span>
        )}
      </div>

      <div className="flex min-w-0 flex-1 flex-col justify-center gap-1 py-0.5">
        <div className="flex items-start gap-2">
          <h3 className="line-clamp-2 flex-1 text-sm font-semibold leading-snug group-hover:text-[var(--color-primary)] sm:text-base">
            {mod.name}
          </h3>
          {installed && (
            <Badge variant="success" className="shrink-0 gap-0.5 px-1.5 py-0 text-[10px]">
              <Check className="h-3 w-3" />
              Installed
            </Badge>
          )}
        </div>
        <p className="line-clamp-1 text-xs text-[var(--color-muted)] sm:text-sm">
          {mod.summary || `by ${mod.author}`}
        </p>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-0.5 text-[11px] text-[var(--color-muted)] sm:text-xs">
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
          <span className="truncate">v{mod.version}</span>
          {mod.updated_timestamp > 0 && (
            <span className="shrink-0">{formatRelativeDate(mod.updated_timestamp)}</span>
          )}
        </div>
      </div>

      <ChevronRight
        className="my-auto h-5 w-5 shrink-0 text-[var(--color-muted)] opacity-60 group-hover:text-[var(--color-primary)]"
        aria-hidden
      />
    </button>
  );
});
