import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { Download, RefreshCw } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { api } from "@/lib/commands";
import type { CollectionDetail, CollectionDiffResult, Profile } from "@/lib/nexus/types";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { modFileDownloadName } from "@/lib/nexus/types";

const STATUS_BADGE: Record<string, "success" | "warning" | "muted" | "default"> = {
  installed: "success",
  missing: "warning",
  outdated: "default",
  wrong_file: "warning",
};

interface CollectionDiffPanelProps {
  profile: Profile;
  gameDomain: string;
  collection: CollectionDetail;
}

export function CollectionDiffPanel({ profile, gameDomain, collection }: CollectionDiffPanelProps) {
  const [diff, setDiff] = useState<CollectionDiffResult | null>(null);
  const [fixing, setFixing] = useState(false);
  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);

  const refresh = () => {
    api
      .diffCollectionInstall(
        profile.id,
        collection.mods.map((m) => ({
          mod_id: m.mod_id,
          file_id: m.file_id,
          name: m.name,
          optional: m.optional,
          version: m.version,
        }))
      )
      .then(setDiff)
      .catch(() => setDiff(null));
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("nexusdeck-mod-installed", handler);
    return () => window.removeEventListener("nexusdeck-mod-installed", handler);
  }, [profile.id, collection.slug]);

  if (!diff) return null;

  const pct =
    diff.total_count > 0 ? Math.round((diff.installed_count / diff.total_count) * 100) : 0;

  const fixMissing = async () => {
    setFixing(true);
    try {
      for (const entry of diff.mods.filter((m) => m.status !== "installed")) {
        const cm = collection.mods.find((c) => c.mod_id === entry.mod_id);
        if (!cm?.file_id) continue;
        const files = await api.getModFiles(gameDomain, cm.mod_id);
        const file = files.find((f) => f.file_id === cm.file_id) ?? files[0];
        if (!file) continue;
        const progress = await api.startModDownload({
          gameDomain,
          modId: cm.mod_id,
          fileId: file.file_id,
          fileName: modFileDownloadName(file),
          stagingPath: profile.staging_path,
          expectedSizeKb: file.size_kb,
          modName: cm.name,
          profileId: profile.id,
        });
        registerPendingInstall(progress.id, { source: "collection" });
        setProgress(progress);
      }
    } finally {
      setFixing(false);
    }
  };

  return (
    <Card className="border-[var(--color-primary)]/30 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="font-semibold">
            Collection progress: {diff.installed_count}/{diff.total_count} mods match
          </p>
          <p className="text-sm text-[var(--color-muted)]">
            {diff.missing_count} missing · {diff.outdated_count} outdated ·{" "}
            {diff.wrong_file_count} wrong file
          </p>
          <Progress value={pct} className="mt-2 h-2" />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={refresh} data-focusable="true">
            <RefreshCw className="h-4 w-4" />
            Refresh
          </Button>
          {(diff.missing_count > 0 || diff.outdated_count > 0 || diff.wrong_file_count > 0) && (
            <Button size="sm" loading={fixing} onClick={() => void fixMissing()} data-focusable="true">
              <Download className="h-4 w-4" />
              Fix all
            </Button>
          )}
        </div>
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-sm scrollbar-thin" data-scroll-pane>
        {diff.mods.map((m) => (
          <li key={m.mod_id} className="flex items-center justify-between gap-2 py-1">
            <Link
              to="/games/$domain/mods/$modId"
              params={{ domain: gameDomain, modId: String(m.mod_id) }}
              className="min-w-0 truncate hover:text-[var(--color-primary)]"
            >
              {m.name}
            </Link>
            <Badge variant={STATUS_BADGE[m.status] ?? "muted"}>{m.status}</Badge>
          </li>
        ))}
      </ul>
    </Card>
  );
}
