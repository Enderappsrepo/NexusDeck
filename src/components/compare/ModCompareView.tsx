import type { ModCompareResult } from "@/lib/nexus/types";
import { ConflictMatrix } from "./ConflictMatrix";
import { formatNumber } from "@/lib/utils";

interface ModCompareViewProps {
  result: ModCompareResult;
}

export function ModCompareView({ result }: ModCompareViewProps) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2">
        <SideCard side={result.mod_a} unique={result.unique_to_a} label="A" />
        <SideCard side={result.mod_b} unique={result.unique_to_b} label="B" />
      </div>

      <div>
        <h3 className="mb-3 text-lg font-semibold">
          Overlapping paths ({result.overlapping_paths.length})
        </h3>
        <ConflictMatrix entries={result.overlapping_paths} />
      </div>

      {result.conflicts_with_installed.length > 0 && (
        <div>
          <h3 className="mb-3 text-lg font-semibold">
            Conflicts with installed mods ({result.conflicts_with_installed.length})
          </h3>
          <div className="max-h-64 space-y-2 overflow-y-auto rounded-xl bg-[var(--color-secondary)] p-4 scrollbar-thin" data-scroll-pane>
            {result.conflicts_with_installed.map((c) => (
              <div key={c.path} className="text-sm">
                <span className="font-mono text-[var(--color-warning)]">{c.path}</span>
                <span className="text-[var(--color-muted)]">
                  {" "}
                  — {c.existing_mod} vs {c.new_mod}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function SideCard({
  side,
  unique,
  label,
}: {
  side: ModCompareResult["mod_a"];
  unique: number;
  label: string;
}) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-4">
      <p className="text-sm text-[var(--color-muted)]">Mod {label}</p>
      <h4 className="text-xl font-bold">{side.name}</h4>
      <p className="text-sm text-[var(--color-muted)]">Source: {side.source}</p>
      <div className="mt-3 flex gap-4 text-sm">
        <span>{formatNumber(side.file_count)} files</span>
        <span>{formatNumber(side.plugin_count)} plugins</span>
        <span>{formatNumber(unique)} unique</span>
      </div>
    </div>
  );
}
