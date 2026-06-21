import { useEffect, useRef } from "react";
import { usePathname } from "@/lib/routeParams";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import { focusFirst, resetFocusIndex } from "@/lib/gamepad/focusNavigation";

/**
 * On every route change, reset directional-focus state so the next d-pad/stick
 * press starts from the top of the new screen instead of a stale index. When a
 * controller is in use, also move focus to the first interactive element of the
 * new page so navigation feels immediate. Skipped for mouse/touch so we never
 * steal focus or flash a focus ring on people who aren't using a controller.
 */
export function useControllerFocus() {
  const pathname = usePathname();
  const firstRun = useRef(true);

  useEffect(() => {
    resetFocusIndex();

    // Don't grab focus on the initial mount or on the onboarding wizard.
    if (firstRun.current) {
      firstRun.current = false;
      return;
    }
    if (pathname === "/onboarding" || pathname.endsWith("/setup")) return;
    if (!gamepadRouter.getControllerActive()) return;

    // Defer one frame so the new route has committed its DOM before we look.
    const raf = requestAnimationFrame(() => {
      focusFirst(document.querySelector<HTMLElement>("[data-scroll-pane]"));
    });
    return () => cancelAnimationFrame(raf);
  }, [pathname]);
}
