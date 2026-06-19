import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Clock,
  FolderOpen,
  Layers,
  Search,
  Settings2,
  SlidersHorizontal,
  Sparkles,
  Users,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScriptExtenderInstallDialog } from "@/components/wizard/ScriptExtenderInstallDialog";
import { DeckAdvisorPanel } from "@/components/advisor/DeckAdvisorPanel";
import { CommunityHubPanel } from "@/components/community/CommunityHubPanel";
import { GameModDiscovery } from "@/components/game/GameModDiscovery";
import { GameSettingsPanel } from "@/components/game/GameSettingsPanel";
import { ModSearchBar } from "@/components/mod/ModSearchBar";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { cn, gameGradient } from "@/lib/utils";
import {
  getGameMeta,
  hasScriptExtender,
  loadSupportedGames,
} from "@/lib/games";
import { resolveGameDomain, usePathname, isValidGameDomain } from "@/lib/routeParams";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import type { ScriptExtenderStatus, SupportedGameInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/")({
  component: GameDashboard,
});

const DASHBOARD_TABS = ["play", "discover", "tune", "community"] as const;
type DashboardTab = (typeof DASHBOARD_TABS)[number];

const NAV_LINKS = [
  { to: "/games/$domain/mods" as const, label: "Browse", icon: Search, withModSearch: true },
  { to: "/games/$domain/library" as const, label: "Library", icon: FolderOpen, withModSearch: false },
  { to: "/games/$domain/collections" as const, label: "Collections", icon: Layers, withModSearch: false },
  { to: "/games/$domain/setup" as const, label: "Setup", icon: Settings2, withModSearch: false },
];

function GameDashboard() {
  const pathname = usePathname();
  const domain = resolveGameDomain(Route.useParams().domain, pathname);
  const navigate = useNavigate();
  const user = useAuthStore((s) => s.user);
  const { loadProfiles, getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const [modSearchQuery, setModSearchQuery] = useState("");
  const [activeTab, setActiveTab] = useState<DashboardTab>("play");
  const loadPlaytime = useLaunchStore((s) => s.loadPlaytime);
  const playtime = useLaunchStore((s) =>
    profile ? s.playtimeByProfile[profile.id] : undefined
  );
  const [extenderStatus, setExtenderStatus] = useState<ScriptExtenderStatus | null>(null);
  const [extenderDialogOpen, setExtenderDialogOpen] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);

  const gameMeta = getGameMeta(domain, supportedGames);
  const extenderLabel = gameMeta?.script_extender_label;
  const showExtender = hasScriptExtender(domain, supportedGames);

  useGamepadTabs([...DASHBOARD_TABS], activeTab, (tab) => setActiveTab(tab as DashboardTab));

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

  if (!isValidGameDomain(domain)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">Game not recognized</h1>
        <p className="mt-4 text-[var(--color-muted)]">
          This game could not be loaded. Pick a title from the games list.
        </p>
        <Link to="/games" className="mt-8 inline-block">
          <Button size="lg">Browse games</Button>
        </Link>
      </div>
    );
  }

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

  const handleModSearch = () => {
    const q = modSearchQuery.trim();
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: { q: q || undefined, modId: undefined },
    });
  };

  return (
    <div className="mx-auto flex max-w-5xl flex-col gap-5">
      <section className="game-banner">
        <div className={cn("game-banner-art bg-gradient-to-br", gameGradient(domain))} />
        <div className="game-banner-content">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Badge variant="muted" className="mb-2">
                {domain}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">{profile.name}</h1>
              <p className="mt-1 truncate text-sm text-[var(--color-muted)]" title={profile.game_path}>
                {profile.game_path}
              </p>
              {playtime?.last_played_at && (
                <div className="mt-2 flex flex-wrap gap-2">
                  <span className="stat-pill">
                    <Clock className="h-3.5 w-3.5" />
                    Last played {new Date(playtime.last_played_at * 1000).toLocaleDateString()}
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

          <div className="mt-5">
            <LaunchButton profileId={profile.id} gameDomain={domain} />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            {NAV_LINKS.map(({ to, label, icon: Icon, withModSearch }) => (
              <Link
                key={to}
                to={to}
                params={{ domain }}
                search={withModSearch ? { modId: undefined } : undefined}
                className="focusable game-nav-chip"
                data-focusable="true"
              >
                <Icon className="h-4 w-4 shrink-0" />
                {label}
              </Link>
            ))}
          </div>

          <div className="mt-4 max-w-xl">
            <ModSearchBar
              value={modSearchQuery}
              onChange={setModSearchQuery}
              onSearch={handleModSearch}
              placeholder={`Search mods…`}
            />
          </div>
        </div>
      </section>

      {showExtender && extenderStatus && !extenderStatus.installed && (
        <Card className="border-[var(--color-warning)]/40 bg-[var(--color-warning)]/8">
          <CardContent className="flex flex-wrap items-center justify-between gap-4 p-4">
            <div>
              <Badge variant="warning">{extenderLabel} recommended</Badge>
              <p className="mt-1.5 text-sm">{extenderStatus.message}</p>
            </div>
            <Button onClick={() => setExtenderDialogOpen(true)}>
              Install {extenderLabel}
            </Button>
          </CardContent>
        </Card>
      )}

      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as DashboardTab)}>
        <TabsList className="w-full justify-start">
          <TabsTrigger value="play">Play</TabsTrigger>
          <TabsTrigger value="discover">Discover</TabsTrigger>
          <TabsTrigger value="tune">Tune</TabsTrigger>
          <TabsTrigger value="community">Community</TabsTrigger>
        </TabsList>

        <TabsContent value="play" className="space-y-5">
          <DeckAdvisorPanel profileId={profile.id} />
          <GameModDiscovery domain={domain} signedIn={!!user} sections="hero" />
        </TabsContent>

        <TabsContent value="discover" className="space-y-6">
          <GameModDiscovery domain={domain} signedIn={!!user} sections="rows" compact />
        </TabsContent>

        <TabsContent value="tune">
          <GameSettingsPanel profileId={profile.id} />
        </TabsContent>

        <TabsContent value="community">
          <CommunityHubPanel gameDomain={domain} embedded />
        </TabsContent>
      </Tabs>

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
