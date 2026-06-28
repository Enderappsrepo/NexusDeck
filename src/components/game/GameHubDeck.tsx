import { Link } from "@tanstack/react-router";
import {
  FolderOpen,
  Layers,
  ListOrdered,
  Search,
  Settings2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { GameModDiscovery } from "@/components/game/GameModDiscovery";
import { GameStatStrip } from "@/components/game/GameStatStrip";
import { GameArt } from "@/components/game/GameArt";
import { LoadOrderBanner } from "@/components/game/LoadOrderBanner";
import { LoadOrderHealthBadge } from "@/components/game/LoadOrderHealthBadge";
import { ModSearchBar } from "@/components/mod/ModSearchBar";
import { ModUpdatesPanel } from "@/components/mod/ModUpdatesPanel";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { EssentialFixesPanel } from "@/components/setup/EssentialFixesPanel";
import { BodySlideSetupPanel } from "@/components/game/BodySlideSetupPanel";
import { DeckAdvisorPanel } from "@/components/advisor/DeckAdvisorPanel";
import { Badge } from "@/components/ui/badge";
import type { PlaytimeStats, Profile, SupportedGameInfo } from "@/lib/nexus/types";

const QUICK_NAV: {
  to: string;
  label: string;
  icon: LucideIcon;
  withModSearch?: boolean;
}[] = [
  { to: "/games/$domain/mods", label: "Browse", icon: Search, withModSearch: true },
  { to: "/games/$domain/library", label: "Library", icon: FolderOpen },
  { to: "/games/$domain/load-order", label: "Load Order", icon: ListOrdered },
  { to: "/games/$domain/troubleshoot", label: "Fix", icon: Wrench },
  { to: "/games/$domain/collections", label: "Collections", icon: Layers },
  { to: "/games/$domain/setup", label: "Setup", icon: Settings2 },
];

interface GameHubDeckProps {
  domain: string;
  profile: Profile;
  gameMeta?: SupportedGameInfo;
  playtime?: PlaytimeStats;
  userSignedIn: boolean;
  modSearchQuery: string;
  onModSearchQueryChange: (q: string) => void;
  onModSearch: () => void;
}

export function GameHubDeck({
  domain,
  profile,
  gameMeta,
  playtime,
  userSignedIn,
  modSearchQuery,
  onModSearchQueryChange,
  onModSearch,
}: GameHubDeckProps) {
  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5 page-section">
      <section className="game-banner min-h-[200px]">
        <GameArt domain={domain} variant="hero" />
        <div className="game-banner-content">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <Badge variant="muted" className="mb-2">
                {gameMeta?.display_name ?? domain}
              </Badge>
              <h1 className="page-header-title text-2xl font-bold tracking-tight">
                {profile.name}
              </h1>
            </div>
            <LoadOrderHealthBadge profileId={profile.id} domain={domain} />
          </div>
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <LaunchButton profileId={profile.id} gameDomain={domain} compact />
          </div>
          <div className="mt-4">
            <GameStatStrip profileId={profile.id} gameDomain={domain} playtime={playtime} />
          </div>
          <div className="mt-4 max-w-xl">
            <ModSearchBar
              value={modSearchQuery}
              onChange={onModSearchQueryChange}
              onSearch={onModSearch}
              placeholder="Search mods…"
            />
          </div>
        </div>
      </section>

      <EssentialFixesPanel profileId={profile.id} domain={domain} />

      <GameModDiscovery domain={domain} signedIn={userSignedIn} sections="rows" compact />

      <nav
        aria-label="Quick navigation"
        className="grid grid-cols-2 gap-2.5 sm:grid-cols-3"
      >
        {QUICK_NAV.map(({ to, label, icon: Icon, withModSearch }) => (
          <Link
            key={to}
            to={to}
            params={{ domain }}
            search={withModSearch ? { modId: undefined } : undefined}
            className="quick-tile focusable items-center gap-2.5 text-center"
            data-focusable="true"
          >
            <div className="quick-tile-icon">
              <Icon className="h-6 w-6" />
            </div>
            <span className="text-sm font-semibold">{label}</span>
          </Link>
        ))}
      </nav>

      <LoadOrderBanner profileId={profile.id} gameDomain={domain} />
      <ModUpdatesPanel profileId={profile.id} gameDomain={domain} compact />
      <DeckAdvisorPanel profileId={profile.id} />
      <BodySlideSetupPanel profileId={profile.id} gameDomain={domain} />
    </div>
  );
}
