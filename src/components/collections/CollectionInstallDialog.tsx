import { useMemo, useState } from "react";
import { Package } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/commands";
import { dedupeCollectionMods, modDownloadInFlight } from "@/lib/nexus/collections";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { useCollectionInstallStore } from "@/stores/collectionInstallStore";
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
  const [includeOptional, setIncludeOptional] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);
  const startBatch = useCollectionInstallStore((s) => s.startBatch);
  const bindDownload = useCollectionInstallStore((s) => s.bindDownload);
  const batchActive = useCollectionInstallStore((s) => s.active);

  const uniqueMods = useMemo(() => dedupeCollectionMods(collection.mods), [collection.mods]);
  const requiredMods = uniqueMods.filter((m) => !m.optional);
  const optionalMods = uniqueMods.filter((m) => m.optional);
  const targetMods = includeOptional ? uniqueMods : requiredMods;

  const queueMod = async (entry: (typeof uniqueMods)[number]) => {
    if (!entry.file_id) return;
    if (modDownloadInFlight(entry.mod_id, useDownloadsStore.getState().active)) return;    const files = await api.getModFiles(gameDomain, entry.mod_id);
    const file = files.find((f) => f.file_id === entry.file_id) ?? files[0];
    if (!file) return;
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
    registerPendingInstall(progress.id, {
      source: "collection",
      collectionSlug: collection.slug,
      collectionName: collection.name,
      modId: entry.mod_id,
      modName: entry.name,
    });
    bindDownload(entry.mod_id, progress.id);
    setProgress(progress);
  };

  const installAll = async () => {
    if (
      batchActive?.slug === collection.slug &&
      batchActive.mods.some(
        (m) => m.status !== "done" && m.status !== "failed" && m.status !== "skipped"
      )
    ) {
      setError("This collection is already installing.");
      return;
    }

    setInstalling(true);
    setError(null);
    try {
      const toQueue = targetMods.filter(
        (m) => !modDownloadInFlight(m.mod_id, useDownloadsStore.getState().active)
      );      startBatch({
        slug: collection.slug,
        name: collection.name,
        gameDomain,
        profile,
        mods: toQueue.map((m) => ({
          modId: m.mod_id,
          name: m.name,
          fileId: m.file_id,
          optional: m.optional,
          status: "pending" as const,
        })),
      });

      for (const entry of toQueue) {
        await queueMod(entry);
      }      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  return (
    <AppDialog open={open} onOpenChange={onOpenChange} title={`Install ${collection.name}`}>
      <p className="mb-4 text-sm text-[var(--color-muted)]">
        Download and auto-install mods from this collection. Progress appears in a panel at the
        bottom of the screen.
      </p>

      {optionalMods.length > 0 && (
        <label className="mb-4 flex items-center justify-between gap-3 rounded-lg bg-[var(--color-secondary)] p-3 text-sm">
          <span>Include {optionalMods.length} optional mod{optionalMods.length === 1 ? "" : "s"}</span>
          <Switch
            checked={includeOptional}
            onCheckedChange={setIncludeOptional}
            data-focusable="true"
          />
        </label>
      )}

      <div className="mb-4 max-h-48 space-y-2 overflow-y-auto scrollbar-thin" data-scroll-pane>
        {uniqueMods.map((mod) => (
          <div
            key={`${mod.mod_id}-${mod.file_id ?? "x"}`}            className="flex items-center justify-between rounded-lg bg-[var(--color-secondary)] p-3 text-sm"
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
        <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
          Cancel
        </Button>
        <Button onClick={installAll} disabled={installing} data-focusable="true">
          <Package className="h-4 w-4" />
          {installing ? "Starting..." : `Install ${targetMods.length} mod${targetMods.length === 1 ? "" : "s"}`}
        </Button>
      </div>
    </AppDialog>
  );
}
