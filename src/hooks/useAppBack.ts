import { useCallback } from "react";
import { useNavigate, useRouter, useRouterState } from "@tanstack/react-router";

const TOP_LEVEL_PATHS = new Set(["/", "/games", "/settings", "/onboarding"]);

function normalizePath(pathname: string): string {
  if (pathname === "/") return "/";
  return pathname.replace(/\/+$/, "") || "/";
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
    if (window.history.length > 1) {
      router.history.back();
      return;
    }

    const parts = pathname.split("/").filter(Boolean);
    if (parts[0] === "games" && parts.length >= 2) {
      const domain = parts[1];
      if (parts.length === 2) {
        navigate({ to: "/games" });
        return;
      }
      if (parts[2] === "mods" && parts.length === 4) {
        navigate({ to: "/games/$domain/mods", params: { domain }, search: { modId: undefined } });
        return;
      }
      if (parts[2] === "collections" && parts.length === 4) {
        navigate({ to: "/games/$domain/collections", params: { domain } });
        return;
      }
      if (parts[2] === "preview") {
        navigate({
          to: "/games/$domain/mods/$modId",
          params: { domain, modId: parts[3] },
        });
        return;
      }
      navigate({ to: "/games/$domain", params: { domain } });
      return;
    }

    navigate({ to: "/" });
  }, [router, navigate, pathname]);
}
