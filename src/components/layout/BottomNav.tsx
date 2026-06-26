import { useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import {
  FolderOpen,
  Gamepad2,
  Home,
  Layers,
  LayoutDashboard,
  ListOrdered,
  MoreHorizontal,
  Search,
  Settings,
  Settings2,
  Wrench,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { usePathname, parseGameDomainFromPath } from "@/lib/routeParams";
import { useGamesStore } from "@/stores";
import { cn, gameGradient } from "@/lib/utils";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { AppDialog } from "@/components/ui/dialog";

const GLOBAL_NAV = [
  { id: "/", to: "/" as const, label: "Home", icon: Home, color: "#ff7a3c" },
  { id: "/games", to: "/games" as const, label: "Games", icon: Gamepad2, color: "#35e3ff" },
  { id: "/settings", to: "/settings" as const, label: "Settings", icon: Settings, color: "#9aa3ba" },
] as const;

// Full in-game destination list — mirrors Sidebar so controller L1/R1 cycling
// reaches every screen. The visible bar shows the first four + a More sheet.
const GAME_NAV = [
  { id: "dashboard", to: "/games/$domain" as const, label: "Dashboard", icon: LayoutDashboard, color: "#ff7a3c" },
  { id: "browse", to: "/games/$domain/mods" as const, label: "Browse", icon: Search, color: "#35e3ff" },
  { id: "library", to: "/games/$domain/library" as const, label: "Library", icon: FolderOpen, color: "#a78bfa" },
  { id: "load-order", to: "/games/$domain/load-order" as const, label: "Orders", icon: ListOrdered, color: "#45e08a" },
  { id: "collections", to: "/games/$domain/collections" as const, label: "Collections", icon: Layers, color: "#f472b6" },
  { id: "fix", to: "/games/$domain/troubleshoot" as const, label: "Fix", icon: Wrench, color: "#fbbf24" },
  { id: "setup", to: "/games/$domain/setup" as const, label: "Setup", icon: Settings2, color: "#9aa3ba" },
] as const;

type GameNavItem = (typeof GAME_NAV)[number];

const PRIMARY_GAME_IDS = ["dashboard", "browse", "library", "load-order"] as const;
const isPrimaryGameId = (id: string) =>
  (PRIMARY_GAME_IDS as readonly string[]).includes(id);

function itemClass(active: boolean) {
  return cn(
    "focusable flex min-h-[52px] flex-1 flex-col items-center justify-center gap-1 rounded-lg px-1 py-1.5 text-[0.6875rem] font-medium leading-none transition-colors",
    active
      ? "text-[var(--color-foreground)]"
      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
  );
}

function NavIcon({ Icon, active, color }: { Icon: LucideIcon; active: boolean; color: string }) {
  return (
    <Icon
      className="h-6 w-6 shrink-0"
      style={{
        color,
        opacity: active ? 1 : 0.8,
        filter: active ? `drop-shadow(0 0 8px ${color})` : undefined,
      }}
    />
  );
}

export function BottomNav() {
  const pathname = usePathname();
  const navigate = useNavigate();
  const profiles = useGamesStore((s) => s.profiles);
  const [moreOpen, setMoreOpen] = useState(false);

  const domain = parseGameDomainFromPath(pathname);
  const profile = domain ? profiles.find((p) => p.game_domain === domain) : undefined;
  const inGame = !!domain;

  const gamePath = (item: GameNavItem) => item.to.replace("$domain", domain ?? "");
  const isGameActive = (item: GameNavItem) => {
    const path = gamePath(item);
    return item.id === "dashboard"
      ? pathname === path
      : pathname === path || pathname.startsWith(`${path}/`);
  };

  const activeGameNav =
    GAME_NAV.find((item) => domain && isGameActive(item))?.id ?? "dashboard";
  const activeGlobalNav =
    GLOBAL_NAV.find((n) =>
      n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(`${n.to}/`)
    )?.id ?? "/";

  const goGame = (item: GameNavItem) => {
    if (!domain) return;
    navigate({
      to: item.to,
      params: { domain },
      search: item.id === "browse" ? { modId: undefined } : undefined,
    });
  };

  // Controller L1/R1 cycles the full destination set (same as the desktop rail).
  useGamepadTabs(
    inGame ? GAME_NAV.map((n) => n.id) : GLOBAL_NAV.map((n) => n.id),
    inGame ? activeGameNav : activeGlobalNav,
    (tabId) => {
      if (inGame) {
        const item = GAME_NAV.find((n) => n.id === tabId);
        if (item) goGame(item);
      } else {
        navigate({ to: tabId as "/" | "/games" | "/settings" });
      }
    },
    "sidebar"
  );

  const primaryGame = PRIMARY_GAME_IDS.map(
    (id) => GAME_NAV.find((n) => n.id === id)!
  );
  const moreActive = inGame && !isPrimaryGameId(activeGameNav);

  const closeAnd = (fn: () => void) => {
    setMoreOpen(false);
    fn();
  };

  return (
    <>
      <nav
        data-bottom-nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-[55] border-t border-[var(--color-border)] bg-[var(--color-card)]/95 backdrop-blur-md pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto flex max-w-2xl items-stretch gap-0.5 px-1.5 py-1">
          {inGame ? (
            <>
              {primaryGame.map((item) => {
                const active = isGameActive(item);
                return (
                  <Link
                    key={item.id}
                    to={item.to}
                    params={{ domain }}
                    search={item.id === "browse" ? { modId: undefined } : undefined}
                    className={itemClass(active)}
                    data-focusable="true"
                  >
                    <NavIcon Icon={item.icon} active={active} color={item.color} />
                    <span className="max-w-full truncate">{item.label}</span>
                  </Link>
                );
              })}
              <button
                type="button"
                onClick={() => setMoreOpen(true)}
                className={itemClass(moreActive)}
                data-focusable="true"
                aria-haspopup="dialog"
              >
                <NavIcon Icon={MoreHorizontal} active={moreActive} color="#aab2c8" />
                <span>More</span>
              </button>
            </>
          ) : (
            GLOBAL_NAV.map((item) => {
              const active =
                item.to === "/"
                  ? pathname === "/"
                  : pathname === item.to || pathname.startsWith(`${item.to}/`);
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  className={itemClass(active)}
                  data-focusable="true"
                >
                  <NavIcon Icon={item.icon} active={active} color={item.color} />
                  <span className="max-w-full truncate">{item.label}</span>
                </Link>
              );
            })
          )}
        </div>
      </nav>

      <AppDialog
        open={moreOpen}
        onOpenChange={setMoreOpen}
        title="Menu"
        className="max-w-md"
      >
        <div className="space-y-4">
          {inGame && (
            <div>
              {profile && (
                <div className="mb-2 flex items-center gap-2.5 px-1">
                  <div
                    className={cn(
                      "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                      gameGradient(domain)
                    )}
                  >
                    <Gamepad2 className="h-4 w-4 text-white" />
                  </div>
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold leading-tight">{profile.name}</p>
                    <p className="truncate text-xs text-[var(--color-muted)]">{domain}</p>
                  </div>
                </div>
              )}
              <div className="grid grid-cols-1 gap-1.5">
                {GAME_NAV.filter((n) => !isPrimaryGameId(n.id)).map((item) => {
                  const active = isGameActive(item);
                  return (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => closeAnd(() => goGame(item))}
                      className={cn(
                        "focusable flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-2.5 text-left font-medium transition-colors",
                        active
                          ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/30"
                          : "text-[var(--color-foreground)] hover:bg-[var(--color-card-hover)]"
                      )}
                      data-focusable="true"
                    >
                      <item.icon className="h-5 w-5 shrink-0" />
                      {item.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          <div className={cn(inGame && "border-t border-[var(--color-border)] pt-4")}>
            <div className="grid grid-cols-1 gap-1.5">
              {GLOBAL_NAV.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => closeAnd(() => navigate({ to: item.to }))}
                  className="focusable flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-2.5 text-left font-medium text-[var(--color-foreground)] transition-colors hover:bg-[var(--color-card-hover)]"
                  data-focusable="true"
                >
                  <item.icon className="h-5 w-5 shrink-0" />
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </AppDialog>
    </>
  );
}
