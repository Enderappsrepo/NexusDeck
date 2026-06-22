import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { openUrl } from "@tauri-apps/plugin-opener";
import { ExternalLink, RefreshCw } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";
import type { ModFileInfo, NexusBrowserUrls } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

interface FreeDownloadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  gameDomain: string;
  modId: number;
  modName: string;
  file: ModFileInfo;
  stagingPath: string;
  onReadyToInstall?: () => void;
}

export function FreeDownloadDialog({
  open,
  onOpenChange,
  gameDomain,
  modId,
  modName,
  file,
  stagingPath,
  onReadyToInstall,
}: FreeDownloadDialogProps) {
  const [urls, setUrls] = useState<NexusBrowserUrls | null>(null);
  const [checking, setChecking] = useState(false);
  const [watching, setWatching] = useState(false);
  const [ready, setReady] = useState(false);
  const fileName = modFileDownloadName(file);

  useEffect(() => {
    if (open) {
      api.getNexusBrowserUrls(gameDomain, modId, file.file_id).then(setUrls);
      setReady(false);
      setWatching(false);
    }
  }, [open, gameDomain, modId, file.file_id]);

  useEffect(() => {
    if (!open || ready) return;

    let cancelled = false;
    void api.startStagingWatcher(stagingPath, fileName).then(() => {
      if (!cancelled) setWatching(true);
    });

    const unlisten = listen<string>("staging-file-ready", (event) => {
      if (event.payload === fileName) {
        setReady(true);
        setWatching(false);
        onReadyToInstall?.();
      }
    });

    return () => {
      cancelled = true;
      void unlisten.then((fn) => fn());
    };
  }, [open, ready, stagingPath, fileName, onReadyToInstall]);

  const checkDownload = async () => {
    setChecking(true);
    const exists = await api.watchStagingReady(stagingPath, fileName);
    setReady(exists);
    setChecking(false);
    if (exists) onReadyToInstall?.();
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Premium required for API downloads"
      description="Nexus Mods only allows direct API downloads for Premium members. You can still use NexusDeck for free with manual downloads."
    >
      <div className="space-y-4">
        <div className="rounded-xl bg-[var(--color-secondary)] p-4 text-sm">
          <p className="font-medium">{modName}</p>
          <p className="mt-1 text-[var(--color-muted)]">{fileName}</p>
        </div>

        <ol className="list-decimal space-y-2 pl-5 text-sm text-[var(--color-muted)]">
          <li>Open the mod file page on Nexus Mods in your browser</li>
          <li>Click Download manually (free accounts may have a short wait)</li>
          <li>Save the file to your staging folder:</li>
        </ol>
        <p className="rounded-lg bg-[var(--color-card)] p-3 font-mono text-xs break-all">
          {stagingPath}
        </p>

        {watching && !ready && (
          <p className="text-sm text-[var(--color-muted)]">
            Watching staging folder — NexusDeck will detect the file automatically.
          </p>
        )}

        <div className="flex flex-wrap gap-3">
          <Button
            onClick={() => urls?.file_page && openUrl(urls.file_page)}
            disabled={!urls?.file_page}
            data-focusable="true"
          >
            <ExternalLink className="h-5 w-5" />
            Open file on Nexus
          </Button>
          <Button variant="secondary" onClick={() => urls && openUrl(urls.files_tab)} data-focusable="true">
            <ExternalLink className="h-5 w-5" />
            All files
          </Button>
          <Button variant="outline" onClick={checkDownload} disabled={checking} data-focusable="true">
            <RefreshCw className="h-5 w-5" />
            {checking ? "Checking..." : ready ? "File found!" : "Check staging folder"}
          </Button>
        </div>

        {ready && (
          <p className="text-sm text-[var(--color-success)]">
            Archive detected in staging. Close this dialog and click Install...
          </p>
        )}

        <p className="text-xs text-[var(--color-muted)]">
          API downloads require{" "}
          <button
            type="button"
            className="focusable text-[var(--color-primary)] underline"
            data-focusable="true"
            onClick={() => urls && openUrl(urls.premium_info_url)}
          >
            Nexus Premium
          </button>
          . Browse, search, and install from manually downloaded files work without Premium.
        </p>
      </div>
    </AppDialog>
  );
}
