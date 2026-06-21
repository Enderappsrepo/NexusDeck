import { cn } from "@/lib/utils";

const DEFAULT_STEPS = [
  "Game Path",
  "Staging Folder",
  "F4SE Check",
  "Profile",
  "Test Deploy",
];

interface StepIndicatorProps {
  currentStep: number;
  className?: string;
  totalSteps?: number;
  labels?: string[];
}

export function StepIndicator({
  currentStep,
  className,
  totalSteps,
  labels,
}: StepIndicatorProps) {
  const steps =
    labels ??
    (totalSteps
      ? DEFAULT_STEPS.slice(0, totalSteps)
      : DEFAULT_STEPS);

  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {steps.map((label, i) => (
        <div
          key={`${label}-${i}`}
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
