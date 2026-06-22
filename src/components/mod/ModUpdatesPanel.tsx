import { useEffect, useState } from "react";
import { Download } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { AppDialog } from "@/components/ui/dialog";
import { api } from "@/lib/commands";
import type { ModUpdateInfo } from "@/lib/nexus/types";
import { triggerHaptic } from "@/lib/haptics";

export function ModUpdatesPanel({
  profileId,
  gameDomain,
  compact = false,
}: {
  profileId: string;
  gameDomain: string;
  compact?: boolean;
}) {
  const [updates, setUpdates] = useState<ModUpdateInfo[]>([]);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [updatingId, setUpdatingId] = useState<string | null>(null);
  const [changelog, setChangelog] = useState<{ name: string; text: string } | null>(null);
  const [changelogLoading, setChangelogLoading] = useState<string | null>(null);

  const refresh = () => {
    api.checkProfileUpdates(profileId).then(setUpdates).catch(() => setUpdates([]));
  };

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("nexusdeck-mod-installed", handler);
    return () => window.removeEventListener("nexusdeck-mod-installed", handler);
  }, [profileId]);

  if (updates.length === 0) return null;

  const updateOne = async (update: ModUpdateInfo) => {
    setUpdatingId(update.installed_mod_id);
    try {
      await api.startModUpdate(profileId, update.installed_mod_id);
      void triggerHaptic("install");
    } finally {
      setUpdatingId(null);
    }
  };

  const updateAll = async () => {
    setUpdatingAll(true);
    try {
      await api.updateAllMods(profileId);
      void triggerHaptic("install");
    } finally {
      setUpdatingAll(false);
    }
  };

  const showChangelog = async (update: ModUpdateInfo) => {
    setChangelogLoading(update.installed_mod_id);
    try {
      const text = await api.getModUpdateChangelog(gameDomain, update.nexus_mod_id);
      setChangelog({ name: update.name, text: text || "No changelog text available." });
    } finally {
      setChangelogLoading(null);
    }
  };

  const changelogDialog = (
    <AppDialog
      open={!!changelog}
      onOpenChange={(open) => !open && setChangelog(null)}
      title={changelog ? `Changelog — ${changelog.name}` : "Changelog"}
    >
      {changelog && (
        <div className="max-h-64 overflow-y-auto whitespace-pre-wrap text-sm scrollbar-thin" data-scroll-pane>
          {changelog.text}
        </div>
      )}
    </AppDialog>
  );

  if (compact) {
    return (
      <>
        {changelogDialog}
        <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-semibold">
              {updates.length} mod update{updates.length === 1 ? "" : "s"} available
            </p>
            <p className="text-sm text-[var(--color-muted)]">
              Updates download and reinstall with your saved options.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" asChild data-focusable="true">
              <Link to="/games/$domain/library" params={{ domain: gameDomain }}>
                View all
              </Link>
            </Button>
            <Button size="sm" loading={updatingAll} onClick={() => void updateAll()} data-focusable="true">
              <Download className="h-4 w-4" />
              Update all
            </Button>
          </div>
        </div>
      </Card>
      </>
    );
  }

  return (
    <>
      {changelogDialog}
      <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <p className="font-semibold">
          {updates.length} update{updates.length === 1 ? "" : "s"} available
        </p>
        <Button loading={updatingAll} onClick={() => void updateAll()} data-focusable="true">
          <Download className="h-4 w-4" />
          Update all
        </Button>
      </div>
      <ul className="space-y-2" data-scroll-pane>
        {updates.map((update) => (
          <li
            key={update.installed_mod_id}
            className="flex flex-wrap items-center justify-between gap-2 rounded-lg bg-[var(--color-secondary)]/60 px-3 py-2 text-sm"
          >
            <div className="min-w-0">
              <p className="truncate font-medium">{update.name}</p>
              <p className="text-xs text-[var(--color-muted)]">
                {update.installed_version ?? "?"} → {update.latest_version}
              </p>
            </div>
            <div className="flex items-center gap-2">
              {update.changelog_available && (
                <Button
                  variant="ghost"
                  size="sm"
                  loading={changelogLoading === update.installed_mod_id}
                  onClick={() => void showChangelog(update)}
                  data-focusable="true"
                >
                  Changelog
                </Button>
              )}
              <Button
                size="sm"
                loading={updatingId === update.installed_mod_id}
                onClick={() => void updateOne(update)}
                data-focusable="true"
              >
                Update
              </Button>
            </div>
          </li>
        ))}
      </ul>
    </Card>
    </>
  );
}
