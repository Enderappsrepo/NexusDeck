import { Link } from "@tanstack/react-router";
import { Gamepad2 } from "lucide-react";
import { Card, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GameArt } from "@/components/game/GameArt";
import type { GameSummary } from "@/lib/nexus/types";

interface GameCardProps {
  game: GameSummary;
  supported?: boolean;
}

export function GameCard({ game, supported }: GameCardProps) {
  const domain = game.domain_name?.trim();

  const cardBody = (
    <>
      <div className="relative aspect-[16/10] overflow-hidden">
        <GameArt domain={domain ?? "fallout4"} variant="tile" />
        <div className="absolute bottom-3 left-4">
          <Gamepad2 className="h-6 w-6 text-white/60" />
        </div>
      </div>
      <CardHeader className="p-4">
        <CardTitle className="text-lg transition-colors group-hover:text-[var(--color-primary)]">
          {game.name}
        </CardTitle>
        <p className="text-sm text-[var(--color-muted)]">{domain}</p>
        {supported && (
          <Badge variant="success" className="mt-1 w-fit">
            Supported
          </Badge>
        )}
      </CardHeader>
    </>
  );

  if (!domain) {
    return <Card className="overflow-hidden opacity-70">{cardBody}</Card>;
  }

  return (
    <Link
      to="/games/$domain"
      params={{ domain }}
      className="focusable group block"
      data-focusable="true"
    >
      <Card interactive className="overflow-hidden">
        {cardBody}
      </Card>
    </Link>
  );
}
