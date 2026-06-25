import * as Dialog from "@radix-ui/react-dialog";
import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import { focusFirst } from "@/lib/gamepad/focusNavigation";

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
  /**
   * When false the dialog is fully locked: no close button, and Esc / overlay
   * click are ignored. Use during irreversible work (e.g. an install running).
   */
  dismissible?: boolean;
  /**
   * Keep the close button but block Esc / click-outside so a stray tap can't
   * discard a multi-step flow. Ignored when `dismissible` is false (already locked).
   */
  disableOutsideClose?: boolean;
}

export function AppDialog({
  open,
  onOpenChange,
  title,
  description,
  children,
  className,
  dismissible = true,
  disableOutsideClose = false,
}: DialogProps) {
  const blockOutside = !dismissible || disableOutsideClose;
  const preventClose = (e: Event) => e.preventDefault();

  const onOpenChangeRef = useRef(onOpenChange);
  onOpenChangeRef.current = onOpenChange;

  useEffect(() => {
    if (!open) return;
    gamepadRouter.pushContext("dialog");
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) focusFirst(dialog);
    });
    // While the dialog is open, B (back) should close it, not navigate the route
    // behind it. Top of the back stack wins, so this beats the global handler.
    // Locked dialogs (an irreversible step in progress) opt out.
    const unregisterBack = dismissible
      ? gamepadRouter.pushBackHandler(() => onOpenChangeRef.current(false))
      : undefined;
    return () => {
      cancelAnimationFrame(frame);
      unregisterBack?.();
      gamepadRouter.popContext();
    };
  }, [open, dismissible]);

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(next) => {
        if (!next && !dismissible) return;
        onOpenChange(next);
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-black/70 data-[state=open]:animate-in data-[state=closed]:animate-out" />
        <Dialog.Content
          onEscapeKeyDown={blockOutside ? preventClose : undefined}
          onPointerDownOutside={blockOutside ? preventClose : undefined}
          onInteractOutside={blockOutside ? preventClose : undefined}
          className={cn(
            // Mobile: a thumb-reachable card anchored near the bottom edge.
            // sm+: classic dead-center modal. Caller `max-w-*` still caps width.
            "focusable fixed bottom-0 left-1/2 z-50 mb-2 max-h-[90dvh] w-[calc(100%-1rem)] max-w-2xl -translate-x-1/2 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-4 shadow-xl",
            "sm:bottom-auto sm:top-1/2 sm:mb-0 sm:w-[calc(100%-2rem)] sm:-translate-y-1/2 sm:p-6",
            className
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-xl font-bold sm:text-2xl">{title}</Dialog.Title>
              {description && (
                <Dialog.Description className="mt-2 text-[var(--color-muted)]">
                  {description}
                </Dialog.Description>
              )}
            </div>
            {dismissible && (
              <Dialog.Close asChild>
                <button
                  type="button"
                  className="focusable min-h-[44px] min-w-[44px] rounded-lg p-2 hover:bg-[var(--color-secondary)]"
                  data-focusable="true"
                  aria-label="Close"
                >
                  <X className="h-6 w-6" />
                </button>
              </Dialog.Close>
            )}
          </div>
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
