import { useMemo } from "react";
import { CheckCircle2, Download, XCircle } from "lucide-react";
import { useDownloadsStore } from "@/stores";
import { Progress } from "@/components/ui/progress";
import { formatBytes } from "@/lib/utils";

export function DownloadBar() {
  const active = useDownloadsStore((s) => s.active);
  const errors = useDownloadsStore((s) => s.errors);

  const downloads = useMemo(
    () =>
      Object.values(active).sort((a, b) => {
        if (a.status === "downloading" && b.status !== "downloading") return -1;
        if (b.status === "downloading" && a.status !== "downloading") return 1;
        return a.file_name.localeCompare(b.file_name);
      }),
    [active]
  );

  if (downloads.length === 0) {
    return null;
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 p-4 md:p-6">
      <div className="pointer-events-auto mx-auto max-w-2xl overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)]/95 shadow-2xl backdrop-blur-md">
        <div className="border-b border-[var(--color-border)] px-4 py-2">
          <div className="flex items-center gap-2 text-sm font-medium text-[var(--color-muted)]">
            <Download className="h-4 w-4" />
            Downloads
          </div>
        </div>
        <div className="max-h-48 space-y-3 overflow-y-auto p-4 scrollbar-thin">
          {downloads.map((d) => {
            const pct =
              d.bytes_total > 0 ? Math.min(100, (d.bytes_done / d.bytes_total) * 100) : null;
            const failed = d.status === "failed" || errors[d.id];
            const complete = d.status === "complete";

            return (
              <div key={d.id} className="rounded-xl bg-[var(--color-secondary)] p-3">
                <div className="mb-2 flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{d.file_name}</p>
                    <p className="text-xs text-[var(--color-muted)]">
                      {failed
                        ? errors[d.id] ?? "Download failed"
                        : complete
                          ? "Complete"
                          : d.bytes_total > 0
                            ? `${formatBytes(d.bytes_done)} / ${formatBytes(d.bytes_total)}`
                            : "Starting download..."}
                    </p>
                  </div>
                  {complete && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-success)]" />
                  )}
                  {failed && (
                    <XCircle className="h-5 w-5 shrink-0 text-[var(--color-danger)]" />
                  )}
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
          })}
        </div>
      </div>
    </div>
  );
}
