import { cn } from "@/lib/utils";

interface OnboardingStepIndicatorProps {
  steps: string[];
  currentStep: number;
  className?: string;
}

export function OnboardingStepIndicator({
  steps,
  currentStep,
  className,
}: OnboardingStepIndicatorProps) {
  return (
    <div className={cn("flex flex-wrap gap-2", className)}>
      {steps.map((label, i) => (
        <div
          key={label}
          className={cn(
            "rounded-xl px-3 py-1.5 text-xs font-medium sm:px-4 sm:py-2 sm:text-sm",
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
