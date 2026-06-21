import { createFileRoute, Link, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  FolderOpen,
  Layers,
  Search,
  Settings2,
  Wrench,
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
import { GameArt } from "@/components/game/GameArt";
import { GameStatStrip } from "@/components/game/GameStatStrip";
import { BodySlidePanel } from "@/components/game/BodySlidePanel";
import { ModSearchBar } from "@/components/mod/ModSearchBar";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore, useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import {
  getGameMeta,
  hasScriptExtender,
  loadSupportedGames,
} from "@/lib/games";
import { resolveGameDomain, usePathname, isValidGameDomain } from "@/lib/routeParams";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { gamepadRouter, useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { GP } from "@/lib/gamepad/buttons";
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
  { to: "/games/$domain/troubleshoot" as const, label: "Fix", icon: Wrench, withModSearch: false },
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
    gamepadRouter.setContext(activeTab === "discover" ? "discover" : "gameHub");
  }, [activeTab]);

  useGamepadContextAction(
    GP.X,
    () => {
      navigate({
        to: "/games/$domain/mods",
        params: { domain },
        search: { modId: undefined },
      });
    },
    "gameHub"
  );

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
        <div className="relative mx-auto mb-6 h-32 w-full max-w-sm overflow-hidden rounded-2xl border border-[var(--color-border)]">
          <GameArt domain={domain} variant="tile" />
          <div className="absolute inset-0 bg-gradient-to-t from-black/80 to-transparent" />
          <div className="absolute bottom-4 left-4 right-4">
            <h1 className="text-2xl font-bold capitalize">{gameMeta?.display_name ?? domain}</h1>
          </div>
        </div>
        <p className="mt-4 text-[var(--color-muted)]">
          This game is not set up yet. Run the setup wizard to get started.
        </p>
        <Link to="/games/$domain/setup" params={{ domain }}>
          <Button size="lg" className="mt-8" data-focusable="true">
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
      <section className="game-banner min-h-[220px] sm:min-h-[260px]">
        <GameArt domain={domain} variant="hero" />
        <div className="game-banner-content">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <Badge variant="muted" className="mb-2">
                {gameMeta?.display_name ?? domain}
              </Badge>
              <h1 className="text-2xl font-bold tracking-tight sm:text-3xl lg:text-4xl">
                {profile.name}
              </h1>
              <p className="mt-1 truncate text-sm text-[var(--color-muted)]" title={profile.game_path}>
                {profile.game_path}
              </p>
            </div>
            <div className="relative hidden h-20 w-32 shrink-0 overflow-hidden rounded-xl border border-white/10 sm:block lg:h-24 lg:w-40">
              <GameArt domain={domain} variant="tile" className="rounded-xl" />
            </div>
          </div>

          <div className="mt-5">
            <LaunchButton profileId={profile.id} gameDomain={domain} />
          </div>

          <div className="mt-5">
            <GameStatStrip profileId={profile.id} playtime={playtime} />
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
          <BodySlidePanel profileId={profile.id} />
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
