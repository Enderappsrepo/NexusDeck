import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Gamepad2,
  Home,
  Layers,
  LayoutDashboard,
  Search,
  Settings,
  Settings2,
} from "lucide-react";
import { usePathname, parseGameDomainFromPath } from "@/lib/routeParams";
import { useGamesStore } from "@/stores";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn, gameGradient } from "@/lib/utils";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";

const GLOBAL_NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/settings", label: "Settings", icon: Settings },
] as const;

const GAME_NAV = [
  { id: "dashboard", to: "/games/$domain" as const, label: "Dashboard" },
  { id: "browse", to: "/games/$domain/mods" as const, label: "Browse" },
  { id: "library", to: "/games/$domain/library" as const, label: "Library" },
  { id: "collections", to: "/games/$domain/collections" as const, label: "Collections" },
  { id: "setup", to: "/games/$domain/setup" as const, label: "Setup" },
] as const;

function rowClass(active: boolean, collapsed: boolean) {
  return cn(
    "focusable flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-2.5 font-medium transition-all",
    collapsed ? "justify-center" : "justify-center md:justify-start",
    active
      ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/30"
      : "text-[var(--color-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)]"
  );
}

function labelClass(collapsed: boolean) {
  return collapsed ? "hidden" : "hidden md:inline";
}

export function Sidebar() {
  const pathname = usePathname();
  const navigate = useNavigate();
  const collapsed = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const profiles = useGamesStore((s) => s.profiles);

  const domain = parseGameDomainFromPath(pathname);
  const profile = domain ? profiles.find((p) => p.game_domain === domain) : undefined;

  const activeGameNav = GAME_NAV.find((item) => {
    if (!domain) return false;
    const path = item.to.replace("$domain", domain);
    return pathname === path || pathname.startsWith(`${path}/`);
  })?.id ?? "dashboard";

  useGamepadTabs(
    GAME_NAV.map((n) => n.id),
    activeGameNav,
    (tabId) => {
      if (!domain) return;
      const item = GAME_NAV.find((n) => n.id === tabId);
      if (!item) return;
      navigate({
        to: item.to,
        params: { domain },
        search: item.id === "browse" ? { modId: undefined } : undefined,
      });
    }
  );

  return (
    <nav
      className={cn(
        "flex shrink-0 flex-col border-r border-[var(--color-border)] bg-[var(--color-surface-1)]/40 py-4 transition-[width]",
        collapsed
          ? "w-20 items-center"
          : "w-20 items-center md:w-56 md:items-stretch md:px-3"
      )}
    >
      <div className="flex w-full flex-col gap-1.5">
        {GLOBAL_NAV.map(({ to, label, icon: Icon }) => {
          const active =
            to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={rowClass(active, collapsed)}
              data-focusable="true"
            >
              <Icon
                className={cn(
                  "h-6 w-6 shrink-0",
                  active && "drop-shadow-[0_0_8px_rgba(255,107,43,0.6)]"
                )}
              />
              <span className={labelClass(collapsed)}>{label}</span>
            </Link>
          );
        })}
      </div>

      {profile && domain && (
        <div className="mt-4 w-full border-t border-[var(--color-border)] pt-4">
          <div
            className={cn(
              "mb-2 flex items-center gap-2.5",
              collapsed ? "justify-center" : "justify-center md:justify-start md:px-2"
            )}
          >
            <div
              className={cn(
                "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br",
                gameGradient(domain)
              )}
            >
              <Gamepad2 className="h-4 w-4 text-white" />
            </div>
            <div className={cn("min-w-0", collapsed ? "hidden" : "hidden md:block")}>
              <p className="truncate text-sm font-semibold leading-tight">{profile.name}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">{domain}</p>
            </div>
          </div>

          <div className="flex w-full flex-col gap-1">
            <Link
              to="/games/$domain"
              params={{ domain }}
              className={rowClass(pathname === `/games/${domain}`, collapsed)}
              data-focusable="true"
            >
              <LayoutDashboard className="h-5 w-5 shrink-0" />
              <span className={labelClass(collapsed)}>Dashboard</span>
            </Link>
            <Link
              to="/games/$domain/mods"
              params={{ domain }}
              search={{ modId: undefined }}
              className={rowClass(pathname.startsWith(`/games/${domain}/mods`), collapsed)}
              data-focusable="true"
            >
              <Search className="h-5 w-5 shrink-0" />
              <span className={labelClass(collapsed)}>Browse</span>
            </Link>
            <Link
              to="/games/$domain/library"
              params={{ domain }}
              className={rowClass(pathname.startsWith(`/games/${domain}/library`), collapsed)}
              data-focusable="true"
            >
              <FolderOpen className="h-5 w-5 shrink-0" />
              <span className={labelClass(collapsed)}>Library</span>
            </Link>
            <Link
              to="/games/$domain/collections"
              params={{ domain }}
              className={rowClass(pathname.startsWith(`/games/${domain}/collections`), collapsed)}
              data-focusable="true"
            >
              <Layers className="h-5 w-5 shrink-0" />
              <span className={labelClass(collapsed)}>Collections</span>
            </Link>
            <Link
              to="/games/$domain/setup"
              params={{ domain }}
              className={rowClass(pathname.startsWith(`/games/${domain}/setup`), collapsed)}
              data-focusable="true"
            >
              <Settings2 className="h-5 w-5 shrink-0" />
              <span className={labelClass(collapsed)}>Setup</span>
            </Link>
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={toggleSidebar}
        aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        className={cn(
          "focusable mt-auto hidden min-h-[44px] items-center gap-2 rounded-xl px-4 py-2 text-sm text-[var(--color-muted)] transition-colors hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)] md:flex",
          collapsed ? "justify-center" : "justify-start"
        )}
        data-focusable="true"
      >
        {collapsed ? (
          <ChevronsRight className="h-5 w-5" />
        ) : (
          <ChevronsLeft className="h-5 w-5" />
        )}
        <span className={collapsed ? "hidden" : "hidden md:inline"}>Collapse</span>
      </button>
    </nav>
  );
}
