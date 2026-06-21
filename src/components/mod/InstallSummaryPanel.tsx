import { AlertTriangle, CheckCircle2, Package } from "lucide-react";
import type { InstallPreview } from "@/lib/nexus/types";

interface InstallSummaryPanelProps {
  preview: InstallPreview | null;
  gamePath: string;
  loading?: boolean;
  className?: string;
}

function displayPath(fullPath: string, gamePath: string) {
  const normalizedGame = gamePath.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = fullPath.replace(/\\/g, "/");
  if (normalizedPath.startsWith(`${normalizedGame}/`)) {
    return normalizedPath.slice(normalizedGame.length + 1);
  }
  return fullPath;
}

export function InstallSummaryPanel({
  preview,
  gamePath,
  loading = false,
  className = "",
}: InstallSummaryPanelProps) {
  if (!preview) {
    return (
      <aside
        className={`rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-4 ${className}`}
      >
        <p className="text-sm text-[var(--color-muted)]">
          {loading ? "Analyzing install…" : "Summary updates as you choose options."}
        </p>
      </aside>
    );
  }

  const pluginCount = preview.deploy_files.filter((p) =>
    p.toLowerCase().endsWith(".esp") || p.toLowerCase().endsWith(".esm") || p.toLowerCase().endsWith(".esl")
  ).length;

  return (
    <aside
      className={`space-y-4 rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/30 p-4 ${className}`}
      data-install-summary
    >
      <div>
        <p className="text-xs font-medium uppercase tracking-wide text-[var(--color-muted)]">
          Live summary
        </p>
        <p className="mt-1 text-sm text-[var(--color-muted)]">{preview.plan.description}</p>
      </div>

      {preview.file_count === 0 && preview.skipped_existing === 0 && (
        <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3 text-sm text-[var(--color-warning)]">
          No files matched your selections. Try different options or check the install log.
        </div>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
          <p className="text-xs text-[var(--color-muted)]">Files</p>
          <p className="text-xl font-semibold">{preview.file_count.toLocaleString()}</p>
        </div>
        <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
          <p className="text-xs text-[var(--color-muted)]">Plugins</p>
          <p className="text-xl font-semibold">{pluginCount}</p>
        </div>
      </div>

      <div className="rounded-lg border border-[var(--color-border)] bg-[var(--color-card)] p-3">
        <div className="mb-1 flex items-center gap-2 text-sm">
          <Package className="h-4 w-4" />
          <span className="font-medium">Destination</span>
        </div>
        <p className="truncate font-mono text-xs text-[var(--color-muted)]">
          {displayPath(preview.plan.target, gamePath)}
        </p>
      </div>

      {preview.conflicts.length > 0 ? (
        <div className="rounded-lg border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-3">
          <div className="flex items-center gap-2 text-sm text-[var(--color-warning)]">
            <AlertTriangle className="h-4 w-4" />
            <span className="font-medium">{preview.conflicts.length} conflicts</span>
          </div>
          <div className="mt-2 max-h-24 space-y-1 overflow-auto text-xs text-[var(--color-muted)] scrollbar-thin">
            {preview.conflicts.slice(0, 5).map((c) => (
              <p key={c.path} className="truncate font-mono">
                {c.path}
              </p>
            ))}
          </div>
        </div>
      ) : (
        <div className="flex items-center gap-2 rounded-lg border border-[var(--color-success)]/30 bg-[var(--color-success)]/10 p-3 text-sm text-[var(--color-success)]">
          <CheckCircle2 className="h-4 w-4" />
          No file conflicts detected
        </div>
      )}
    </aside>
  );
}
