import { Link, useRouterState } from "@tanstack/react-router";
import { Home, Gamepad2, Settings } from "lucide-react";
import { GameRunningBanner } from "@/components/launch/GameRunningBanner";
import { Toaster } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { useLaunchStore } from "@/stores/launchStore";
import { BackButton } from "@/components/layout/BackButton";

const navItems = [
  { to: "/", label: "Home", icon: Home },
  { to: "/games", label: "Games", icon: Gamepad2 },
  { to: "/settings", label: "Settings", icon: Settings },
];

export function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const toasts = useLaunchStore((s) => s.toasts);
  const dismissToast = useLaunchStore((s) => s.dismissToast);

  return (
    <div className="flex h-full flex-col">
      <GameRunningBanner />
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[image:var(--gradient-surface)] px-6">
        <div className="flex min-w-0 items-center gap-2">
          <BackButton />
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] font-bold text-white shadow-[var(--shadow-glow)]">
              ND
            </div>
            <span className="truncate text-2xl font-bold tracking-tight">
              Nexus<span className="text-[var(--color-primary)]">Deck</span>
            </span>
          </div>
        </div>
        <div className="hidden items-center gap-3 text-xs text-[var(--color-muted)] xl:flex 2xl:gap-4 2xl:text-sm">
          <span>{GAMEPAD_HINTS.navigate}: Navigate</span>
          <span>{GAMEPAD_HINTS.confirm}: Select</span>
          <span>{GAMEPAD_HINTS.back}: Back</span>
          <span>{GAMEPAD_HINTS.tabs}: Tabs</span>
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        <nav className="flex w-20 shrink-0 flex-col items-center gap-1.5 border-r border-[var(--color-border)] bg-[var(--color-surface-1)]/40 py-4 md:w-56 md:items-stretch md:px-3">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = pathname === to || (to !== "/" && pathname.startsWith(to));
            return (
              <Link
                key={to}
                to={to}
                className={cn(
                  "focusable flex min-h-[56px] items-center justify-center gap-3 rounded-xl px-4 py-3 font-medium transition-all md:justify-start",
                  active
                    ? "bg-[var(--color-primary)]/12 text-[var(--color-primary)] ring-1 ring-inset ring-[var(--color-primary)]/30"
                    : "text-[var(--color-muted)] hover:bg-[var(--color-card)] hover:text-[var(--color-foreground)]"
                )}
                data-focusable="true"
              >
                <Icon className={cn("h-6 w-6 shrink-0", active && "drop-shadow-[0_0_8px_rgba(255,107,43,0.6)]")} />
                <span className="hidden md:inline">{label}</span>
              </Link>
            );
          })}
        </nav>

        <main className="min-h-0 flex-1 overflow-auto p-6 scrollbar-thin">{children}</main>
      </div>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
