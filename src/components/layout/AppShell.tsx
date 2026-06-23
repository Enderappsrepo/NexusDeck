import { Link } from "@tanstack/react-router";
import { GameRunningBanner } from "@/components/launch/GameRunningBanner";
import { UpdateBanner } from "@/components/layout/UpdateBanner";
import { Toaster } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { useControllerFocus } from "@/hooks/useControllerFocus";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore } from "@/stores";
import { BackButton } from "@/components/layout/BackButton";
import { Sidebar } from "@/components/layout/Sidebar";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";

export function AppShell({
  children,
  hideNav = false,
  updateInfo = null,
  onDismissUpdate,
}: {
  children: React.ReactNode;
  hideNav?: boolean;
  updateInfo?: import("@/lib/nexus/types").AppUpdateInfo | null;
  onDismissUpdate?: () => void;
}) {
  const toasts = useLaunchStore((s) => s.toasts);
  const dismissToast = useLaunchStore((s) => s.dismissToast);
  const user = useAuthStore((s) => s.user);
  const { controllerActive } = useGamepadRouterState();
  useControllerFocus();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <GameRunningBanner />
      {updateInfo && (
        <UpdateBanner info={updateInfo} onDismiss={onDismissUpdate} />
      )}
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
        <div className="flex items-center gap-3">
          {!user && !hideNav && (
            <Button variant="secondary" size="sm" asChild data-focusable="true">
              <Link to="/settings">Sign in</Link>
            </Button>
          )}
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
        </div>
      </header>

      <div className="flex min-h-0 flex-1 overflow-hidden">
        {!hideNav && <Sidebar />}
        <main
          className="app-scroll-pane min-h-0 flex-1 p-6 scrollbar-thin"
          data-scroll-pane
        >
          {children}
        </main>
      </div>
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
