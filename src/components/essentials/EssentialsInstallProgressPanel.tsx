import { useEffect, useRef } from "react";
import { CheckCircle2, Loader2, RefreshCw, X, XCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/commands";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { useEssentialsInstallStore } from "@/stores/essentialsInstallStore";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  pending: Loader2,
  setup: Loader2,
  downloading: Loader2,
  installing: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  skipped: CheckCircle2,
} as const;

export function EssentialsInstallProgressPanel() {
  const active = useEssentialsInstallStore((s) => s.active);
  const dismiss = useEssentialsInstallStore((s) => s.dismiss);
  const markPostBatchDone = useEssentialsInstallStore((s) => s.markPostBatchDone);
  const doneCount = useEssentialsInstallStore((s) => s.doneCount());
  const totalCount = useEssentialsInstallStore((s) => s.totalCount());
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);
  const finishAttempted = useRef(false);

  useEffect(() => {
    if (!active || finishAttempted.current) return;
    const modsDone = active.mods.every(
      (m) => m.status === "done" || m.status === "failed" || m.status === "skipped"
    );
    if (!modsDone || !active.setupDone || active.postBatchDone) return;

    finishAttempted.current = true;
    void api
      .finishGameEssentials(active.profile.id)
      .then(() => markPostBatchDone())
      .catch(() => markPostBatchDone());
  }, [active, markPostBatchDone]);

  if (!active) return null;

  const allDone = doneCount >= totalCount && totalCount > 0;
  const failed = active.mods.some((m) => m.status === "failed");
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const retryMod = async (essentialId: string) => {
    try {
      const queued = await api.queueGameEssentialMods(active.profile.id, [essentialId]);
      for (const item of queued) {
        registerPendingInstall(item.download.id, {
          source: "essentials",
          modId: item.download.mod_id,
          modName: item.download.mod_name,
        });
        useEssentialsInstallStore.getState().bindDownload(essentialId, item.download.id);
        setProgress(item.download);
      }
    } catch {
      /* ignore */
    }
  };

  const rows = [
    {
      key: "setup",
      label: "Setup fixes (Proton, script extender, plugins)",
      status: active.setupDone ? ("done" as const) : active.mods.some((m) => m.status !== "pending") ? ("setup" as const) : ("pending" as const),
    },
    ...active.mods.map((m) => ({
      key: m.id,
      label: m.name,
      status: m.status,
      error: m.error,
    })),
    {
      key: "post",
      label: "Configure (LOOT, BodySlide paths, plugins)",
      status: active.postBatchDone
        ? ("done" as const)
        : active.mods.every((m) => m.status === "done" || m.status === "skipped") && active.setupDone
          ? ("installing" as const)
          : ("pending" as const),
    },
  ];

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[56] p-4 pb-[calc(5.5rem+env(safe-area-inset-bottom))] md:p-6"
      data-essentials-install-panel
    >
      <div className="pointer-events-auto mx-auto max-w-2xl rounded-xl border border-[var(--color-primary)]/30 bg-[var(--color-card)]/95 shadow-lg backdrop-blur-md">
        <div className="flex items-start gap-3 border-b border-[var(--color-border)] px-4 py-3">
          <div className="min-w-0 flex-1">
            <p className="truncate font-medium">{active.name}</p>
            <p className="text-xs text-[var(--color-muted)]">
              {allDone
                ? failed
                  ? "Finished with errors"
                  : "Essentials complete"
                : `${doneCount} of ${totalCount} steps complete`}
            </p>
            <Progress value={pct} className="mt-2 h-1.5" />
          </div>
          {(allDone || failed) && (
            <Button
              variant="ghost"
              size="icon"
              onClick={() => {
                finishAttempted.current = false;
                dismiss();
              }}
              aria-label="Dismiss"
              data-focusable="true"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>

        <ul className="max-h-52 space-y-1 overflow-y-auto px-4 py-2 text-sm scrollbar-thin" data-scroll-pane>
          {rows.map((row) => {
            const Icon = STATUS_ICON[row.status];
            const spinning =
              row.status === "pending" ||
              row.status === "setup" ||
              row.status === "downloading" ||
              row.status === "installing";
            return (
              <li key={row.key} className="flex items-center gap-2 py-1">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    (row.status === "done" || row.status === "skipped") &&
                      "text-[var(--color-success)]",
                    row.status === "failed" && "text-[var(--color-danger)]",
                    spinning && "animate-spin text-[var(--color-primary)]"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{row.label}</span>
                {row.status === "failed" && row.key !== "setup" && row.key !== "post" && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => void retryMod(row.key)}
                    data-focusable="true"
                  >
                    <RefreshCw className="h-3.5 w-3.5" />
                    Retry
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
