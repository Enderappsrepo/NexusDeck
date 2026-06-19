import { cn } from "@/lib/utils";

const STEPS = [
  "Game Path",
  "Staging Folder",
  "F4SE Check",
  "Profile",
  "Test Deploy",
];

interface StepIndicatorProps {
  currentStep: number;
  className?: string;
}

export function StepIndicator({ currentStep, className }: StepIndicatorProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {STEPS.map((label, i) => (
        <div
          key={label}
          className={cn(
            "rounded-xl px-4 py-2 text-sm font-medium",
            i === currentStep
              ? "bg-[var(--color-primary)] text-white"
              : i < currentStep
                ? "bg-[var(--color-success)]/20 text-[var(--color-success)]"
                : "bg-[var(--color-secondary)] text-[var(--color-muted)]"
          )}
        >
          {i + 1}. {label}
        </div>
      ))}
    </div>
  );
}
