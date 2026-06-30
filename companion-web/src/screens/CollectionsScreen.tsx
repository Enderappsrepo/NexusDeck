import { useEffect, useMemo, useState } from "react";
import { fetchCollectionDetail, fetchCollections, startCollectionInstall, type PairedDeck } from "../deckApi";
import { queueCollectionModsToCompanion } from "../lib/collectionQueue";
import type { CollectionModDiffEntry, CollectionSummary, CompanionCollectionDetail } from "../types";

const STATUS_LABEL: Record<string, string> = {
  missing: "Missing",
  outdated: "Outdated",
  wrong_file: "Wrong file",
  installed: "Installed",
};

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
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    let cancelled = false;
    setBusy(true);
    void fetchCollections(paired, gameDomain, offset)
      .then((items) => {
        if (!cancelled) {
          setList((prev) => (offset === 0 ? items : [...prev, ...items]));
        }
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
  }, [paired, gameDomain, offset]);

  return (
    <div className="cc-body">
      <button type="button" className="cc-btn-ghost mb-3" onClick={onBack}>
        ← Back to browse
      </button>
      <p className="cc-section-label">Collections</p>
      {busy && offset === 0 && <p className="text-sm text-[var(--cc-muted)]">Loading…</p>}
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
      {!busy && list.length >= 24 && (
        <button type="button" className="cc-btn-secondary mt-3 w-full" onClick={() => setOffset((o) => o + 24)}>
          Load more collections
        </button>
      )}
    </div>
  );
}

export function CollectionDetailScreen({
  paired,
  gameDomain,
  slug,
  onBack,
  onNotify,
  onOpenMod,
  onOpenInstallQueue,
}: {
  paired: PairedDeck;
  gameDomain: string;
  slug: string;
  onBack: () => void;
  onNotify?: (msg: string) => void;
  onOpenMod?: (modId: number, name: string) => void;
  onOpenInstallQueue?: () => void;
}) {
  const [detail, setDetail] = useState<CompanionCollectionDetail | null>(null);
  const [busy, setBusy] = useState(true);
  const [queueBusy, setQueueBusy] = useState(false);
  const [deckBusy, setDeckBusy] = useState(false);
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [includeOptional, setIncludeOptional] = useState(false);

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

  const mods = detail?.diff.mods ?? [];
  const filtered = useMemo(() => {
    if (statusFilter === "all") return mods;
    return mods.filter((m) => m.status === statusFilter);
  }, [mods, statusFilter]);

  const addMissingToCompanionQueue = async () => {
    if (!detail) return;
    setQueueBusy(true);
    try {
      const { added, skipped } = await queueCollectionModsToCompanion(paired, gameDomain, detail, {
        includeOptional,
        includeOutdated: false,
      });
      if (added > 0) {
        onNotify?.(`Added ${added} mod${added === 1 ? "" : "s"} to install queue.`);
        onOpenInstallQueue?.();
      } else {
        onNotify?.(
          skipped > 0
            ? "No new mods added — they may already be queued or missing file info."
            : "Nothing to queue for this collection."
        );
      }
    } catch (e) {
      onNotify?.(e instanceof Error ? e.message : String(e));
    } finally {
      setQueueBusy(false);
    }
  };

  const addOutdatedToCompanionQueue = async () => {
    if (!detail) return;
    setQueueBusy(true);
    try {
      const { added, skipped } = await queueCollectionModsToCompanion(paired, gameDomain, detail, {
        includeOptional,
        includeOutdated: true,
      });
      if (added > 0) {
        onNotify?.(`Added ${added} mod${added === 1 ? "" : "s"} to install queue.`);
        onOpenInstallQueue?.();
      } else {
        onNotify?.(
          skipped > 0
            ? "No new mods added — they may already be queued."
            : "Nothing to queue."
        );
      }
    } catch (e) {
      onNotify?.(e instanceof Error ? e.message : String(e));
    } finally {
      setQueueBusy(false);
    }
  };

  const queueOnDevice = (include_outdated: boolean) => {
    setDeckBusy(true);
    void startCollectionInstall(paired, gameDomain, slug, {
      include_optional: includeOptional,
      include_outdated,
    })
      .then((queued) =>
        onNotify?.(
          `Started ${Array.isArray(queued) ? queued.length : 0} download(s) on your device. Open Queue on the device to install.`
        )
      )
      .finally(() => setDeckBusy(false));
  };

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
            {detail.diff.outdated_count > 0 ? ` · ${detail.diff.outdated_count} outdated` : ""}
            {detail.diff.wrong_file_count > 0 ? ` · ${detail.diff.wrong_file_count} wrong file` : ""}
          </p>

          <div className="cc-panel space-y-2">
            <p className="cc-panel-label">Install queue (on this phone)</p>
            <p className="text-xs text-[var(--cc-muted)]">
              Adds mods here without installing. Open Queue in the header, then start installing one at a time.
            </p>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                className="cc-btn flex-1"
                disabled={queueBusy || detail.diff.missing_count === 0}
                onClick={() => void addMissingToCompanionQueue()}
              >
                {queueBusy ? "Queueing…" : "Queue missing mods"}
              </button>
              {detail.diff.outdated_count + detail.diff.wrong_file_count > 0 && (
                <button
                  type="button"
                  className="cc-btn-secondary flex-1"
                  disabled={queueBusy}
                  onClick={() => void addOutdatedToCompanionQueue()}
                >
                  Queue outdated
                </button>
              )}
            </div>
          </div>

          <div className="cc-panel space-y-2">
            <p className="cc-panel-label">Download on device</p>
            <p className="text-xs text-[var(--cc-muted)]">
              Sends downloads straight to your Deck/PC. Use the device install queue there.
            </p>
            <button
              type="button"
              className="cc-btn-secondary w-full"
              disabled={deckBusy || detail.diff.missing_count === 0}
              onClick={() => queueOnDevice(false)}
            >
              {deckBusy ? "Sending…" : "Download missing on device"}
            </button>
          </div>

          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={includeOptional} onChange={(e) => setIncludeOptional(e.target.checked)} />
            Include optional mods when queueing
          </label>

          <div className="flex flex-wrap gap-2">
            {["all", "missing", "outdated", "wrong_file", "installed"].map((s) => (
              <button
                key={s}
                type="button"
                className={`cc-chip ${statusFilter === s ? "cc-chip-active" : ""}`}
                onClick={() => setStatusFilter(s)}
              >
                {s === "all" ? "All" : STATUS_LABEL[s] ?? s}
              </button>
            ))}
          </div>

          <ul className="space-y-1 text-sm">
            {filtered.map((m) => (
              <CollectionModRow key={m.mod_id} mod={m} onOpenMod={onOpenMod} />
            ))}
          </ul>
        </>
      )}
    </div>
  );
}

function CollectionModRow({
  mod,
  onOpenMod,
}: {
  mod: CollectionModDiffEntry;
  onOpenMod?: (modId: number, name: string) => void;
}) {
  return (
    <li className="flex items-center justify-between gap-2 border-b border-[var(--cc-border-subtle)] py-1.5">
      <button
        type="button"
        className="min-w-0 flex-1 truncate text-left"
        disabled={!onOpenMod}
        onClick={() => onOpenMod?.(mod.mod_id, mod.name)}
      >
        {mod.name}
        {mod.optional ? " (optional)" : ""}
      </button>
      <span className="shrink-0 text-[10px] uppercase text-[var(--cc-muted)]">
        {STATUS_LABEL[mod.status] ?? mod.status}
      </span>
    </li>
  );
}
