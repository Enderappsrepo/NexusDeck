import { createFileRoute, Link, Outlet, useNavigate, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  BookOpen,
  CheckCircle2,
  Clock,
  FolderOpen,
  Layers,
  Search,
  Settings2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { ScriptExtenderInstallDialog } from "@/components/wizard/ScriptExtenderInstallDialog";
import { DeckAdvisorPanel } from "@/components/advisor/DeckAdvisorPanel";
import { CommunityHubPanel } from "@/components/community/CommunityHubPanel";
import { GameModDiscovery } from "@/components/game/GameModDiscovery";
import { ModSearchBar } from "@/components/mod/ModSearchBar";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { cn, gameGradient } from "@/lib/utils";
import {
  getGameMeta,
  hasScriptExtender,
  isSupportedDomain,
  loadSupportedGames,
} from "@/lib/games";
import type { ScriptExtenderStatus, SupportedGameInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/")({
  component: GameDashboard,
});

const QUICK_LINKS = [
  {
    to: "/games/$domain/mods" as const,
    label: "Browse Mods",
    description: "Search and discover mods",
    icon: Search,
    withModSearch: true,
  },
  {
    to: "/games/$domain/library" as const,
    label: "Installed",
    description: "Manage your load order",
    icon: FolderOpen,
    withModSearch: false,
  },
  {
    to: "/games/$domain/collections" as const,
    label: "Collections",
    description: "Curated mod lists",
    icon: Layers,
    withModSearch: false,
  },
  {
    to: "/games/$domain/setup" as const,
    label: "Setup",
    description: "Paths and configuration",
    icon: Settings2,
    withModSearch: false,
  },
];

function GameDashboard() {
  const { domain } = useParams({ from: "/games/$domain/" });
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { loadProfiles, getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const [modSearchQuery, setModSearchQuery] = useState("");
  const loadPlaytime = useLaunchStore((s) => s.loadPlaytime);
  const playtime = useLaunchStore((s) =>
    profile ? s.playtimeByProfile[profile.id] : undefined
  );
  const [extenderStatus, setExtenderStatus] = useState<ScriptExtenderStatus | null>(null);
  const [extenderDialogOpen, setExtenderDialogOpen] = useState(false);
  const [deckBannerDismissed, setDeckBannerDismissed] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);

  const gameMeta = getGameMeta(domain, supportedGames);
  const extenderLabel = gameMeta?.script_extender_label;
  const showExtender = hasScriptExtender(domain, supportedGames);

  useEffect(() => {
    loadSupportedGames().then(setSupportedGames);
  }, []);

  useEffect(() => {
    loadProfiles();
  }, [loadProfiles]);

  useEffect(() => {
    if (profile) loadPlaytime(profile.id);
  }, [profile, loadPlaytime]);

  useEffect(() => {
    if (!profile || !showExtender) return;
    const load = () =>
      domain === "fallout4"
        ? api.detectF4se(profile.game_path)
        : api.detectScriptExtender(domain, profile.game_path);
    load().then(setExtenderStatus);
  }, [profile, domain, showExtender]);

  if (!profile) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <div className="mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-2xl bg-[var(--color-secondary)]">
          <Settings2 className="h-10 w-10 text-[var(--color-primary)]" />
        </div>
        <h1 className="text-3xl font-bold capitalize">{domain}</h1>
        <p className="mt-4 text-[var(--color-muted)]">
          This game is not set up yet. Run the setup wizard to get started.
        </p>
        <Link to="/games/$domain/setup" params={{ domain }}>
          <Button size="lg" className="mt-8">
            Start Setup Wizard
          </Button>
        </Link>
      </div>
    );
  }

  const showDeckBanner =
    !deckBannerDismissed &&
    isSupportedDomain(domain) &&
    (!showExtender || extenderStatus?.installed);

  const handleModSearch = () => {
    const q = modSearchQuery.trim();
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: { q: q || undefined, modId: undefined },
    });
  };

  return (
    <div className="page-section mx-auto max-w-5xl">
      {/* Game hero banner */}
      <section className="game-banner">
        <div
          className={cn(
            "game-banner-art bg-gradient-to-br",
            gameGradient(domain)
          )}
        />
        <div className="game-banner-content">
          <div className="flex flex-wrap items-start justify-between gap-6">
            <div className="min-w-0 flex-1">
              <Badge variant="muted" className="mb-3">
                {domain}
              </Badge>
              <h1 className="text-3xl font-bold tracking-tight sm:text-4xl">
                {profile.name}
              </h1>
              <p className="mt-2 truncate text-sm text-[var(--color-muted)]">
                {profile.game_path}
              </p>
              {playtime?.last_played_at && (
                <div className="mt-3 flex flex-wrap gap-2">
                  <span className="stat-pill">
                    <Clock className="h-3.5 w-3.5" />
                    Last played{" "}
                    {new Date(playtime.last_played_at * 1000).toLocaleDateString()}
                  </span>
                  {playtime.total_secs > 0 && (
                    <span className="stat-pill">
                      {Math.floor(playtime.total_secs / 3600)}h via NexusDeck
                    </span>
                  )}
                </div>
              )}
            </div>
          </div>

          <div className="mt-6">
            <LaunchButton profileId={profile.id} gameDomain={domain} />
          </div>
        </div>
      </section>

      {/* Status banners */}
      {showDeckBanner && (
        <Card className="border-[var(--color-success)]/30 bg-[var(--color-success)]/8">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div className="flex items-start gap-3">
              <CheckCircle2 className="mt-0.5 h-6 w-6 shrink-0 text-[var(--color-success)]" />
              <div>
                <p className="font-semibold">Deck profile looks good</p>
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  Browse mods, install collections, and manage your load order from here.
                </p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              onClick={() => setDeckBannerDismissed(true)}
              aria-label="Dismiss"
            >
              <X className="h-5 w-5" />
            </Button>
          </CardContent>
        </Card>
      )}

      {showExtender && extenderStatus && !extenderStatus.installed && (
        <Card className="border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-5">
            <div>
              <Badge variant="warning">{extenderLabel} recommended</Badge>
              <p className="mt-2 text-sm">{extenderStatus.message}</p>
            </div>
            <Button onClick={() => setExtenderDialogOpen(true)}>
              {extenderStatus?.installed ? `Manage ${extenderLabel}` : `Install ${extenderLabel}`}
            </Button>
          </CardContent>
        </Card>
      )}

      {/* Quick links */}
      <section>
        <div className="section-label">
          <h2>Quick actions</h2>
        </div>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {QUICK_LINKS.map(({ to, label, description, icon: Icon, withModSearch }) => (
            <Link
              key={to}
              to={to}
              params={{ domain }}
              search={withModSearch ? { modId: undefined } : undefined}
              className="focusable quick-tile group"
              data-focusable="true"
            >
              <div className="quick-tile-icon transition-colors group-hover:bg-[var(--color-primary)]/20">
                <Icon className="h-6 w-6" />
              </div>
              <div>
                <span className="font-semibold">{label}</span>
                <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>
              </div>
            </Link>
          ))}
        </div>
      </section>

      {/* Mod search */}
      <section className="rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-5 sm:p-6">
        <div className="mb-4">
          <h2 className="text-xl font-bold">Search mods</h2>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            Find mods for {profile.name}. Results are scoped to this game only.
          </p>
        </div>
        <ModSearchBar
          value={modSearchQuery}
          onChange={setModSearchQuery}
          onSearch={handleModSearch}
          placeholder={`Search ${profile.name} mods...`}
        />
      </section>

      <DeckAdvisorPanel profileId={profile.id} />

      <GameModDiscovery domain={domain} signedIn={!!user} />

      <section>
        <div className="section-label">
          <div className="section-label-icon">
            <BookOpen className="h-5 w-5" />
          </div>
          <div>
            <h2>Community Hub</h2>
            <p className="text-sm text-[var(--color-muted)]">
              News, guides, and discussions
            </p>
          </div>
        </div>
        <CommunityHubPanel gameDomain={domain} />
      </section>

      <Outlet />

      {showExtender && (
        <ScriptExtenderInstallDialog
          open={extenderDialogOpen}
          onOpenChange={setExtenderDialogOpen}
          domain={domain}
          gamePath={profile.game_path}
          onInstalled={setExtenderStatus}
        />
      )}
    </div>
  );
}
