import type { FileConflict } from "../types";

export function ConflictPreview({ conflicts }: { conflicts: FileConflict[] }) {
  if (conflicts.length === 0) return null;
  return (
    <div className="cc-panel space-y-2 border-[var(--cc-danger)]/40">
      <p className="text-sm font-semibold text-[var(--cc-danger)]">
        {conflicts.length} potential conflict{conflicts.length === 1 ? "" : "s"}
      </p>
      <ul className="max-h-40 space-y-1 overflow-y-auto text-xs text-[var(--cc-muted)]">
        {conflicts.slice(0, 12).map((c) => (
          <li key={c.path} className="rounded border border-[var(--cc-border-subtle)] px-2 py-1">
            <span className="font-mono text-[var(--cc-text)]">{c.path}</span>
            <span className="block">Already used by {c.existing_mod}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
