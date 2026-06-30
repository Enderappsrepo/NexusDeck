import { useState } from "react";
import { ListOrdered } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { InstallQueueContent, useInstallQueueBadgeCount } from "@/components/install/InstallQueueContent";
import { cn } from "@/lib/utils";

export function InstallQueueNavButton({ className }: { className?: string }) {
  const [open, setOpen] = useState(false);
  const count = useInstallQueueBadgeCount();

  return (
    <>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={cn("relative gap-2", className)}
        onClick={() => setOpen(true)}
        aria-label={count > 0 ? `Install queue, ${count} mods` : "Install queue"}
        data-focusable="true"
        data-install-queue-nav
      >
        <ListOrdered className="h-4 w-4" />
        <span className="hidden sm:inline">Queue</span>
        {count > 0 && (
          <span className="absolute -right-1.5 -top-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-[var(--color-primary)] px-1 text-[10px] font-bold text-white">
            {count > 99 ? "99+" : count}
          </span>
        )}
      </Button>

      <AppDialog
        open={open}
        onOpenChange={setOpen}
        title="Install queue"
        description="Queued mods install one at a time after you press Start installing."
        className="max-w-lg"
      >
        <InstallQueueContent />
      </AppDialog>
    </>
  );
}
