import { formatBytes } from "../lib/format";
import type { CompanionDownloadRecord } from "../types";

export function DownloadQueueBar({
  downloads,
  onOpen,
}: {
  downloads: CompanionDownloadRecord[];
  onOpen: () => void;
}) {
  const active = downloads.filter((d) =>
    ["queued", "downloading", "pending"].includes(d.status)
  );
  if (active.length === 0) return null;
  const primary = active[0]!;
  return (
    <button type="button" className="cc-queue-bar" onClick={onOpen}>
      <span className="cc-queue-label">
        {active.length} download{active.length === 1 ? "" : "s"} · {primary.mod_name || "Mod"}
      </span>
      <div className="cc-progress cc-progress-sm">
        <div className="cc-progress-fill" style={{ width: `${primary.progress_pct}%` }} />
      </div>
      <span className="cc-queue-meta">
        {formatBytes(primary.bytes_done)} / {formatBytes(primary.bytes_total)}
      </span>
    </button>
  );
}

export function DownloadQueueSheet({
  downloads,
  open,
  onClose,
}: {
  downloads: CompanionDownloadRecord[];
  open: boolean;
  onClose: () => void;
}) {
  if (!open) return null;
  return (
    <div className="cc-sheet-backdrop" onClick={onClose}>
      <div className="cc-sheet" onClick={(e) => e.stopPropagation()}>
        <p className="cc-section-label">Download queue</p>
        {downloads.length === 0 ? (
          <p className="text-sm text-[var(--cc-muted)]">No downloads for this game.</p>
        ) : (
          <ul className="space-y-2">
            {downloads.map((d) => (
              <li key={d.id} className="cc-queue-row">
                <span className="block truncate font-medium">{d.mod_name || `Mod ${d.mod_id}`}</span>
                <span className="text-[10px] uppercase text-[var(--cc-muted)]">{d.status}</span>
                <div className="cc-progress cc-progress-sm mt-1">
                  <div className="cc-progress-fill" style={{ width: `${d.progress_pct}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
        <button type="button" className="cc-btn-secondary mt-4 w-full" onClick={onClose}>
          Close
        </button>
      </div>
    </div>
  );
}
