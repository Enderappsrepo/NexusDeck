import { Download, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { ModFileInfo } from "@/lib/nexus/types";
import { formatBytes } from "@/lib/utils";

interface ModDetailActionBarProps {
  primaryFile: ModFileInfo | undefined;
  downloading: boolean;
  isPremium: boolean;
  onDownload: (file: ModFileInfo) => void;
  onInstall: (file: ModFileInfo) => void;
  onBrowserDownload: (file: ModFileInfo) => void;
}

/** Fixed bottom bar for Steam Deck / narrow viewports — keeps Install within thumb reach. */
export function ModDetailActionBar({
  primaryFile,
  downloading,
  isPremium,
  onDownload,
  onInstall,
  onBrowserDownload,
}: ModDetailActionBarProps) {
  if (!primaryFile) return null;

  return (
    <div
      className="mod-detail-action-bar fixed inset-x-0 z-[54] border-t border-[var(--color-border)] bg-[var(--color-card)]/96 px-4 py-3 backdrop-blur-md"
      data-mod-detail-actions
      role="toolbar"
      aria-label="Mod download and install"
    >
      <div className="mx-auto flex max-w-6xl flex-col gap-2">
        <p className="truncate text-center text-sm font-medium text-[var(--color-muted)]">
          {primaryFile.name} · v{primaryFile.version} ·{" "}
          {formatBytes(primaryFile.size_kb * 1024)}
        </p>
        <div className="flex gap-3">
          {isPremium ? (
            <Button
              size="lg"
              variant="secondary"
              className="min-h-[56px] flex-1 text-base"
              loading={downloading}
              disabled={downloading}
              onClick={() => onDownload(primaryFile)}
              data-focusable="true"
            >
              <Download className="h-5 w-5" />
              Download
            </Button>
          ) : (
            <Button
              size="lg"
              variant="secondary"
              className="min-h-[56px] flex-1 text-base"
              onClick={() => onBrowserDownload(primaryFile)}
              data-focusable="true"
            >
              <Download className="h-5 w-5" />
              Get file
            </Button>
          )}
          <Button
            size="lg"
            className="min-h-[56px] flex-1 text-base shadow-[var(--shadow-glow)]"
            onClick={() => onInstall(primaryFile)}
            data-focusable="true"
          >
            <Package className="h-5 w-5" />
            Install
          </Button>
        </div>
      </div>
    </div>
  );
}
