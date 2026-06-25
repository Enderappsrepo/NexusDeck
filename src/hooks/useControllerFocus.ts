import { useEffect } from "react";
import { usePathname } from "@/lib/routeParams";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { focusFirst, resetFocusIndex } from "@/lib/gamepad/focusNavigation";

/**
 * Keep a visible focus target on screen whenever a controller is in use. Resets
 * directional-focus state on every route change, then — if a controller is the
 * active input — moves focus into the page content so the d-pad has somewhere to
 * start and the focus ring is immediately visible. Runs on route change AND when
 * the controller first wakes up mid-page. Never steals an in-page focus (so it
 * won't fight a d-pad/stick move) and never grabs focus for mouse/touch users.
 */
export function useControllerFocus() {
  const pathname = usePathname();
  const { controllerActive } = useGamepadRouterState();

  useEffect(() => {
    resetFocusIndex();

    if (pathname === "/onboarding" || pathname.endsWith("/setup")) return;
    if (!controllerActive) return;

    // Defer one frame so a freshly navigated route has committed its DOM.
    const raf = requestAnimationFrame(() => {
      const active = document.activeElement as HTMLElement | null;
      // Already focused inside the page content (e.g. a d-pad move just landed)?
      // Leave it alone — only take over when focus is on body or page chrome.
      if (active && active.closest("[data-scroll-pane]")) return;
      focusFirst(document.querySelector<HTMLElement>("[data-scroll-pane]"));
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname, controllerActive]);
}
