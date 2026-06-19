import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-xl font-semibold transition-all focus-visible:outline-none disabled:pointer-events-none disabled:opacity-50 min-h-[48px] min-w-[48px] px-6 text-lg active:scale-[0.98] motion-reduce:active:scale-100",
  {
    variants: {
      variant: {
        default: "bg-[var(--color-primary)] text-white shadow-[var(--shadow-sm)] hover:bg-[var(--color-primary-hover)]",
        secondary: "bg-[var(--color-secondary)] text-[var(--color-foreground)] hover:bg-[var(--color-card-hover)]",
        outline: "border-2 border-[var(--color-border)] bg-transparent hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-card)]",
        ghost: "hover:bg-[var(--color-card)]",
        danger: "bg-[var(--color-danger)] text-white hover:opacity-90",
      },
      size: {
        default: "h-12 px-6",
        lg: "h-16 px-8 text-xl",
        sm: "h-10 px-4 text-base",
        icon: "h-12 w-12",
      },
    },
    defaultVariants: { variant: "default", size: "default" },
  }
);

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
  loading?: boolean;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, loading, children, disabled, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={cn(buttonVariants({ variant, size, className }), "focusable")}
        ref={ref}
        data-focusable="true"
        disabled={disabled || loading}
        {...props}
      >
        {loading ? (
          <>
            <span className="h-5 w-5 animate-spin rounded-full border-2 border-current border-t-transparent motion-reduce:animate-none" />
            {children}
          </>
        ) : (
          children
        )}
      </Comp>
    );
  }
);
Button.displayName = "Button";
