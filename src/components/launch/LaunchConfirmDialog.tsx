import { Link } from "@tanstack/react-router";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { LaunchCheckItem } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

interface LaunchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  checks: LaunchCheckItem[];
  gameDomain?: string;
  onConfirm: () => void;
}

function severityClass(severity: string): string {
  if (severity === "error") {
    return "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10 text-[var(--color-danger)]";
  }
  if (severity === "info") {
    return "border-[var(--color-border)] bg-[var(--color-secondary)]/40 text-[var(--color-muted)]";
  }
  return "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10";
}

export function LaunchConfirmDialog({
  open,
  onOpenChange,
  checks,
  gameDomain,
  onConfirm,
}: LaunchConfirmDialogProps) {
  const showLoadOrder = checks.some(
    (c) => c.code.startsWith("plugin") || c.code.startsWith("loot") || c.code.startsWith("missing")
  );
  const showDepsFix = checks.some((c) => c.code === "proton_deps_missing");

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Ready to launch?">
      <p className="text-[var(--color-muted)]">
        Review the following before starting the game:
      </p>
      {checks.length > 0 && (
        <ul className="mt-4 space-y-2 text-sm">
          {checks.map((check) => (
            <li
              key={check.code}
              className={cn("rounded-xl border p-3", severityClass(check.severity))}
            >
              {check.message}
            </li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex flex-wrap justify-end gap-2">
        {showLoadOrder && gameDomain && (
          <Button variant="secondary" asChild data-focusable="true">
            <Link to="/games/$domain/load-order" params={{ domain: gameDomain }}>
              Open Load Order
            </Link>
          </Button>
        )}
        {showDepsFix && gameDomain && (
          <Button variant="secondary" asChild data-focusable="true">
            <Link to="/games/$domain/troubleshoot" params={{ domain: gameDomain }}>
              Install dependencies
            </Link>
          </Button>
        )}
        <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
          Cancel
        </Button>
        <Button size="lg" onClick={onConfirm} data-focusable="true">
          Launch Game
        </Button>
      </div>
    </AppDialog>
  );
}
