import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { Star } from "lucide-react";
import { GameRunningBanner } from "@/components/launch/GameRunningBanner";
import { UpdateBanner } from "@/components/layout/UpdateBanner";
import { Toaster } from "@/components/ui/toast";
import { Button } from "@/components/ui/button";
import { GAMEPAD_HINTS } from "@/hooks/useFocusNavigation";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { useControllerFocus } from "@/hooks/useControllerFocus";
import { useLaunchStore } from "@/stores/launchStore";
import { useAuthStore } from "@/stores";
import { useSettingsStore } from "@/stores/settingsStore";
import { BackButton } from "@/components/layout/BackButton";
import { Sidebar } from "@/components/layout/Sidebar";
import { BottomNav } from "@/components/layout/BottomNav";
import { Breadcrumbs } from "@/components/layout/Breadcrumbs";
import { useIsNarrow } from "@/hooks/useMediaQuery";
import { resolveCompactNav } from "@/lib/platform";
import { useMediaQuery } from "@/hooks/useMediaQuery";

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
  const navMode = useSettingsStore((s) => s.navMode);
  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const narrow = useIsNarrow();
  const compactNav = resolveCompactNav(navMode, narrow, deckDetected);
  const coarsePointer = useMediaQuery("(pointer: coarse)");
  useControllerFocus();

  useEffect(() => {
    const touch = compactNav || coarsePointer || deckDetected;
    document.documentElement.dataset.touch = touch ? "true" : "false";
    return () => {
      delete document.documentElement.dataset.touch;
    };
  }, [compactNav, coarsePointer, deckDetected]);

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <GameRunningBanner />
      {updateInfo && (
        <UpdateBanner info={updateInfo} onDismiss={onDismissUpdate} />
      )}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-[var(--color-border)] bg-[image:var(--gradient-surface)] px-4 sm:h-16 sm:px-6">
        <div className="flex min-w-0 items-center gap-2 sm:gap-3">
          <BackButton />
          <div className="flex shrink-0 items-center gap-2 sm:gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-[image:var(--gradient-primary)] text-sm font-bold text-white shadow-[var(--shadow-glow)] sm:h-10 sm:w-10 sm:text-base">
              ND
            </div>
            <span className="truncate text-xl font-bold tracking-tight sm:text-2xl">
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
          {user?.is_premium && (
            <span
              className="hidden items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold text-[#5a3a06] shadow-[0_0_16px_rgba(245,158,11,0.4)] sm:flex"
              style={{ backgroundImage: "linear-gradient(135deg,#fde68a,#f59e0b)" }}
            >
              <Star className="h-3.5 w-3.5" />
              Premium
            </span>
          )}
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
        {!hideNav && !compactNav && <Sidebar />}
        <main
          className="app-scroll-pane min-h-0 flex-1 p-4 scrollbar-thin sm:p-6"
          data-scroll-pane
        >
          {children}
        </main>
      </div>
      {!hideNav && compactNav && <BottomNav />}
      <Toaster toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
