import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export interface SegmentOption<T extends string> {
  value: T;
  label: string;
  icon?: LucideIcon;
}

interface SegmentedControlProps<T extends string> {
  options: SegmentOption<T>[];
  value: T;
  onChange: (value: T) => void;
  size?: "sm" | "default";
  className?: string;
  ariaLabel?: string;
  /** Stretch segments to fill the container width (equal-width segments).
   *  Useful on narrow/mobile layouts; pair with `w-full` in `className`. */
  fill?: boolean;
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  size = "default",
  className,
  ariaLabel,
  fill = false,
}: SegmentedControlProps<T>) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        "gap-1 rounded-xl bg-[var(--color-secondary)] p-1",
        fill ? "flex" : "inline-flex",
        className
      )}
    >
      {options.map((opt) => {
        const active = opt.value === value;
        const Icon = opt.icon;
        return (
          <button
            key={opt.value}
            role="tab"
            type="button"
            aria-selected={active}
            onClick={() => onChange(opt.value)}
            className={cn(
              "focusable inline-flex items-center justify-center gap-1.5 rounded-lg font-medium transition-all",
              size === "sm" ? "min-h-[48px] px-3 text-sm" : "min-h-[48px] px-4 text-base",
              fill && "flex-1",
              active
                ? "bg-[var(--color-card)] text-[var(--color-foreground)] shadow-[var(--shadow-sm)] ring-1 ring-[var(--color-primary)]/30"
                : "text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
            )}
            data-focusable="true"
          >
            {Icon && <Icon className="h-4 w-4 shrink-0" />}
            {opt.label}
          </button>
        );
      })}
    </div>
  );
}
