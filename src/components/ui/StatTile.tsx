import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

export type StatTone = "default" | "good" | "warn" | "bad";

const TONE_COLOR: Record<StatTone, string> = {
  default: "var(--color-foreground)",
  good: "var(--color-health-good)",
  warn: "var(--color-health-warn)",
  bad: "var(--color-health-bad)",
};

interface StatTileProps {
  icon: LucideIcon;
  label: string;
  value: React.ReactNode;
  tone?: StatTone;
  /** 0–100; renders a progress bar under the value when provided. */
  bar?: number;
  className?: string;
}

export function StatTile({
  icon: Icon,
  label,
  value,
  tone = "default",
  bar,
  className,
}: StatTileProps) {
  const color = TONE_COLOR[tone];
  return (
    <div
      className={cn(
        "rounded-xl border border-[var(--color-border)] bg-[var(--color-card)] p-3 sm:p-3.5",
        className
      )}
    >
      <p className="text-[0.625rem] font-medium uppercase tracking-wider text-[var(--color-muted)]">
        {label}
      </p>
      <p
        className="mt-1 flex items-center gap-1.5 text-lg font-bold leading-tight"
        style={{ color }}
      >
        <Icon
          className="h-4 w-4 shrink-0"
          style={{ color: tone === "default" ? "var(--color-primary)" : color }}
        />
        <span className="truncate">{value}</span>
      </p>
      {bar !== undefined && (
        <div className="mt-2 h-1 overflow-hidden rounded-full bg-[var(--color-surface-3)]">
          <div
            className="h-full rounded-full transition-[width] duration-500 motion-reduce:transition-none"
            style={{ width: `${Math.max(0, Math.min(100, bar))}%`, background: color }}
          />
        </div>
      )}
    </div>
  );
}
