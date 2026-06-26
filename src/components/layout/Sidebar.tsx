import { Link, useNavigate } from "@tanstack/react-router";
import {
  ChevronsLeft,
  ChevronsRight,
  FolderOpen,
  Gamepad2,
  Home,
  Layers,
  LayoutDashboard,
  ListOrdered,
  Search,
  Settings,
  Settings2,
  Wrench,
} from "lucide-react";
import { usePathname, parseGameDomainFromPath } from "@/lib/routeParams";
import { useGamesStore } from "@/stores";
import { useSettingsStore } from "@/stores/settingsStore";
import { cn, gameGradient } from "@/lib/utils";
import { useState } from "react";
import { useGamepadTabs } from "@/hooks/useGamepadTabs";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";

const GLOBAL_NAV = [
  { to: "/", label: "Home", icon: Home, color: "#ff7a3c" },
  { to: "/games", label: "Games", icon: Gamepad2, color: "#35e3ff" },
  { to: "/settings", label: "Settings", icon: Settings, color: "#9aa3ba" },
] as const;

const GAME_NAV = [
  { id: "dashboard", to: "/games/$domain" as const, label: "Dashboard", icon: LayoutDashboard, color: "#ff7a3c" },
  { id: "browse", to: "/games/$domain/mods" as const, label: "Browse", icon: Search, color: "#35e3ff" },
  { id: "library", to: "/games/$domain/library" as const, label: "Library", icon: FolderOpen, color: "#a78bfa" },
  { id: "load-order", to: "/games/$domain/load-order" as const, label: "Load Order", icon: ListOrdered, color: "#45e08a" },
  { id: "collections", to: "/games/$domain/collections" as const, label: "Collections", icon: Layers, color: "#f472b6" },
  { id: "fix", to: "/games/$domain/troubleshoot" as const, label: "Fix", icon: Wrench, color: "#fbbf24" },
  { id: "setup", to: "/games/$domain/setup" as const, label: "Setup", icon: Settings2, color: "#9aa3ba" },
] as const;

function navRowClass(active: boolean, collapsed: boolean) {
  return cn(
    "focusable flex min-h-[52px] items-center gap-3 rounded-xl px-4 py-2.5 font-medium transition-all",
    collapsed ? "justify-center" : "justify-center md:justify-start",
    active
      ? "text-[var(--color-foreground)]"
      : "text-[var(--color-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)]"
  );
}

/** Per-destination tinted background + inset ring for the active nav row. */
function activeRowStyle(color: string) {
  return { backgroundColor: `${color}1f`, boxShadow: `inset 0 0 0 1px ${color}55` };
}

function navIconStyle(color: string, active: boolean) {
  return { color, filter: active ? `drop-shadow(0 0 8px ${color})` : undefined };
}

function labelClass(collapsed: boolean) {
  return collapsed ? "hidden" : "hidden md:inline";
}

export function Sidebar() {
  const pathname = usePathname();
  const navigate = useNavigate();
  const collapsedPref = useSettingsStore((s) => s.sidebarCollapsed);
  const toggleSidebar = useSettingsStore((s) => s.toggleSidebar);
  const profiles = useGamesStore((s) => s.profiles);
  const { controllerActive } = useGamepadRouterState();
  const [focusWithin, setFocusWithin] = useState(false);
  // With a controller the rail stays collapsed until focus moves into it (press
  // a direction toward the nav to expand it); mouse users keep their preference.
  const collapsed = controllerActive ? !focusWithin : collapsedPref;

  const domain = parseGameDomainFromPath(pathname);
  const profile = domain ? profiles.find((p) => p.game_domain === domain) : undefined;

  const activeGameNav = GAME_NAV.find((item) => {
    if (!domain) return false;
    const path = item.to.replace("$domain", domain);
    return pathname === path || pathname.startsWith(`${path}/`);
  })?.id ?? "dashboard";

  useGamepadTabs(
    domain ? GAME_NAV.map((n) => n.id) : GLOBAL_NAV.map((n) => n.to),
    domain ? activeGameNav : GLOBAL_NAV.find((n) =>
      n.to === "/" ? pathname === "/" : pathname === n.to || pathname.startsWith(`${n.to}/`)
    )?.to ?? "/",
    (tabId) => {
      if (domain) {
        const item = GAME_NAV.find((n) => n.id === tabId);
        if (!item) return;
        navigate({
          to: item.to,
          params: { domain },
          search: item.id === "browse" ? { modId: undefined } : undefined,
        });
      } else {
        navigate({ to: tabId as "/" | "/games" | "/settings" });
      }
    },
    "sidebar"
  );

  return (
    <nav
      data-focus-group="sidebar"
      onFocusCapture={() => setFocusWithin(true)}
      onBlurCapture={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node)) setFocusWithin(false);
      }}
      className={cn(
        "flex min-h-0 shrink-0 flex-col overflow-y-auto border-r border-[var(--color-border)] bg-[var(--color-surface-1)]/40 py-4 scrollbar-thin transition-[width]",
        collapsed
          ? "w-20 items-center"
          : "w-20 items-center md:w-56 md:items-stretch md:px-3"
      )}
    >
      <div className="flex w-full flex-col gap-1.5">
        {GLOBAL_NAV.map(({ to, label, icon: Icon, color }) => {
          const active =
            to === "/" ? pathname === "/" : pathname === to || pathname.startsWith(`${to}/`);
          return (
            <Link
              key={to}
              to={to}
              className={navRowClass(active, collapsed)}
              style={active ? activeRowStyle(color) : undefined}
              data-focusable="true"
            >
              <Icon className="h-6 w-6 shrink-0" style={navIconStyle(color, active)} />
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
            {GAME_NAV.map((item) => {
              const path = item.to.replace("$domain", domain);
              const active =
                item.id === "dashboard"
                  ? pathname === path
                  : pathname === path || pathname.startsWith(`${path}/`);
              const Icon = item.icon;
              return (
                <Link
                  key={item.id}
                  to={item.to}
                  params={{ domain }}
                  search={item.id === "browse" ? { modId: undefined } : undefined}
                  className={navRowClass(active, collapsed)}
                  style={active ? activeRowStyle(item.color) : undefined}
                  data-focusable="true"
                >
                  <Icon className="h-5 w-5 shrink-0" style={navIconStyle(item.color, active)} />
                  <span className={labelClass(collapsed)}>{item.label}</span>
                </Link>
              );
            })}
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
