import { InstallQueueContent, useInstallQueueBadgeCount } from "@/components/install/InstallQueueContent";
import { useInstallQueueStore } from "@/stores/installQueueStore";

export function InstallQueuePanel() {
  const count = useInstallQueueBadgeCount();
  const profileError = useInstallQueueStore((s) => s.profileError);
  const processing = useInstallQueueStore((s) => s.processing);

  if (count === 0 && !profileError && !processing) {
    return null;
  }

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[55] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6"
      data-install-queue-panel
    >
      <div className="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/95 p-4 shadow-2xl backdrop-blur-md">
        <InstallQueueContent />
      </div>
    </div>
  );
}
