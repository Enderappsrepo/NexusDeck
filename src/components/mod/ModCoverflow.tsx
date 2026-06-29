import {
  forwardRef,
  memo,
  useCallback,
  useEffect,
  useRef,
  useState,
} from "react";
import { useNavigate } from "@tanstack/react-router";
import { Check, Download, Heart, ImageOff, Info } from "lucide-react";
import { cn, formatNumber, formatRelativeDate } from "@/lib/utils";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { ModSummary } from "@/lib/nexus/types";

interface ModCoverflowProps {
  mods: ModSummary[];
  domain: string;
  installedIds: Set<number>;
  onNearEnd?: () => void;
  initialIndex?: number;
  onIndexChange?: (index: number) => void;
  onInstall?: (mod: ModSummary) => void;
}

// Only covers within WINDOW of the active index are mounted, so the DOM stays
// tiny (≈9 covers, 1 focusable) no matter how many mods are loaded — that's what
// keeps controller flipping smooth where the long virtual list lagged.
const WINDOW = 4;
const STEP_PX = 132; // horizontal travel per neighbour
const TILT_DEG = 22; // coverflow 3D rotation per neighbour

/** Image-forward cover browser tuned for Steam Deck: flip through mods one at a
 *  time with the stick / d-pad / swipe instead of scrolling a long list. */
export function ModCoverflow({
  mods,
  domain,
  installedIds,
  onNearEnd,
  initialIndex = 0,
  onIndexChange,
  onInstall,
}: ModCoverflowProps) {
  const navigate = useNavigate();
  const [active, setActive] = useState(() =>
    Math.min(Math.max(0, initialIndex), Math.max(0, mods.length - 1))
  );
  const rootRef = useRef<HTMLDivElement>(null);
  const centerRef = useRef<HTMLButtonElement>(null);

  // Remember the position so returning from a mod's detail page lands here.
  useEffect(() => {
    onIndexChange?.(active);
  }, [active, onIndexChange]);

  const openDetail = (index: number) => {
    onIndexChange?.(index);
    navigate({
      to: "/games/$domain/mods/$modId",
      params: { domain, modId: String(mods[index].mod_id) },
    });
  };

  // A new result set (search/sort change) resets to the first cover; also keep
  // the index in range if the list shrank.
  useEffect(() => {
    setActive((a) => (a > mods.length - 1 ? Math.max(0, mods.length - 1) : a));
  }, [mods.length]);

  const go = useCallback(
    (delta: number) => {
      setActive((a) => Math.max(0, Math.min(mods.length - 1, a + delta)));
    },
    [mods.length]
  );

  // Page in more results before the user flips off the end.
  useEffect(() => {
    if (onNearEnd && mods.length > 0 && active >= mods.length - 3) onNearEnd();
  }, [active, mods.length, onNearEnd]);

  // Keep the controller on the centre cover after each flip (but never steal
  // focus from elsewhere — e.g. when flipping by touch/mouse).
  useEffect(() => {
    const root = rootRef.current;
    if (root && root.contains(document.activeElement)) {
      centerRef.current?.focus();
    }
  }, [active]);

  // Directional input arrives via moveFocus → 'nd-nav' on this [data-nav-intercept]
  // root. Left/right flip; up/down stay unconsumed so focus can leave the widget.
  useEffect(() => {
    const root = rootRef.current;
    if (!root) return;
    const onNav = (e: Event) => {
      const dir = (e as CustomEvent<{ direction: string }>).detail?.direction;
      if (dir === "next") {
        go(1);
        e.preventDefault();
      } else if (dir === "prev") {
        go(-1);
        e.preventDefault();
      }
    };
    root.addEventListener("nd-nav", onNav as EventListener);
    return () => root.removeEventListener("nd-nav", onNav as EventListener);
  }, [go]);

  // Touch / mouse swipe to flip; suppress the click that follows a real swipe.
  const drag = useRef({ x: 0, moved: false });
  const onPointerDown = (e: React.PointerEvent) => {
    drag.current = { x: e.clientX, moved: false };
  };
  const onPointerUp = (e: React.PointerEvent) => {
    const dx = e.clientX - drag.current.x;
    if (Math.abs(dx) > 40) {
      drag.current.moved = true;
      go(dx < 0 ? 1 : -1);
    }
  };

  if (mods.length === 0) return null;

  const start = Math.max(0, active - WINDOW);
  const end = Math.min(mods.length - 1, active + WINDOW);
  const current = mods[active];
  const covers = [];
  for (let i = start; i <= end; i++) covers.push(i);

  return (
    <div data-mod-coverflow className="flex h-full min-h-0 flex-col items-center justify-center">
      <div
        ref={rootRef}
        data-nav-intercept
        className="relative w-full flex-1 min-h-[200px] select-none"
        style={{ perspective: "1400px" }}
        onPointerDown={onPointerDown}
        onPointerUp={onPointerUp}
      >
        {covers.map((i) => {
          const offset = i - active;
          return (
            <ModCover
              key={mods[i].mod_id}
              ref={offset === 0 ? centerRef : undefined}
              mod={mods[i]}
              offset={offset}
              installed={installedIds.has(mods[i].mod_id)}
              onActivate={() => {
                if (drag.current.moved) {
                  drag.current.moved = false;
                  return;
                }
                if (offset === 0) {
                  openDetail(i);
                } else {
                  setActive(i);
                }
              }}
            />
          );
        })}
      </div>

      {/* Centre mod details + position. Only the active mod renders text, so the
          window stays cheap. */}
      <div className="mt-3 w-full max-w-xl px-2 text-center">
        <div className="flex items-center justify-center gap-2">
          <h3 className="line-clamp-1 text-lg font-bold tracking-tight">{current.name}</h3>
          {installedIds.has(current.mod_id) && (
            <Badge variant="success" className="shrink-0 gap-0.5 px-1.5 py-0 text-[10px]">
              <Check className="h-3 w-3" />
              Installed
            </Badge>
          )}
        </div>
        <p className="mt-0.5 line-clamp-1 text-sm text-[var(--color-muted)]">
          {current.summary || `by ${current.author}`}
        </p>
        <div className="mt-1.5 flex items-center justify-center gap-x-4 gap-y-0.5 text-xs text-[var(--color-muted)]">
          <span className="inline-flex items-center gap-1">
            <Heart className="h-3.5 w-3.5 text-red-400" />
            {formatNumber(current.endorsements)}
          </span>
          {current.mod_downloads > 0 && (
            <span className="inline-flex items-center gap-1">
              <Download className="h-3.5 w-3.5 text-sky-300" />
              {formatNumber(current.mod_downloads)}
            </span>
          )}
          <span>v{current.version}</span>
          {current.updated_timestamp > 0 && (
            <span>{formatRelativeDate(current.updated_timestamp)}</span>
          )}
        </div>
        <p className="mt-1 text-xs font-medium text-[var(--color-muted)]/70">
          {(active + 1).toLocaleString()} of {mods.length.toLocaleString()}
        </p>

        {/* Reachable by pressing down from the centre cover. */}
        <div className="mx-auto mt-3 flex max-w-md items-center justify-center gap-2">
          {onInstall && (
            <Button
              size="lg"
              className="min-h-[52px] flex-1"
              onClick={() => onInstall(current)}
              data-focusable="true"
            >
              <Download className="h-5 w-5" />
              Install
            </Button>
          )}
          <Button
            variant="secondary"
            size="lg"
            className="min-h-[52px] flex-1"
            onClick={() => openDetail(active)}
            data-focusable="true"
          >
            <Info className="h-5 w-5" />
            Details
          </Button>
        </div>
      </div>
    </div>
  );
}

interface ModCoverProps {
  mod: ModSummary;
  offset: number;
  installed: boolean;
  onActivate: () => void;
}

const ModCover = memo(
  forwardRef<HTMLButtonElement, ModCoverProps>(function ModCover(
    { mod, offset, installed, onActivate },
    ref
  ) {
    const [failed, setFailed] = useState(false);
    const isCenter = offset === 0;
    const abs = Math.abs(offset);
    // GPU-only transform/opacity (cheap to animate even on the Deck APU).
    const scale = isCenter ? 1 : Math.max(0.6, 0.82 - (abs - 1) * 0.08);
    const transform =
      `translate(-50%, -50%) translateX(${offset * STEP_PX}px) ` +
      `rotateY(${offset === 0 ? 0 : offset < 0 ? TILT_DEG : -TILT_DEG}deg) ` +
      `scale(${scale})`;

    return (
      <button
        ref={ref}
        type="button"
        onClick={onActivate}
        tabIndex={isCenter ? 0 : -1}
        aria-hidden={!isCenter}
        data-focusable={isCenter ? "true" : undefined}
        data-nexus-mod-id={isCenter ? mod.mod_id : undefined}
        data-cover
        className={cn(
          "absolute left-1/2 top-1/2 overflow-hidden rounded-2xl border bg-[var(--color-card)] shadow-[var(--shadow-lg)] outline-none",
          isCenter
            ? "border-[var(--color-cyan)]/40"
            : "border-[var(--color-border)] brightness-[0.6]"
        )}
        style={{
          // Height-based so the cover always fits *inside* the coverflow area
          // (never spills onto the meta text below) at any viewport height.
          height: "80%",
          maxHeight: "300px",
          aspectRatio: "3 / 2",
          maxWidth: "88%",
          transform,
          zIndex: 50 - abs,
          opacity: abs > 3 ? 0 : 1,
          transition: "transform 240ms ease, opacity 240ms ease",
          pointerEvents: abs > 2 ? "none" : "auto",
        }}
      >
        {mod.picture_url && !failed ? (
          <img
            src={mod.picture_url}
            alt=""
            draggable={false}
            className="h-full w-full object-cover"
            loading="lazy"
            decoding="async"
            onError={() => setFailed(true)}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center bg-gradient-to-br from-[var(--color-secondary)] to-[var(--color-background)] text-[var(--color-muted)]">
            <ImageOff className="h-8 w-8 opacity-50" />
          </div>
        )}
        {mod.adult_content && (
          <span className="absolute left-2 top-2 rounded bg-black/70 px-1.5 py-0.5 text-[11px] font-semibold text-white">
            18+
          </span>
        )}
        {installed && isCenter && (
          <span className="absolute right-2 top-2 inline-flex items-center gap-0.5 rounded bg-[var(--color-success)]/90 px-1.5 py-0.5 text-[11px] font-semibold text-black">
            <Check className="h-3 w-3" />
          </span>
        )}
      </button>
    );
  })
);
