import { AlertTriangle, Loader2, Package, Play, RotateCcw, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useInstallQueueStore, type InstallJob } from "@/stores/installQueueStore";

function InstallQueueItem({
  job,
  index,
  total,
  processing,
  onRemove,
  onRetry,
}: {
  job: InstallJob;
  index: number;
  total: number;
  processing: boolean;
  onRemove: () => void;
  onRetry?: () => void;
}) {
  const isActive = job.status === "active";

  return (
    <div className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 px-3 py-2">
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium">{job.modName}</p>
        <p className="truncate text-xs text-[var(--color-muted)]">
          {isActive
            ? "Installing now…"
            : job.status === "failed"
              ? job.error ?? "Install failed"
              : processing
                ? `${index} of ${total} in queue`
                : "Waiting to install"}
        </p>
      </div>
      {isActive ? (
        <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
      ) : job.status === "failed" ? (
        <div className="flex shrink-0 items-center gap-1">
          {onRetry && (
            <Button
              size="sm"
              variant="ghost"
              onClick={onRetry}
              aria-label="Retry install"
              data-focusable="true"
            >
              <RotateCcw className="h-4 w-4" />
            </Button>
          )}
          <Button
            size="sm"
            variant="ghost"
            onClick={onRemove}
            aria-label="Remove failed install"
            data-focusable="true"
          >
            <X className="h-4 w-4" />
          </Button>
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          onClick={onRemove}
          aria-label="Remove from queue"
          data-focusable="true"
        >
          <X className="h-4 w-4" />
        </Button>
      )}
    </div>
  );
}

export function InstallQueueContent({ emptyMessage }: { emptyMessage?: string }) {
  const jobs = useInstallQueueStore((s) => s.jobs);
  const processing = useInstallQueueStore((s) => s.processing);
  const startProcessing = useInstallQueueStore((s) => s.startProcessing);
  const profileError = useInstallQueueStore((s) => s.profileError);
  const profileErrorDomain = useInstallQueueStore((s) => s.profileErrorDomain);
  const clearProfileError = useInstallQueueStore((s) => s.clearProfileError);
  const retryJob = useInstallQueueStore((s) => s.retryJob);
  const removeJob = useInstallQueueStore((s) => s.removeJob);
  const clearFailedJobs = useInstallQueueStore((s) => s.clearFailedJobs);
  const clearDoneJobs = useInstallQueueStore((s) => s.clearDoneJobs);
  const pendingByDownloadId = useInstallQueueStore((s) => s.pendingByDownloadId);

  const pending = jobs.filter((j) => j.status === "queued");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const doneJobs = jobs.filter((j) => j.status === "done");
  const waitingDownloads = Object.values(pendingByDownloadId);
  const waitingCount = pending.length + waitingDownloads.length;

  if (
    pending.length === 0 &&
    failedJobs.length === 0 &&
    doneJobs.length === 0 &&
    waitingDownloads.length === 0 &&
    !profileError
  ) {
    return (
      <p className="py-6 text-center text-sm text-[var(--color-muted)]">
        {emptyMessage ?? "No mods in the install queue. Queue mods from a mod's detail page."}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
          <Package className="h-4 w-4 text-[var(--color-primary)]" />
          {profileError ? (
            <>
              <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
              Install blocked
            </>
          ) : processing ? (
            <>Installing ({pending.length} remaining)</>
          ) : (
            <>{waitingCount} waiting to install</>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!processing && pending.length > 0 && (
            <Button size="sm" onClick={startProcessing} data-focusable="true">
              <Play className="h-4 w-4" />
              Start installing
            </Button>
          )}
          {failedJobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearFailedJobs} data-focusable="true">
              Clear failed
            </Button>
          )}
          {doneJobs.length > 0 && (
            <Button variant="ghost" size="sm" onClick={clearDoneJobs} data-focusable="true">
              Clear done
            </Button>
          )}
        </div>
      </div>

      <div className="max-h-72 space-y-2 overflow-y-auto scrollbar-thin" data-scroll-pane>
        {profileError && (
          <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3">
            <p className="text-sm font-medium">{profileError}</p>
            <p className="mt-1 text-xs text-[var(--color-muted)]">
              Auto-install needs a game profile before it can continue.
            </p>
            <div className="mt-3 flex gap-2">
              {profileErrorDomain && (
                <Link
                  to="/games/$domain/setup"
                  params={{ domain: profileErrorDomain }}
                  data-focusable="true"
                >
                  <Button size="sm" data-focusable="true">
                    Set up game
                  </Button>
                </Link>
              )}
              <Button size="sm" variant="ghost" onClick={clearProfileError} data-focusable="true">
                Dismiss
              </Button>
            </div>
          </div>
        )}

        {waitingDownloads.map((meta, idx) => (
          <div
            key={`dl-${meta.modId ?? idx}-${idx}`}
            className="flex items-center gap-3 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-3 py-2"
          >
            <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-muted)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{meta.modName ?? "Mod"}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">Downloading…</p>
            </div>
          </div>
        ))}

        {pending.map((job, idx) => (
          <InstallQueueItem
            key={job.id}
            job={job}
            index={idx + 1}
            total={pending.length}
            processing={processing}
            onRemove={() => removeJob(job.id)}
          />
        ))}

        {failedJobs.map((job, idx) => (
          <InstallQueueItem
            key={job.id}
            job={job}
            index={idx + 1}
            total={failedJobs.length}
            processing={processing}
            onRemove={() => removeJob(job.id)}
            onRetry={() => retryJob(job.id)}
          />
        ))}

        {doneJobs.map((job) => (
          <div
            key={job.id}
            className="flex items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-3 py-2 opacity-70"
          >
            <div className="min-w-0 flex-1">
              <p className="truncate text-sm font-medium">{job.modName}</p>
              <p className="truncate text-xs text-[var(--color-muted)]">Installed</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

export function useInstallQueueBadgeCount() {
  const jobs = useInstallQueueStore((s) => s.jobs);
  const pendingByDownloadId = useInstallQueueStore((s) => s.pendingByDownloadId);
  const pendingJobs = jobs.filter((j) => j.status === "queued" || j.status === "failed").length;
  const waitingDownloads = Object.keys(pendingByDownloadId).length;
  return pendingJobs + waitingDownloads;
}
