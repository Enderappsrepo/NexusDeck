import * as React from "react";
import * as ToastPrimitive from "@radix-ui/react-toast";
import { cn } from "@/lib/utils";

const ToastProvider = ToastPrimitive.Provider;
const ToastViewport = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Viewport>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Viewport>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Viewport
    ref={ref}
    className={cn(
      "fixed bottom-24 right-4 z-[100] flex max-h-screen w-full max-w-sm flex-col gap-2 p-4 md:bottom-6",
      className
    )}
    {...props}
  />
));
ToastViewport.displayName = ToastPrimitive.Viewport.displayName;

const Toast = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Root>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Root> & {
    variant?: "default" | "success" | "error";
  }
>(({ className, variant = "default", ...props }, ref) => (
  <ToastPrimitive.Root
    ref={ref}
    className={cn(
      "pointer-events-auto rounded-xl border px-4 py-3 shadow-[var(--shadow-md)] backdrop-blur-sm",
      variant === "success" &&
        "border-[var(--color-success)]/40 bg-[var(--color-success)]/10",
      variant === "error" &&
        "border-[var(--color-danger)]/40 bg-[var(--color-danger)]/10",
      variant === "default" &&
        "border-[var(--color-border)] bg-[var(--color-card)]",
      className
    )}
    {...props}
  />
));
Toast.displayName = ToastPrimitive.Root.displayName;

const ToastTitle = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Title>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Title
    ref={ref}
    className={cn("text-sm font-semibold", className)}
    {...props}
  />
));
ToastTitle.displayName = ToastPrimitive.Title.displayName;

const ToastDescription = React.forwardRef<
  React.ComponentRef<typeof ToastPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof ToastPrimitive.Description>
>(({ className, ...props }, ref) => (
  <ToastPrimitive.Description
    ref={ref}
    className={cn("mt-1 text-sm text-[var(--color-muted)]", className)}
    {...props}
  />
));
ToastDescription.displayName = ToastPrimitive.Description.displayName;

export { ToastProvider, ToastViewport, Toast, ToastTitle, ToastDescription };

export interface ToastMessage {
  id: string;
  title: string;
  description?: string;
  variant?: "default" | "success" | "error";
}

export function Toaster({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  return (
    <ToastProvider swipeDirection="right">
      {toasts.map((t) => (
        <Toast
          key={t.id}
          variant={t.variant}
          open
          onOpenChange={(open) => !open && onDismiss(t.id)}
          duration={5000}
        >
          <ToastTitle>{t.title}</ToastTitle>
          {t.description && <ToastDescription>{t.description}</ToastDescription>}
        </Toast>
      ))}
      <ToastViewport />
    </ToastProvider>
  );
}
