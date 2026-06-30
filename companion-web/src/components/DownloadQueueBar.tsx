import { formatBytes } from "../lib/format";
import { Sheet } from "./Sheet";
import type { CompanionDownloadRecord } from "../types";

export function DownloadQueueBar({
  downloads,
  onOpen,
}: {
  downloads: CompanionDownloadRecord[];
  onOpen: () => void;
}) {
  const active = (Array.isArray(downloads) ? downloads : []).filter((d) =>
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
  onCancel,
  onRetry,
  onOpenMod,
}: {
  downloads: CompanionDownloadRecord[];
  open: boolean;
  onClose: () => void;
  onCancel?: (downloadId: string) => void;
  onRetry?: (downloadId: string) => void;
  onOpenMod?: (modId: number, name: string) => void;
}) {
  return (
    <Sheet
      open={open}
      onClose={onClose}
      label="Download queue"
      title="Download queue"
      subtitle="Active downloads on your device."
      footer={
        <button type="button" className="cc-btn-secondary w-full" onClick={onClose}>
          Close
        </button>
      }
    >
      {!Array.isArray(downloads) || downloads.length === 0 ? (
        <p className="text-sm text-[var(--cc-muted)]">No downloads for this game.</p>
      ) : (
        <ul className="space-y-2">
          {downloads.map((d) => (
            <li key={d.id} className="cc-queue-row">
              <button
                type="button"
                className="block w-full truncate text-left font-medium"
                disabled={!onOpenMod || !d.mod_id}
                onClick={() => onOpenMod?.(d.mod_id, d.mod_name || `Mod ${d.mod_id}`)}
              >
                {d.mod_name || `Mod ${d.mod_id}`}
              </button>
              <span className="text-[10px] uppercase text-[var(--cc-muted)]">{d.status}</span>
              <div className="cc-progress cc-progress-sm mt-1">
                <div className="cc-progress-fill" style={{ width: `${d.progress_pct}%` }} />
              </div>
              <div className="mt-2 flex gap-2">
                {["queued", "downloading", "pending"].includes(d.status) && onCancel && (
                  <button type="button" className="cc-btn-ghost text-xs" onClick={() => onCancel(d.id)}>
                    Cancel
                  </button>
                )}
                {d.status === "failed" && onRetry && (
                  <button type="button" className="cc-btn-ghost text-xs" onClick={() => onRetry(d.id)}>
                    Retry
                  </button>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Sheet>
  );
}
