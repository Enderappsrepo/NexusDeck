import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

interface EmptyStateProps {
  icon: LucideIcon;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  return (
    <div
      className={cn(
        "flex flex-col items-center justify-center rounded-2xl border border-dashed border-[var(--color-border)] bg-[var(--color-card)] px-8 py-16 text-center",
        className
      )}
    >
      <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-2xl bg-[var(--color-secondary)]">
        <Icon className="h-8 w-8 text-[var(--color-primary)]" />
      </div>
      <h3 className="text-xl font-semibold">{title}</h3>
      {description && (
        <p className="mt-2 max-w-md text-[var(--color-muted)]">{description}</p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}
