import { CheckCircle2, Circle, Square, SquareCheck } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

interface OptionCardProps {
  checked: boolean;
  onToggle: () => void;
  /** "radio" shows a circle indicator, "checkbox" a square. */
  control: "radio" | "checkbox";
  title: ReactNode;
  description?: ReactNode;
  /** Extra inline content after the title (e.g. a file-count badge). */
  meta?: ReactNode;
  disabled?: boolean;
  /** Soft highlight (e.g. the row a preview pane is mirroring). */
  focused?: boolean;
  onFocusOption?: () => void;
  className?: string;
}

/**
 * A single focusable selectable card. Replaces native radio/checkbox inputs so
 * controller focus lands on one target per option (the card itself) instead of
 * both a label and a hidden input, and the whole thing is an easy A-press hit.
 */
export function OptionCard({
  checked,
  onToggle,
  control,
  title,
  description,
  meta,
  disabled,
  focused,
  onFocusOption,
  className,
}: OptionCardProps) {
  const isRadio = control === "radio";
  const Indicator = isRadio
    ? checked
      ? CheckCircle2
      : Circle
    : checked
      ? SquareCheck
      : Square;

  return (
    <button
      type="button"
      onClick={onToggle}
      onFocus={onFocusOption}
      onMouseEnter={onFocusOption}
      aria-pressed={checked}
      role={isRadio ? "radio" : undefined}
      aria-checked={isRadio ? checked : undefined}
      disabled={disabled}
      className={cn(
        "focusable flex w-full items-start gap-3 rounded-xl border px-3 py-3 text-left transition-all",
        checked
          ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
          : focused
            ? "border-[var(--color-border-strong)] bg-[var(--color-secondary)]/40"
            : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]/30",
        disabled && "pointer-events-none opacity-60",
        className
      )}
      data-focusable="true"
    >
      <Indicator
        className={cn(
          "mt-0.5 h-5 w-5 shrink-0",
          checked ? "text-[var(--color-primary)]" : "text-[var(--color-muted)]"
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-medium">{title}</span>
          {meta}
        </div>
        {description && (
          <p className="mt-0.5 text-sm text-[var(--color-muted)]">{description}</p>
        )}
      </div>
    </button>
  );
}
