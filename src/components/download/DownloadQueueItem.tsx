import { CheckCircle2, RotateCcw, X, XCircle } from "lucide-react";
import type { DownloadProgress } from "@/lib/nexus/types";
import { Progress } from "@/components/ui/progress";
import { Button } from "@/components/ui/button";
import { formatBytes } from "@/lib/utils";

interface DownloadQueueItemProps {
  download: DownloadProgress;
  error?: string;
  onCancel: () => void;
  onRetry: () => void;
  onDismiss: () => void;
}

export function DownloadQueueItem({
  download,
  error,
  onCancel,
  onRetry,
  onDismiss,
}: DownloadQueueItemProps) {
  const pct =
    download.bytes_total > 0
      ? Math.min(100, (download.bytes_done / download.bytes_total) * 100)
      : null;
  const failed = download.status === "failed" || !!error;
  const complete = download.status === "complete";
  const active =
    download.status === "downloading" ||
    download.status === "queued" ||
    download.status === "pending";

  return (
    <div className="rounded-xl bg-[var(--color-secondary)] p-3">
      <div className="mb-2 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {download.mod_name || download.file_name}
          </p>
          <p className="truncate text-xs text-[var(--color-muted)]">
            {download.file_name}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {failed
              ? error ?? "Download failed"
              : complete
                ? "Complete"
                : download.bytes_total > 0
                  ? `${formatBytes(download.bytes_done)} / ${formatBytes(download.bytes_total)}`
                  : "Starting download..."}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          {complete && (
            <CheckCircle2 className="h-5 w-5 text-[var(--color-success)]" />
          )}
          {failed && (
            <>
              <XCircle className="h-5 w-5 text-[var(--color-danger)]" />
              <Button
                variant="ghost"
                size="icon"
                className="focusable min-h-[44px] min-w-[44px]"
                data-focusable="true"
                onClick={onRetry}
                aria-label="Retry download"
              >
                <RotateCcw className="h-4 w-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="focusable min-h-[44px] min-w-[44px]"
                data-focusable="true"
                onClick={onDismiss}
                aria-label="Remove failed download"
              >
                <X className="h-4 w-4" />
              </Button>
            </>
          )}
          {active && !complete && (
            <Button
              variant="ghost"
              size="icon"
              className="focusable min-h-[44px] min-w-[44px]"
              data-focusable="true"
              onClick={onCancel}
              aria-label="Cancel download"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
      {failed ? (
        <div className="h-1.5 rounded-full bg-[var(--color-danger)]/30" />
      ) : complete ? (
        <Progress value={100} />
      ) : pct !== null ? (
        <Progress value={pct} />
      ) : (
        <div className="relative h-3 overflow-hidden rounded-full bg-[var(--color-border)]">
          <div className="absolute inset-y-0 w-1/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
        </div>
      )}
    </div>
  );
}
