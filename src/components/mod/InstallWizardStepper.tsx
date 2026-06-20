import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

export interface WizardStepItem {
  id: string;
  label: string;
}

interface InstallWizardStepperProps {
  steps: WizardStepItem[];
  currentIndex: number;
  className?: string;
}

export function InstallWizardStepper({
  steps,
  currentIndex,
  className,
}: InstallWizardStepperProps) {
  if (steps.length <= 1) return null;

  return (
    <nav aria-label="Install progress" className={cn("w-full", className)}>
      <ol className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-thin">
        {steps.map((step, index) => {
          const complete = index < currentIndex;
          const active = index === currentIndex;
          return (
            <li key={step.id} className="flex min-w-0 flex-1 items-center gap-1">
              <div
                className={cn(
                  "flex min-w-0 flex-1 items-center gap-2 rounded-lg px-2 py-1.5 text-xs font-medium transition-colors sm:px-3 sm:text-sm",
                  active && "bg-[var(--color-primary)]/15 text-[var(--color-primary)]",
                  complete && "text-[var(--color-success)]",
                  !active && !complete && "text-[var(--color-muted)]"
                )}
              >
                <span
                  className={cn(
                    "flex h-6 w-6 shrink-0 items-center justify-center rounded-full border text-[11px]",
                    active && "border-[var(--color-primary)] bg-[var(--color-primary)] text-white",
                    complete && "border-[var(--color-success)] bg-[var(--color-success)] text-white",
                    !active && !complete && "border-[var(--color-border)]"
                  )}
                >
                  {complete ? <Check className="h-3.5 w-3.5" /> : index + 1}
                </span>
                <span className="truncate">{step.label}</span>
              </div>
              {index < steps.length - 1 && (
                <span
                  className={cn(
                    "hidden h-px w-4 shrink-0 sm:block",
                    index < currentIndex ? "bg-[var(--color-success)]" : "bg-[var(--color-border)]"
                  )}
                />
              )}
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
