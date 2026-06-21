import { cn } from "@/lib/utils";
import { gameArt, type GameArtOverrides } from "@/lib/gameArt";

interface GameArtProps {
  domain: string;
  variant?: "hero" | "tile";
  className?: string;
  overrides?: GameArtOverrides;
}

const HERO_MASK = "linear-gradient(90deg, transparent 0%, black 45%)";

/**
 * Layered art backdrop for a game surface. Renders, back to front:
 *   1. the per-game gradient (always present — graceful fallback),
 *   2. a per-game accent glow for depth (no asset required),
 *   3. real key art when registered for the domain (masked for legibility),
 *   4. a readability scrim so overlaid titles/stats stay crisp.
 */
export function GameArt({ domain, variant = "hero", className, overrides }: GameArtProps) {
  const art = gameArt(domain, overrides);
  const src = variant === "hero" ? art.hero : art.tile;

  return (
    <div
      className={cn("pointer-events-none absolute inset-0 overflow-hidden", className)}
      aria-hidden
    >
      <div className={cn("absolute inset-0 bg-gradient-to-br", art.tint)} />

      <div
        className="absolute inset-0"
        style={{
          background: `radial-gradient(ellipse 70% 85% at ${
            variant === "hero" ? "100% 0%" : "80% 0%"
          }, rgba(${art.accent}, 0.28) 0%, transparent 60%)`,
        }}
      />

      {src && (
        <img
          src={src}
          alt=""
          draggable={false}
          loading="lazy"
          className={cn(
            "absolute inset-0 h-full w-full object-cover object-center",
            variant === "hero" ? "opacity-90" : "opacity-95"
          )}
          style={
            variant === "hero"
              ? { maskImage: HERO_MASK, WebkitMaskImage: HERO_MASK }
              : undefined
          }
        />
      )}

      <div
        className={cn(
          "absolute inset-0",
          variant === "hero"
            ? "bg-gradient-to-r from-[var(--color-card)] via-[var(--color-card)]/50 to-transparent"
            : "bg-gradient-to-t from-[var(--color-card)] via-[var(--color-card)]/20 to-transparent"
        )}
      />
    </div>
  );
}
