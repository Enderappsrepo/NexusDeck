import { useState } from "react";
import { Download } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import { useDownloadsStore } from "@/stores";
import type { CollectionDetail, Profile } from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

interface CollectionInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  collection: CollectionDetail;
  profile: Profile;
  gameDomain: string;
}

export function CollectionInstallDialog({
  open,
  onOpenChange,
  collection,
  profile,
  gameDomain,
}: CollectionInstallDialogProps) {
  const [installing, setInstalling] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setProgress = useDownloadsStore((s) => s.setProgress);

  const requiredMods = collection.mods.filter((m) => !m.optional);

  const queueAll = async () => {
    setInstalling(true);
    setError(null);
    try {
      for (const entry of requiredMods) {
        if (!entry.file_id) continue;
        const files = await api.getModFiles(gameDomain, entry.mod_id);
        const file = files.find((f) => f.file_id === entry.file_id) ?? files[0];
        if (!file) continue;
        const progress = await api.startModDownload({
          gameDomain,
          modId: entry.mod_id,
          fileId: file.file_id,
          fileName: modFileDownloadName(file),
          stagingPath: profile.staging_path,
          expectedSizeKb: file.size_kb,
          modName: entry.name,
          profileId: profile.id,
        });
        setProgress(progress);
      }
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={`Install ${collection.name}`}>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Queue downloads for {requiredMods.length} required mods from this collection.
      </p>

      <div className="mb-4 max-h-48 space-y-2 overflow-y-auto scrollbar-thin">
        {collection.mods.map((mod) => (
          <div
            key={mod.mod_id}
            className="flex items-center justify-between rounded-lg bg-[var(--color-secondary)] p-3 text-sm"
          >
            <span>{mod.name}</span>
            {mod.optional ? (
              <Badge variant="muted">Optional</Badge>
            ) : (
              <Badge variant="success">Required</Badge>
            )}
          </div>
        ))}
      </div>

      {error && (
        <p className="mb-4 text-sm text-[var(--color-danger)]">{error}</p>
      )}

      <div className="flex justify-end gap-3">
        <Button variant="outline" onClick={() => onOpenChange(false)}>
          Cancel
        </Button>
        <Button onClick={queueAll} disabled={installing}>
          <Download className="h-4 w-4" />
          {installing ? "Queueing..." : "Download all required"}
        </Button>
      </div>
    </AppDialog>
  );
}
