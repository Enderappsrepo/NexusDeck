import { AlertTriangle, Loader2, Package, RotateCcw, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { useInstallQueueStore, type InstallJob } from "@/stores/installQueueStore";

function InstallQueueItem({
  job,
  index,
  total,
  onRemove,
  onRetry,
}: {
  job: InstallJob;
  index: number;
  total: number;
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
              : `${index} of ${total} in queue`}
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

export function InstallQueuePanel() {
  const jobs = useInstallQueueStore((s) => s.jobs);
  const profileError = useInstallQueueStore((s) => s.profileError);
  const profileErrorDomain = useInstallQueueStore((s) => s.profileErrorDomain);
  const clearProfileError = useInstallQueueStore((s) => s.clearProfileError);
  const retryJob = useInstallQueueStore((s) => s.retryJob);
  const removeJob = useInstallQueueStore((s) => s.removeJob);
  const clearFailedJobs = useInstallQueueStore((s) => s.clearFailedJobs);
  const clearDoneJobs = useInstallQueueStore((s) => s.clearDoneJobs);

  // The active job is always shown in the ModInstallDialog, so don't duplicate it
  // here — this panel lists only jobs still waiting their turn. (Showing the
  // active job floated this z-[55] panel over the dialog footer and said
  // "Installing now…" while the user was still configuring it.)
  const pending = jobs.filter((j) => j.status === "queued");
  const failedJobs = jobs.filter((j) => j.status === "failed");
  const doneJobs = jobs.filter((j) => j.status === "done");

  if (
    pending.length === 0 &&
    failedJobs.length === 0 &&
    doneJobs.length === 0 &&
    !profileError
  ) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6"
      data-install-queue-panel
    >
      <div className="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/95 shadow-2xl backdrop-blur-md">
        <div className="flex items-center justify-between border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <Package className="h-4 w-4 text-[var(--color-primary)]" />
            {profileError ? (
              <>
                <AlertTriangle className="h-4 w-4 text-[var(--color-warning)]" />
                Install blocked
              </>
            ) : (
              <>Installs ({pending.length + failedJobs.length})</>
            )}
          </div>
          <div className="flex items-center gap-2">
            {failedJobs.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={clearFailedJobs}
                data-focusable="true"
              >
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

        <div className="max-h-64 space-y-2 overflow-y-auto p-4 scrollbar-thin" data-scroll-pane>
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
                    <Button size="sm" variant="primary" data-focusable="true">
                      Set up game
                    </Button>
                  </Link>
                )}
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={clearProfileError}
                  data-focusable="true"
                >
                  Dismiss
                </Button>
              </div>
            </div>
          )}

          {pending.map((job, idx) => (
            <InstallQueueItem
              key={job.id}
              job={job}
              index={idx + 1}
              total={pending.length}
              onRemove={() => removeJob(job.id)}
            />
          ))}

          {failedJobs.map((job, idx) => (
            <InstallQueueItem
              key={job.id}
              job={job}
              index={idx + 1}
              total={failedJobs.length}
              onRemove={() => removeJob(job.id)}
              onRetry={() => retryJob(job.id)}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
