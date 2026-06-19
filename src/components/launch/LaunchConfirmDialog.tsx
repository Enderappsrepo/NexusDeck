import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface LaunchConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  warnings: string[];
  onConfirm: () => void;
}

export function LaunchConfirmDialog({
  open,
  onOpenChange,
  warnings,
  onConfirm,
}: LaunchConfirmDialogProps) {
  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title="Ready to launch?">
      <p className="text-[var(--color-muted)]">
        Review the following before starting the game:
      </p>
      {warnings.length > 0 && (
        <ul className="mt-4 space-y-2 rounded-xl border border-[var(--color-warning)]/30 bg-[var(--color-warning)]/10 p-4 text-sm">
          {warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
      )}
      <div className="mt-6 flex justify-end gap-2">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button size="lg" onClick={onConfirm}>
          Launch Game
        </Button>
      </div>
    </AppDialog>
  );
}
