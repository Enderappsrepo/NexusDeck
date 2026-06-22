import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { ModSafetyReport } from "@/lib/nexus/types";

interface ModSafetyDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  modName: string;
  report: ModSafetyReport | null;
  onConfirm: () => void;
}

export function ModSafetyDialog({
  open,
  onOpenChange,
  modName,
  report,
  onConfirm,
}: ModSafetyDialogProps) {
  if (!report) return null;

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={`Change ${modName}?`}>
      <p className="text-sm text-[var(--color-muted)]">
        This mod may affect your current save or load order.
      </p>
      <ul className="mt-4 space-y-2 text-sm">
        {report.warnings.map((w, i) => (
          <li
            key={i}
            className={`rounded-lg border p-3 ${
              report.severity === "error"
                ? "border-[var(--color-danger)]/30 bg-[var(--color-danger)]/10"
                : "border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10"
            }`}
          >
            {w}
          </li>
        ))}
      </ul>
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
          Cancel
        </Button>
        <Button
          variant={report.severity === "error" ? "danger" : "default"}
          onClick={onConfirm}
          data-focusable="true"
        >
          Continue anyway
        </Button>
      </div>
    </AppDialog>
  );
}
