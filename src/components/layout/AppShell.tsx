import { GameRunningBanner } from "@/components/launch/GameRunningBanner";
import { Toaster } from "@/components/ui/toast";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { useLaunchStore } from "@/stores/launchStore";
import { BackButton } from "@/components/layout/BackButton";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

export function AppShell({
  children,
  hideNav = false,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
}) {
  const toasts = useLaunchStore((s) => s.toasts);
  const dismissToast = useLaunchStore((s) => s.dismissToast);
  const { controllerActive } = useGamepadRouterState();

  return (
    <div className="flex h-full min-h-screen flex-col">
      <GameRunningBanner />
      <header className="flex h-16 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[image:var(--gradient-surface)] px-6">
        <div className="flex min-w-0 items-center gap-3">
          <BackButton />
          <div className="flex shrink-0 items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] font-bold text-white shadow-[var(--shadow-glow)]">
              ND
            </div>
            <span className="truncate text-2xl font-bold tracking-tight">
              Nexus<span className="text-[var(--color-primary)]">Deck</span>
            </span>
          </div>
          {!hideNav && (
            <div className="hidden min-w-0 sm:block">
              <Breadcrumbs />
            </div>
          )}
        </div>
        <div className="hidden items-center gap-3 text-xs text-[var(--color-muted)] xl:flex 2xl:gap-4 2xl:text-sm">
          {!controllerActive && (
            <>
              <span>{GAMEPAD_HINTS.navigate}: Navigate</span>
              <span>{GAMEPAD_HINTS.confirm}: Select</span>
              <span>{GAMEPAD_HINTS.back}: Back</span>
              <span>{GAMEPAD_HINTS.tabs}: Tabs</span>
              <span>{GAMEPAD_HINTS.scroll}: Scroll</span>
            </>
          )}
        </div>
      </header>

      <div className="flex min-h-0 flex-1">
        {!hideNav && <Sidebar />}
        <main className="min-h-0 flex-1 overflow-auto p-6 scrollbar-thin" data-scroll-pane>
          {children}
        </main>
      </div>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
