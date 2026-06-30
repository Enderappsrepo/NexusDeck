import { useEffect, useState } from "react";
import { fetchCollectionDetail, fetchCollections, startCollectionInstall, type PairedDeck } from "../deckApi";
import type { CollectionSummary, CompanionCollectionDetail } from "../types";

export function CollectionsScreen({
  paired,
  gameDomain,
  onBack,
  onOpen,
}: {
  paired: PairedDeck;
  gameDomain: string;
  onBack: () => void;
  onOpen: (slug: string) => void;
}) {
  const [list, setList] = useState<CollectionSummary[]>([]);
  const [busy, setBusy] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetchCollections(paired, gameDomain)
      .then((items) => {
        if (!cancelled) setList(items);
      })
      .catch((e) => {
        if (!cancelled) setError(e instanceof Error ? e.message : String(e));
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paired, gameDomain]);

  return (
    <div className="cc-body">
      <button type="button" className="cc-btn-ghost mb-3" onClick={onBack}>
        ← Back to browse
      </button>
      <p className="cc-section-label">Collections</p>
      {busy && <p className="text-sm text-[var(--cc-muted)]">Loading…</p>}
      {error && <p className="cc-banner-err">{error}</p>}
      <div className="cc-list">
        {list.map((c) => (
          <button key={c.slug} type="button" className="cc-list-row" onClick={() => onOpen(c.slug)}>
            <div className="cc-list-body">
              <p className="cc-list-title">{c.name}</p>
              <p className="cc-list-author">
                {c.author} · {c.mod_count} mods
              </p>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

export function CollectionDetailScreen({
  paired,
  gameDomain,
  slug,
  onBack,
  onNotify,
}: {
  paired: PairedDeck;
  gameDomain: string;
  slug: string;
  onBack: () => void;
  onNotify?: (msg: string) => void;
}) {
  const [detail, setDetail] = useState<CompanionCollectionDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [installBusy, setInstallBusy] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetchCollectionDetail(paired, gameDomain, slug)
      .then((d) => {
        if (!cancelled) setDetail(d);
      })
      .finally(() => {
        if (!cancelled) setBusy(false);
      });
    return () => {
      cancelled = true;
    };
  }, [paired, gameDomain, slug]);

  return (
    <div className="cc-body space-y-3">
      <button type="button" className="cc-btn-ghost" onClick={onBack}>
        ← Collections
      </button>
      {busy && <p className="text-sm text-[var(--cc-muted)]">Loading…</p>}
      {detail && (
        <>
          <h2 className="text-lg font-bold">{detail.detail.name}</h2>
          <p className="text-sm text-[var(--cc-muted)]">
            {detail.diff.installed_count}/{detail.diff.total_count} installed · {detail.diff.missing_count} missing
          </p>
          <button
            type="button"
            className="cc-btn w-full"
            disabled={installBusy || detail.diff.missing_count === 0}
            onClick={() => {
              setInstallBusy(true);
              void startCollectionInstall(paired, gameDomain, slug)
                .then((queued) => onNotify?.(`Queued ${queued.length} mod download(s).`))
                .finally(() => setInstallBusy(false));
            }}
          >
            {installBusy ? "Queueing…" : "Install missing mods"}
          </button>
          <ul className="space-y-1 text-sm">
            {detail.diff.mods.slice(0, 24).map((m) => (
              <li key={m.mod_id} className="flex justify-between gap-2 border-b border-[var(--cc-border-subtle)] py-1">
                <span className="truncate">{m.name}</span>
                <span className="shrink-0 text-[10px] uppercase text-[var(--cc-muted)]">{m.status}</span>
              </li>
            ))}
          </ul>
        </>
      )}
    </div>
  );
}
