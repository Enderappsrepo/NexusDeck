import { useCallback } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";
import { useUiLockStore } from "@/stores/uiLockStore";

const TOP_LEVEL_PATHS = new Set(["/", "/games", "/settings", "/onboarding"]);

// Collapse back invocations that arrive within this window (gamepad B plus the
// Esc/Backspace Steam mirrors for the same press) so one tap goes back once.
let lastBackAt = 0;
const BACK_LOCK_MS = 250;

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
}

/** Parent route for known nested paths; avoids brittle history.back() in SPAs. */
function explicitBackTarget(pathname: string):
  | { to: "/games" }
  | { to: "/games/$domain"; params: { domain: string } }
  | { to: "/games/$domain/mods"; params: { domain: string }; search: { modId: undefined } }
  | { to: "/games/$domain/collections"; params: { domain: string } }
  | { to: "/games/$domain/mods/$modId"; params: { domain: string; modId: string } }
  | { to: "/" }
  | null {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "games" || parts.length < 2) {
    return pathname === "/" ? null : { to: "/" };
  }

  const domain = parts[1];
  if (parts.length === 2) {
    return { to: "/games" };
  }
  if (parts[2] === "mods" && parts.length === 4) {
    return {
      to: "/games/$domain/mods",
      params: { domain },
      search: { modId: undefined },
    };
  }
  if (parts[2] === "collections" && parts.length === 4) {
    return { to: "/games/$domain/collections", params: { domain } };
  }
  if (parts[2] === "preview" && parts.length === 4) {
    return {
      to: "/games/$domain/mods/$modId",
      params: { domain, modId: parts[3] },
    };
  }
  return { to: "/games/$domain", params: { domain } };
}

export function useShowBackButton(): boolean {
  const pathname = useRouterState({ select: (s) => normalizePath(s.location.pathname) });
  return !TOP_LEVEL_PATHS.has(pathname);
}

export function useAppBack() {
  const router = useRouter();
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return useCallback(() => {
    // Don't navigate away while an install is mid-flight.
    if (useUiLockStore.getState().installBusy) return;

    const now = performance.now();
    if (now - lastBackAt < BACK_LOCK_MS) return;
    lastBackAt = now;

    const target = explicitBackTarget(pathname);
    if (target) {
      navigate(target);
      return;
    }

    if (window.history.length > 1) {
      router.history.back();
      return;
    }

    navigate({ to: "/" });
  }, [router, navigate, pathname]);
}
