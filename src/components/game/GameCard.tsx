import { Link } from "@tanstack/react-router";
import { Layers, Sparkles } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GameArt } from "@/components/game/GameArt";
import { cn, formatNumber } from "@/lib/utils";
import type { GameSummary } from "@/lib/nexus/types";

interface GameCardProps {
  game: GameSummary;
  supported?: boolean;
  variant?: "default" | "featured";
  className?: string;
}

export function GameCard({
  game,
  supported,
  variant = "default",
  className,
}: GameCardProps) {
  const domain = game.domain_name?.trim();
  const featured = variant === "featured";
  const artOverrides = {
    tileUrl: game.tile_url,
    heroUrl: game.hero_url,
  };

  const cardBody = (
    <>
      <div
        className={cn(
          "relative overflow-hidden",
          featured ? "aspect-[21/9] min-h-[140px]" : "aspect-[16/10]"
        )}
      >
        <GameArt domain={domain ?? "fallout4"} variant="tile" overrides={artOverrides} />
        <div className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/20 to-transparent" />
        <div className="absolute left-3 top-3 flex flex-wrap gap-1.5">
          {supported && (
            <Badge variant="success" className="gap-1 shadow-md">
              <Sparkles className="h-3 w-3" />
              Full support
            </Badge>
          )}
          {game.genre && (
            <Badge variant="muted" className="bg-black/40 text-white/90 backdrop-blur-sm">
              {game.genre}
            </Badge>
          )}
        </div>
        <div className="absolute bottom-0 left-0 right-0 p-4">
          <CardTitle
            className={cn(
              "line-clamp-2 text-white drop-shadow-md transition-colors group-hover:text-[var(--color-primary)]",
              featured ? "text-xl sm:text-2xl" : "text-lg"
            )}
          >
            {game.name}
          </CardTitle>
          {game.mod_count != null && game.mod_count > 0 && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-white/75">
              <Layers className="h-3.5 w-3.5" />
              {formatNumber(game.mod_count)} mods
            </p>
          )}
        </div>
      </div>
      {!featured && (
        <CardHeader className="p-4 pt-3">
          <p className="truncate text-sm text-[var(--color-muted)]">{domain}</p>
        </CardHeader>
      )}
    </>
  );

  if (!domain) {
    return (
      <Card className={cn("overflow-hidden opacity-70", className)}>{cardBody}</Card>
    );
  }

  return (
    <Link
      to="/games/$domain"
      params={{ domain }}
      className={cn("focusable group block", className)}
      data-focusable="true"
      data-game-domain={domain}
    >
      <Card interactive className="overflow-hidden border-[var(--color-border)]">
        {cardBody}
      </Card>
    </Link>
  );
}
