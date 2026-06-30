import { ChevronRightIcon, DownloadsIcon, StarIcon } from "./icons";
import { coverUrl, formatCount } from "../lib/modUi";
import type { ModSummary } from "../types";

export function StatRow({ mod, className = "" }: { mod: ModSummary; className?: string }) {
  const endorse = mod.endorsements ?? 0;
  const downloads = mod.mod_downloads ?? 0;
  if (endorse <= 0 && downloads <= 0) return null;
  return (
    <span className={`cc-stat-row ${className}`.trim()}>
      {endorse > 0 && (
        <span className="cc-stat">
          <StarIcon className="cc-stat-ico" />
          {formatCount(endorse)}
        </span>
      )}
      {downloads > 0 && (
        <span className="cc-stat">
          <DownloadsIcon className="cc-stat-ico" />
          {formatCount(downloads)}
        </span>
      )}
    </span>
  );
}

export function CcTile({
  mod,
  className = "",
  installed = false,
  onOpen,
}: {
  mod: ModSummary;
  className?: string;
  installed?: boolean;
  onOpen: (mod: ModSummary) => void;
}) {
  const img = coverUrl(mod);
  return (
    <button type="button" className={`cc-tile ${className}`.trim()} onClick={() => onOpen(mod)}>
      <div className="cc-tile-media">
        {img ? (
          <img src={img} alt="" className="cc-tile-img" loading="lazy" />
        ) : (
          <div className="cc-tile-fallback" />
        )}
        {installed && <span className="cc-installed-pill">Installed</span>}
        <div className="cc-tile-scrim" />
        <div className="cc-tile-caption">
          <p className="cc-tile-title">{mod.name}</p>
          <p className="cc-tile-meta">{mod.author}</p>
          <StatRow mod={mod} className="mt-1.5" />
        </div>
      </div>
    </button>
  );
}

export function CcHeroCard({
  mod,
  installed = false,
  onOpen,
}: {
  mod: ModSummary;
  installed?: boolean;
  onOpen: (mod: ModSummary) => void;
}) {
  const img = coverUrl(mod);
  return (
    <button type="button" className="cc-hero-card" onClick={() => onOpen(mod)}>
      <div className="cc-hero-card-media">
        {img ? (
          <img src={img} alt="" className="cc-tile-img" loading="lazy" />
        ) : (
          <div className="cc-tile-fallback" />
        )}
        {installed && <span className="cc-installed-pill">Installed</span>}
        <div className="cc-hero-card-scrim" />
        <span className="cc-hero-card-badge">Featured</span>
        <div className="cc-hero-card-body">
          <p className="cc-hero-card-title">{mod.name}</p>
          <p className="cc-tile-meta">{mod.author}</p>
          <StatRow mod={mod} className="mt-2" />
        </div>
      </div>
    </button>
  );
}

export function CcListRow({
  mod,
  installed = false,
  onOpen,
}: {
  mod: ModSummary;
  installed?: boolean;
  onOpen: (mod: ModSummary) => void;
}) {
  const img = coverUrl(mod);
  return (
    <button type="button" className="cc-list-row" onClick={() => onOpen(mod)}>
      <div className="cc-list-thumb">
        {img ? (
          <img src={img} alt="" className="cc-tile-img" loading="lazy" />
        ) : (
          <div className="cc-tile-fallback" />
        )}
      </div>
      <div className="cc-list-body">
        <div className="flex min-w-0 items-start gap-2">
          <p className="cc-list-title min-w-0 flex-1">{mod.name}</p>
          {installed && <span className="cc-installed-pill cc-installed-pill-inline">Installed</span>}
        </div>
        <p className="cc-list-author">{mod.author}</p>
        <StatRow mod={mod} className="mt-1" />
      </div>
      <ChevronRightIcon className="cc-list-chevron" />
    </button>
  );
}

export function GameBar({
  games,
  gameDomain,
  onSelect,
}: {
  games: import("../types").CompanionGame[];
  gameDomain: string;
  onSelect: (domain: string) => void;
}) {
  return (
    <div className="cc-game-bar">
      {games.map((g) => (
        <button
          key={g.domain}
          type="button"
          className={gameDomain === g.domain ? "cc-chip cc-chip-active" : "cc-chip"}
          onClick={() => onSelect(g.domain)}
        >
          {g.name}
        </button>
      ))}
    </div>
  );
}
