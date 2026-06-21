import { Package } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import type { DownloadProgress, Profile } from "@/lib/nexus/types";

interface InstallPromptDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  download: DownloadProgress | null;
  profile: Profile | null;
  onInstall: () => void;
  onDismiss: () => void;
}

export function InstallPromptDialog({
  open,
  onOpenChange,
  download,
  profile,
  onInstall,
  onDismiss,
}: InstallPromptDialogProps) {
  if (!download) return null;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Download complete"
    >
      <div className="flex items-start gap-4">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-[var(--color-success)]/20">
          <Package className="h-6 w-6 text-[var(--color-success)]" />
        </div>
        <div>
          <p className="font-medium">{download.mod_name || download.file_name}</p>
          <p className="text-sm text-[var(--color-muted)]">
            Ready to install{profile ? ` into ${profile.name}` : ""}.
          </p>
        </div>
      </div>

      <div className="mt-6 flex justify-end gap-3">
        <Button variant="outline" onClick={onDismiss} data-focusable="true">
          Later
        </Button>
        <Button onClick={onInstall} disabled={!profile} data-focusable="true">
          Install now
        </Button>
      </div>
    </AppDialog>
  );
}
