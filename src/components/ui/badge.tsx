import { cn } from "@/lib/utils";

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: "default" | "success" | "warning" | "muted" | "nsfw" | "update";
}

export function Badge({ className, variant = "default", ...props }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-lg px-3 py-1 text-sm font-semibold",
        variant === "default" && "bg-[var(--color-primary)]/20 text-[var(--color-primary)]",
        variant === "success" && "bg-[var(--color-success)]/20 text-[var(--color-success)]",
        variant === "warning" && "bg-[var(--color-warning)]/20 text-[var(--color-warning)]",
        variant === "muted" && "bg-[var(--color-secondary)] text-[var(--color-muted)]",
        variant === "nsfw" && "bg-amber-500/20 text-amber-300 ring-1 ring-amber-500/30",
        variant === "update" && "bg-[var(--color-primary)]/25 text-[var(--color-primary-hover)]",
        className
      )}
      {...props}
    />
  );
}
