import { Link } from "@tanstack/react-router";
import { Home } from "lucide-react";
import { usePathname, isValidGameDomain } from "@/lib/routeParams";
import { useGamesStore } from "@/stores";

type CrumbKind =
  | "games"
  | "domain"
  | "mods"
  | "library"
  | "collections"
  | "setup"
  | "settings";

interface CrumbDesc {
  kind: CrumbKind;
  label: string;
}

const LINK_CLASS =
  "focusable truncate text-[var(--color-muted)] hover:text-[var(--color-foreground)]";

function CrumbLink({
  kind,
  domain,
  label,
}: {
  kind: CrumbKind;
  domain?: string;
  label: string;
}) {
  switch (kind) {
    case "games":
      return (
        <Link to="/games" className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
    case "settings":
      return (
        <Link to="/settings" className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
    case "domain":
      return (
        <Link to="/games/$domain" params={{ domain: domain! }} className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
    case "mods":
      return (
        <Link
          to="/games/$domain/mods"
          params={{ domain: domain! }}
          search={{ modId: undefined }}
          className={LINK_CLASS}
          data-focusable="true"
        >
          {label}
        </Link>
      );
    case "library":
      return (
        <Link to="/games/$domain/library" params={{ domain: domain! }} className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
    case "collections":
      return (
        <Link to="/games/$domain/collections" params={{ domain: domain! }} className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
    case "setup":
      return (
        <Link to="/games/$domain/setup" params={{ domain: domain! }} className={LINK_CLASS} data-focusable="true">
          {label}
        </Link>
      );
  }
}

export function Breadcrumbs() {
  const pathname = usePathname();
  const profiles = useGamesStore((s) => s.profiles);

  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return null;

  const crumbs: CrumbDesc[] = [];
  let domain: string | undefined;

  if (parts[0] === "games") {
    crumbs.push({ kind: "games", label: "Games" });
    if (parts[1] && isValidGameDomain(parts[1])) {
      domain = decodeURIComponent(parts[1]);
      const profile = profiles.find((p) => p.game_domain === domain);
      crumbs.push({ kind: "domain", label: profile?.name ?? domain });
      switch (parts[2]) {
        case "mods":
          crumbs.push({ kind: "mods", label: "Browse" });
          break;
        case "library":
          crumbs.push({ kind: "library", label: "Library" });
          break;
        case "collections":
          crumbs.push({ kind: "collections", label: "Collections" });
          break;
        case "setup":
          crumbs.push({ kind: "setup", label: "Setup" });
          break;
      }
    }
  } else if (parts[0] === "settings") {
    crumbs.push({ kind: "settings", label: "Settings" });
  } else {
    return null;
  }

  const lastIndex = crumbs.length - 1;

  return (
    <nav
      aria-label="Breadcrumb"
      className="flex min-w-0 items-center gap-1.5 border-l border-[var(--color-border)] pl-4 text-sm"
    >
      <Link
        to="/"
        className="focusable flex shrink-0 items-center text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        data-focusable="true"
        aria-label="Home"
      >
        <Home className="h-4 w-4" />
      </Link>
      {crumbs.map((c, i) => (
        <span key={c.kind} className="flex min-w-0 items-center gap-1.5">
          <span className="shrink-0 text-[var(--color-border-strong)]">/</span>
          {i === lastIndex ? (
            <span
              className="truncate font-medium text-[var(--color-foreground)]"
              aria-current="page"
            >
              {c.label}
            </span>
          ) : (
            <CrumbLink kind={c.kind} domain={domain} label={c.label} />
          )}
        </span>
      ))}
    </nav>
  );
}
