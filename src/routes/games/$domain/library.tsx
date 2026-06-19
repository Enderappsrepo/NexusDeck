import { createFileRoute, Link, useParams } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Download, GitCompare, Package } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { EXPORT_FORMATS } from "@/lib/nexus/export-formats";
import type { InstalledMod, ModUpdateInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const { domain } = useParams({ from: "/games/$domain/library" });
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const [mods, setMods] = useState<InstalledMod[]>([]);
  const [updates, setUpdates] = useState<ModUpdateInfo[]>([]);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [compareMode, setCompareMode] = useState(false);
  const [compareA, setCompareA] = useState<string | null>(null);
  const [compareB, setCompareB] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportContent, setExportContent] = useState<string | null>(null);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    Promise.all([
      api.listInstalledMods(profile.id),
      api.checkProfileUpdates(profile.id).catch(() => [] as ModUpdateInfo[]),
    ])
      .then(([installed, updateList]) => {
        setMods(installed);
        setUpdates(updateList);
      })
      .finally(() => setLoading(false));
  }, [profile]);

  const updateForMod = (mod: InstalledMod) =>
    updates.find((u) => u.installed_mod_id === mod.id);

  const toggleMod = async (mod: InstalledMod) => {
    setTogglingId(mod.id);
    setError(null);
    try {
      await api.setModEnabled(mod.id, !mod.enabled);
      setMods((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, enabled: !m.enabled } : m))
      );
    } catch (e) {
      setError(e);
    } finally {
      setTogglingId(null);
    }
  };

  const handleModClick = (mod: InstalledMod) => {
    if (!compareMode) return;
    if (!compareA) {
      setCompareA(mod.id);
    } else if (!compareB && mod.id !== compareA) {
      setCompareB(mod.id);
    } else {
      setCompareA(mod.id);
      setCompareB(null);
    }
  };

  const exportModlist = async (format: string) => {
    if (!profile) return;
    setExporting(true);
    try {
      const result = await api.exportModlist(profile.id, format);
      setExportContent(result.content);
    } catch (e) {
      setError(e);
    } finally {
      setExporting(false);
    }
  };

  const updateMod = async (update: ModUpdateInfo) => {
    if (!profile) return;
    setError(null);
    try {
      await api.updateModSafe(profile.id, update.installed_mod_id);
      const next = await api.checkProfileUpdates(profile.id);
      setUpdates(next);
    } catch (e) {
      setError(e);
    }
  };

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up the game first.</p>;
  }

  return (
    <div className="page-section mx-auto max-w-4xl">
      <div className="mb-4">
        <LaunchButton profileId={profile.id} gameDomain={domain} compact className="w-full sm:w-auto" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-3xl font-bold tracking-tight">Installed Mods</h1>
        <div className="flex flex-wrap gap-2">
          <Button
            variant={compareMode ? "default" : "outline"}
            onClick={() => {
              setCompareMode(!compareMode);
              setCompareA(null);
              setCompareB(null);
            }}
          >
            <GitCompare className="h-4 w-4" />
            {compareMode ? "Cancel compare" : "Compare mode"}
          </Button>
          {compareA && compareB && (
            <Link
              to="/games/$domain/compare"
              params={{ domain }}
              search={{ modA: compareA, modB: compareB }}
              className="focusable"
              data-focusable="true"
            >
              <Button>
                <GitCompare className="h-4 w-4" />
                View comparison
              </Button>
            </Link>
          )}
        </div>
      </div>

      {!!error && (
        <ApiErrorBanner context="generic" error={error} onRetry={() => setError(null)} />
      )}

      <Card className="p-4">
        <p className="mb-3 text-sm font-semibold text-[var(--color-muted)]">Export mod list</p>
        <div className="flex flex-wrap gap-2">
          {EXPORT_FORMATS.map((fmt) => (
            <Button
              key={fmt.id}
              variant="outline"
              size="sm"
              disabled={exporting}
              loading={exporting}
              onClick={() => exportModlist(fmt.id)}
            >
              Export {fmt.label}
            </Button>
          ))}
        </div>
      </Card>

      {exportContent && (
        <pre className="max-h-48 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-4 text-xs">
          {exportContent}
        </pre>
      )}

      {compareMode && (
        <p className="text-sm text-[var(--color-muted)]">
          Select two mods to compare.{" "}
          {compareA && !compareB && "Now select the second mod."}
        </p>
      )}

      <p className="text-sm text-[var(--color-muted)]">
        Disabling a mod removes its files from your game Data folder. Backups are kept in your
        staging folder so you can re-enable later.
      </p>

      {loading && <ListRowSkeleton count={3} />}

      {!loading && mods.length === 0 && (
        <EmptyState
          icon={Package}
          title="No mods installed yet"
          description="Browse mods and install your first one to see it here."
          action={
            <Link to="/games/$domain/mods" params={{ domain }} search={{ modId: undefined }}>
              <Button>Browse mods</Button>
            </Link>
          }
        />
      )}

      {!loading && mods.length > 0 && (
        <div className="space-y-3">
          {mods.map((mod) => {
            const files: string[] = JSON.parse(mod.installed_files_json || "[]");
            const update = updateForMod(mod);
            const selected = compareA === mod.id || compareB === mod.id;
            return (
              <Card
                key={mod.id}
                interactive={compareMode}
                role={compareMode ? "button" : undefined}
                tabIndex={compareMode ? 0 : undefined}
                onClick={() => handleModClick(mod)}
                onKeyDown={(e) => e.key === "Enter" && handleModClick(mod)}
                className={`p-4 ${selected ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30" : ""} ${compareMode ? "cursor-pointer" : ""}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{mod.name}</span>
                      <Badge variant={mod.enabled ? "success" : "muted"}>
                        {mod.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {update && (
                        <Badge variant="update">Update: v{update.latest_version}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {files.length} files deployed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {update && (
                      <Button
                        variant="secondary"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          updateMod(update);
                        }}
                      >
                        <Download className="h-4 w-4" />
                        Update
                      </Button>
                    )}
                    {!compareMode && (
                      <Button
                        variant={mod.enabled ? "outline" : "default"}
                        disabled={togglingId === mod.id}
                        loading={togglingId === mod.id}
                        onClick={(e) => {
                          e.stopPropagation();
                          toggleMod(mod);
                        }}
                      >
                        {mod.enabled ? "Disable" : "Enable"}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}
