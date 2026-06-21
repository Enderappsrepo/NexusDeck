import { Package } from "lucide-react";
import { useInstallQueueStore } from "@/stores/installQueueStore";

export function InstallQueuePanel() {
  const jobs = useInstallQueueStore((s) => s.jobs);
  const activeJob = useInstallQueueStore((s) => s.getActiveJob());
  const profileError = useInstallQueueStore((s) => s.profileError);
  const failedJobs = jobs.filter((j) => j.status === "failed");

  const pending = jobs.filter((j) => j.status === "queued" || j.status === "active");
  if (pending.length === 0 && failedJobs.length === 0 && !profileError) return null;

  const activeIndex = activeJob
    ? pending.findIndex((j) => j.id === activeJob.id) + 1
    : 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6"
      data-install-queue-panel
    >
      <div className="pointer-events-auto mx-auto flex max-w-2xl items-center gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/95 px-4 py-3 shadow-lg backdrop-blur-md">
        <Package className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {profileError
              ? profileError
              : activeJob
                ? `Installing: ${activeJob.modName}`
                : failedJobs.length > 0
                  ? `Install failed: ${failedJobs[0]?.modName ?? "Mod"}`
                  : "Install queue"}
          </p>
          <p className="text-xs text-[var(--color-muted)]">
            {activeIndex > 0
              ? `${activeIndex} of ${pending.length} in queue`
              : `${pending.length} waiting`}
          </p>
        </div>
      </div>
    </div>
  );
}
