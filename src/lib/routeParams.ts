import { useRouterState } from "@tanstack/react-router";

const INVALID_DOMAINS = new Set(["undefined", "null", ""]);

/** Read the game domain segment from a `/games/:domain/...` path. */
export function parseGameDomainFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  if (parts[0] !== "games" || !parts[1] || parts[1] === "games") return undefined;

  const domain = decodeURIComponent(parts[1]);
  return isValidGameDomain(domain) ? domain : undefined;
}

export function isValidGameDomain(domain: string | undefined): domain is string {
  return !!domain && !INVALID_DOMAINS.has(domain);
}

/** Resolve route domain from TanStack params with a URL fallback. */
export function resolveGameDomain(
  routeDomain: string | undefined,
  pathname: string
): string {
  if (isValidGameDomain(routeDomain)) return routeDomain;
  return parseGameDomainFromPath(pathname) ?? "";
}

export function usePathname(): string {
  return useRouterState({ select: (s) => s.location.pathname });
}
