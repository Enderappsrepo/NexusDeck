import { Download } from "lucide-react";
import { useMemo } from "react";
import { useDownloadsStore } from "@/stores";
import { Button } from "@/components/ui/button";
import { DownloadQueueItem } from "./DownloadQueueItem";

export function DownloadQueuePanel() {
  const active = useDownloadsStore((s) => s.active);
  const errors = useDownloadsStore((s) => s.errors);
  const cancel = useDownloadsStore((s) => s.cancel);
  const retry = useDownloadsStore((s) => s.retry);
  const dismiss = useDownloadsStore((s) => s.dismiss);
  const clearCompleted = useDownloadsStore((s) => s.clearCompleted);
  const clearFailed = useDownloadsStore((s) => s.clearFailed);

  const downloads = useMemo(
    () =>
      Object.values(active).sort((a, b) => {
        if (a.status === "downloading" && b.status !== "downloading") return -1;
        if (b.status === "downloading" && a.status !== "downloading") return 1;
        return a.file_name.localeCompare(b.file_name);
      }),
    [active]
  );

  const hasCompleted = downloads.some((d) => d.status === "complete");
  const hasFailed = downloads.some(
    (d) => d.status === "failed" || d.status === "cancelled" || errors[d.id]
  );

  if (downloads.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] md:p-6 md:pb-[calc(1.5rem+env(safe-area-inset-bottom))] [[data-controller=true]_&]:bottom-12"
      data-download-queue-panel
    >
      <div className="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <Download className="h-4 w-4 text-[var(--color-primary)]" />
            Downloads ({downloads.length})
          </div>
          <div className="flex items-center gap-2">
            {hasFailed && (
              <Button
                variant="ghost"
                size="sm"
                className="focusable"
                data-focusable="true"
                onClick={() => clearFailed()}
              >
                Clear failed
              </Button>
            )}
            {hasCompleted && (
              <Button
                variant="ghost"
                size="sm"
                className="focusable"
                data-focusable="true"
                onClick={() => clearCompleted()}
              >
                Clear completed
              </Button>
            )}
          </div>
        </div>
        <div className="max-h-64 space-y-3 overflow-y-auto p-4 scrollbar-thin" data-scroll-pane>
          {downloads.map((d) => (
            <DownloadQueueItem
              key={d.id}
              download={d}
              error={errors[d.id]}
              onCancel={() => cancel(d.id)}
              onRetry={() => retry(d.id)}
              onDismiss={() => dismiss(d.id)}
              onInstall={
                d.status === "complete" && !d.update_target_mod_id
                  ? () =>
                      window.dispatchEvent(
                        new CustomEvent("nexusdeck-install-download", {
                          detail: { downloadId: d.id, front: true },
                        })
                      )
                  : undefined
              }
            />
          ))}
        </div>
      </div>
    </div>
  );
}
