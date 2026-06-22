import { Link } from "@tanstack/react-router";
import { AlertTriangle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import type { LootPluginIssue } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

interface LoadOrderIssuesPanelProps {
  issues: LootPluginIssue[];
  gameDomain: string;
  compact?: boolean;
  className?: string;
}

function severityClass(severity: string): string {
  if (severity === "error") {
    return "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10";
  }
  if (severity === "info") {
    return "border-[var(--color-border)] bg-[var(--color-secondary)]/30";
  }
  return "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10";
}

export function LoadOrderIssuesPanel({
  issues,
  gameDomain,
  compact = false,
  className,
}: LoadOrderIssuesPanelProps) {
  if (issues.length === 0) return null;

  const errors = issues.filter((i) => i.severity === "error");
  const headline =
    errors.length > 0
      ? `${errors.length} plugin issue${errors.length === 1 ? "" : "s"} need attention`
      : `${issues.length} LOOT notice${issues.length === 1 ? "" : "s"}`;

  return (
    <Card
      className={cn(
        "border-[var(--color-warning)]/40 p-4",
        compact && "p-3",
        className
      )}
    >
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="flex items-center gap-2 font-semibold">
            <AlertTriangle className="h-5 w-5 shrink-0 text-[var(--color-warning)]" />
            {headline}
          </p>
          {!compact && (
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Missing masters, load-order conflicts, and LOOT warnings are listed below.
            </p>
          )}
          <ul className={cn("space-y-2 text-sm", compact ? "mt-2" : "mt-3")}>
            {issues.slice(0, compact ? 3 : 8).map((issue, idx) => (
              <li
                key={`${issue.code}-${issue.plugin ?? idx}`}
                className={cn("rounded-lg border px-3 py-2", severityClass(issue.severity))}
              >
                {issue.plugin && (
                  <span className="mr-2 font-mono text-xs opacity-80">{issue.plugin}</span>
                )}
                {issue.message}
              </li>
            ))}
            {compact && issues.length > 3 && (
              <li className="text-xs text-[var(--color-muted)]">
                +{issues.length - 3} more — open Load Order for details
              </li>
            )}
          </ul>
        </div>
        <Button variant="secondary" size="sm" asChild data-focusable="true">
          <Link to="/games/$domain/load-order" params={{ domain: gameDomain }}>
            Load Order
          </Link>
        </Button>
      </div>
    </Card>
  );
}
