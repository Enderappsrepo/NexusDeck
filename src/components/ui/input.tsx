import * as React from "react";
import { cn } from "@/lib/utils";

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, type, ...props }, ref) => (
  <input
    type={type}
    className={cn(
      "flex h-14 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-surface-1)] px-4 text-lg text-[var(--color-foreground)] placeholder:text-[var(--color-muted)] transition-colors focus-visible:outline-none focus-visible:border-[var(--color-primary)] focus-visible:shadow-[var(--shadow-focus)] focusable",
      className
    )}
    ref={ref}
    data-focusable="true"
    {...props}
  />
));
Input.displayName = "Input";
