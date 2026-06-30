import type { LootPluginIssue } from "../types";
import { AlertIcon } from "./icons";

function severityClass(severity: string): string {
  if (severity === "error") return "cc-issue-error";
  if (severity === "info") return "cc-issue-info";
  return "cc-issue-warn";
}

export function LoadOrderIssuesPanel({
  issues,
  compact = false,
}: {
  issues?: LootPluginIssue[] | null;
  compact?: boolean;
}) {
  const safeIssues = Array.isArray(issues) ? issues : [];
  if (safeIssues.length === 0) return null;
  const errors = safeIssues.filter((i) => i.severity === "error");
  const headline =
    errors.length > 0
      ? `${errors.length} plugin issue${errors.length === 1 ? "" : "s"} need attention`
      : `${safeIssues.length} LOOT notice${safeIssues.length === 1 ? "" : "s"}`;

  return (
    <div className="cc-panel cc-issues-panel">
      <p className="flex items-center gap-2 text-sm font-semibold">
        <AlertIcon className="h-4 w-4 shrink-0 text-[var(--cc-gold)]" />
        {headline}
      </p>
      <ul className={`space-y-2 text-sm ${compact ? "mt-2" : "mt-3"}`}>
        {safeIssues.slice(0, compact ? 3 : 8).map((issue, idx) => (
          <li
            key={`${issue.code}-${issue.plugin ?? idx}`}
            className={`cc-issue-item ${severityClass(issue.severity)}`}
          >
            {issue.plugin && (
              <span className="mr-2 font-mono text-xs opacity-80">{issue.plugin}</span>
            )}
            {issue.message}
          </li>
        ))}
      </ul>
    </div>
  );
}
