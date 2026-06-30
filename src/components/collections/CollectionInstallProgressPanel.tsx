import { useState } from "react";
import { CheckCircle2, Clock, Loader2, Play, RefreshCw, X, XCircle } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/commands";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { useCollectionInstallStore } from "@/stores/collectionInstallStore";
import { modFileDownloadName } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

const STATUS_ICON = {
  pending: Loader2,
  downloading: Loader2,
  ready: Clock,
  installing: Loader2,
  done: CheckCircle2,
  failed: XCircle,
  skipped: CheckCircle2,
} as const;

export function CollectionInstallProgressPanel() {
  const active = useCollectionInstallStore((s) => s.active);
  const dismiss = useCollectionInstallStore((s) => s.dismiss);
  const bindDownload = useCollectionInstallStore((s) => s.bindDownload);
  const doneCount = useCollectionInstallStore((s) =>
    s.active ? s.active.mods.filter((m) => m.status === "done" || m.status === "skipped").length : 0
  );
  const totalCount = useCollectionInstallStore((s) => s.active?.mods.length ?? 0);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);
  const processing = useInstallQueueStore((s) => s.processing);
  const startProcessing = useInstallQueueStore((s) => s.startProcessing);
  const [retryingId, setRetryingId] = useState<number | null>(null);

  if (!active) return null;

  const allDone = doneCount === totalCount && totalCount > 0;
  const failed = active.mods.some((m) => m.status === "failed");
  const readyCount = active.mods.filter((m) => m.status === "ready").length;
  const canStartInstall = !processing && readyCount > 0;
  const pct = totalCount > 0 ? Math.round((doneCount / totalCount) * 100) : 0;

  const retryMod = async (modId: number) => {
    const mod = active.mods.find((m) => m.modId === modId);
    if (!mod?.fileId) return;
    setRetryingId(modId);
    try {
      const files = await api.getModFiles(active.gameDomain, modId);
      const file = files.find((f) => f.file_id === mod.fileId) ?? files[0];
      if (!file) return;
      const progress = await api.startModDownload({
        gameDomain: active.gameDomain,
        modId,
        fileId: file.file_id,
        fileName: modFileDownloadName(file),
        stagingPath: active.profile.staging_path,
        expectedSizeKb: file.size_kb,
        modName: mod.name,
        profileId: active.profile.id,
      });
      registerPendingInstall(progress.id, {
        source: "collection",
        collectionSlug: active.slug,
        collectionName: active.name,
        modId,
        modName: mod.name,
      });
      bindDownload(modId, progress.id);
      setProgress(progress);
    } finally {
      setRetryingId(null);
    }
  };

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
                : canStartInstall
                  ? `${readyCount} ready to install · ${doneCount} of ${totalCount} complete`
                  : processing
                    ? `Installing · ${doneCount} of ${totalCount} complete`
                    : `${doneCount} of ${totalCount} mods complete`}
            </p>
            <Progress value={pct} className="mt-2 h-1.5" />
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {canStartInstall && (
              <Button size="sm" onClick={startProcessing} data-focusable="true">
                <Play className="h-4 w-4" />
                Start installing
              </Button>
            )}
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
        </div>

        <ul
          className="max-h-48 space-y-1 overflow-y-auto px-4 py-2 text-sm scrollbar-thin"
          data-scroll-pane
        >
          {active.mods.map((mod) => {
            const Icon = STATUS_ICON[mod.status];
            const spinning =
              mod.status === "pending" ||
              mod.status === "downloading" ||
              mod.status === "installing";
            return (
              <li key={`${mod.modId}-${mod.fileId ?? "x"}`} className="flex items-center gap-2 py-1">
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    (mod.status === "done" || mod.status === "skipped") &&
                      "text-[var(--color-success)]",
                    mod.status === "failed" && "text-[var(--color-danger)]",
                    spinning && "animate-spin text-[var(--color-primary)]"
                  )}
                />
                <span className="min-w-0 flex-1 truncate">{mod.name}</span>
                <div className="flex shrink-0 items-center gap-1">
                  {mod.status === "failed" && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={retryingId === mod.modId}
                        onClick={() => void retryMod(mod.modId)}
                        data-focusable="true"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                        Retry
                      </Button>
                      <Button variant="ghost" size="sm" asChild data-focusable="true">
                        <Link
                          to="/games/$domain/mods/$modId"
                          params={{ domain: active.gameDomain, modId: String(mod.modId) }}
                        >
                          View
                        </Link>
                      </Button>
                    </>
                  )}
                  <span className="text-xs capitalize text-[var(--color-muted)]">
                    {mod.status === "downloading"
                      ? "Downloading"
                      : mod.status === "installing"
                        ? "Installing"
                        : mod.status === "ready"
                          ? "Ready"
                          : mod.status}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </div>
  );
}
