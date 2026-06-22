import { CheckCircle2, Loader2, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useCollectionInstallStore } from "@/stores/collectionInstallStore";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  pending: Loader2,
  downloading: Loader2,
  installing: Loader2,
  done: CheckCircle2,
  failed: XCircle,
} as const;

export function CollectionInstallProgressPanel() {
  const active = useCollectionInstallStore((s) => s.active);
  const dismiss = useCollectionInstallStore((s) => s.dismiss);
  const doneCount = useCollectionInstallStore((s) => s.doneCount());
  const totalCount = useCollectionInstallStore((s) => s.totalCount());

  if (!active) return null;

  const allDone = doneCount === totalCount && totalCount > 0;
  const failed = active.mods.some((m) => m.status === "failed");
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6"
      data-collection-install-panel
    >
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-xl border border-[var(--color-border)] bg-[var(--color-card)]/95 shadow-lg backdrop-blur-md">
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{active.name}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {allDone
                ? failed
                  ? "Finished with errors"
                  : "All mods installed"
                : `${doneCount} of ${totalCount} mods complete`}
            </p>
            <Progress value={pct} className="mt-2 h-1.5" />
          </div>
          {(allDone || failed) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={dismiss}
              aria-label="Dismiss"
              data-focusable="true"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <ul
          className="max-h-40 space-y-1 overflow-y-auto px-4 py-2 text-sm scrollbar-thin"
          data-scroll-pane
        >
          {active.mods.map((mod) => {
            const Icon = STATUS_ICON[mod.status];
            const spinning =
              mod.status === "pending" ||
              mod.status === "downloading" ||
              mod.status === "installing";
            return (
              <li key={mod.modId} className="flex items-center gap-2 py-1">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    mod.status === "done" && "text-[var(--color-success)]",
                    mod.status === "failed" && "text-[var(--color-danger)]",
                    spinning && "animate-spin text-[var(--color-primary)]"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{mod.name}</span>
                <span className="shrink-0 text-xs capitalize text-[var(--color-muted)]">
                  {mod.status === "downloading"
                    ? "Downloading"
                    : mod.status === "installing"
                      ? "Installing"
                      : mod.status}
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
