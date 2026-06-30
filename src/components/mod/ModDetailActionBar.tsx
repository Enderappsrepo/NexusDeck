import { Download, ListPlus, MonitorSmartphone, Package, Smartphone } from "lucide-react";

import { Button } from "@/components/ui/button";

import { useCompanionConnected, useCompanionStore } from "@/stores/companionStore";

import type { ModFileInfo } from "@/lib/nexus/types";

import { formatBytes } from "@/lib/utils";



interface ModDetailActionBarProps {

  primaryFile: ModFileInfo | undefined;

  downloading: boolean;

  isPremium: boolean;

  sendToDeck?: boolean;

  sendingToDeck?: boolean;

  onDownload: (file: ModFileInfo) => void;

  onInstall: (file: ModFileInfo) => void;

  onQueueInstall?: (file: ModFileInfo) => void;

  queueing?: boolean;

  onBrowserDownload: (file: ModFileInfo) => void;

  onSendToDeck?: (file: ModFileInfo) => void;

}



/** Fixed bottom bar for Steam Deck / narrow viewports — keeps Install within thumb reach. */

export function ModDetailActionBar({

  primaryFile,

  downloading,

  isPremium,

  sendToDeck = false,

  sendingToDeck = false,

  onDownload,

  onInstall,

  onQueueInstall,

  queueing = false,

  onBrowserDownload,

  onSendToDeck,

}: ModDetailActionBarProps) {

  const companionConnected = useCompanionConnected();
  const reopenCompanion = useCompanionStore((s) => s.reopen);

  if (!primaryFile) return null;

  // A connected companion owns installation — surface that instead of the
  // device install buttons (soft gate; tapping reopens the companion view).
  if (companionConnected) {
    return (
      <div
        className="mod-detail-action-bar fixed inset-x-0 z-[54] border-t border-[var(--color-border)] bg-[var(--color-card)]/96 px-4 py-3 backdrop-blur-md"
        data-mod-detail-actions
        role="toolbar"
        aria-label="Install from companion"
      >
        <div className="mx-auto flex max-w-6xl flex-col gap-2">
          <p className="truncate text-center text-sm font-medium text-[var(--color-muted)]">
            {primaryFile.name} · v{primaryFile.version} ·{" "}
            {formatBytes(primaryFile.size_kb * 1024)}
          </p>
          <Button
            size="lg"
            variant="secondary"
            className="min-h-[56px] w-full text-base"
            onClick={reopenCompanion}
            data-focusable="true"
          >
            <Smartphone className="h-5 w-5" />
            Install from your phone
          </Button>
        </div>
      </div>
    );
  }

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

          {sendToDeck && onSendToDeck && (

            <Button

              size="lg"

              variant="secondary"

              className="min-h-[56px] flex-1 text-base"

              loading={sendingToDeck}

              disabled={sendingToDeck}

              onClick={() => onSendToDeck(primaryFile)}

              data-focusable="true"

            >

              <MonitorSmartphone className="h-5 w-5" />

              To Deck

            </Button>

          )}

          {onQueueInstall && (

            <Button

              size="lg"

              variant="secondary"

              className="min-h-[56px] flex-1 text-base"

              loading={queueing}

              disabled={queueing || downloading}

              onClick={() => onQueueInstall(primaryFile)}

              data-focusable="true"

            >

              <ListPlus className="h-5 w-5" />

              Queue

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


