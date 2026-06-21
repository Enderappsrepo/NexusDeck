import * as Dialog from "@radix-ui/react-dialog";
import { useEffect } from "react";
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

  useEffect(() => {
    if (!open) return;
    gamepadRouter.pushContext("dialog");
    const frame = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (dialog) focusFirst(dialog);
    });
    return () => {
      cancelAnimationFrame(frame);
      gamepadRouter.popContext();
    };
  }, [open]);

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
            "focusable fixed left-1/2 top-1/2 z-50 max-h-[90vh] w-[calc(100%-2rem)] max-w-2xl -translate-x-1/2 -translate-y-1/2 overflow-auto rounded-2xl border border-[var(--color-border)] bg-[var(--color-card)] p-6 shadow-xl",
            className
          )}
        >
          <div className="mb-4 flex items-start justify-between gap-4">
            <div>
              <Dialog.Title className="text-2xl font-bold">{title}</Dialog.Title>
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
