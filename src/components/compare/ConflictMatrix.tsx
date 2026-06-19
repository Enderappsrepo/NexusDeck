import type { OverlapEntry } from "@/lib/nexus/types";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

interface ConflictMatrixProps {
  entries: OverlapEntry[];
}

const severityVariant: Record<string, "warning" | "muted" | "default"> = {
  plugin_conflict: "warning",
  texture_overlap: "warning",
  file_overlap: "muted",
};

export function ConflictMatrix({ entries }: ConflictMatrixProps) {
  if (entries.length === 0) {
    return (
      <p className="rounded-xl bg-[var(--color-secondary)] p-4 text-[var(--color-muted)]">
        No overlapping paths found.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-[var(--color-border)]">
      <table className="w-full text-left text-sm">
        <thead className="border-b border-[var(--color-border)] bg-[var(--color-secondary)]">
          <tr>
            <th className="p-3 font-medium">Path</th>
            <th className="p-3 font-medium">Severity</th>
            <th className="p-3 font-medium">Plugin</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr
              key={entry.path}
              className={cn(
                "border-b border-[var(--color-border)]/50",
                entry.is_plugin && "bg-[var(--color-danger)]/5"
              )}
            >
              <td className="max-w-md truncate p-3 font-mono text-xs">{entry.path}</td>
              <td className="p-3">
                <Badge variant={severityVariant[entry.severity] ?? "muted"}>
                  {entry.severity.replace(/_/g, " ")}
                </Badge>
              </td>
              <td className="p-3">{entry.is_plugin ? "Yes" : "No"}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
