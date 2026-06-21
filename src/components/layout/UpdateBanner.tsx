import { openUrl } from "@tauri-apps/plugin-opener";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AppUpdateInfo } from "@/lib/nexus/types";

interface UpdateBannerProps {
  info: AppUpdateInfo;
  onDismiss?: () => void;
}

export function UpdateBanner({ info, onDismiss }: UpdateBannerProps) {
  if (!info.update_available && !info.update_required) return null;

  const mandatory = info.update_required;

  return (
    <div
      className={`flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-4 py-3 text-sm ${
        mandatory
          ? "border-[var(--color-warning)]/40 bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
          : "border-[var(--color-primary)]/30 bg-[var(--color-primary)]/10 text-[var(--color-foreground)]"
      }`}
      role="status"
    >
      <div className="min-w-0 flex-1">
        <p className="font-semibold">
          {mandatory ? "Update required" : "Update available"} — v{info.latest_version}
        </p>
        <p className="text-[var(--color-muted)]">{info.message}</p>
      </div>
      <div className="flex flex-wrap items-center gap-2">
        <Button
          size="sm"
          onClick={() => void openUrl(info.release_url)}
          data-focusable="true"
        >
          Update now
        </Button>
        {!mandatory && onDismiss && (
          <Button
            size="sm"
            variant="ghost"
            onClick={onDismiss}
            aria-label="Dismiss update notice"
            data-focusable="true"
          >
            <X className="h-4 w-4" />
          </Button>
        )}
      </div>
    </div>
  );
}
