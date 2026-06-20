import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { ArrowDownAZ, Download, GitCompare, Loader2, Package, Search, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { AppDialog } from "@/components/ui/dialog";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { ListRowSkeleton } from "@/components/ui/LoadingSkeleton";
import { LaunchButton } from "@/components/launch/LaunchButton";
import {
  CONTEXT_MENU_ICONS,
  useControllerContextMenu,
} from "@/components/controller/ControllerContextMenu";
import { useFocusGroup } from "@/hooks/useFocusGroup";
import { GP } from "@/lib/gamepad/buttons";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { triggerHaptic } from "@/lib/haptics";
import { EXPORT_FORMATS } from "@/lib/nexus/export-formats";
import type { InstalledMod, ModUpdateInfo, ModUpdateProgress } from "@/lib/nexus/types";

function reloadLibrary(profileId: string) {
  return Promise.all([
    api.listInstalledMods(profileId),
    api.checkProfileUpdates(profileId).catch(() => [] as ModUpdateInfo[]),
  ]);
}

export const Route = createFileRoute("/games/$domain/library")({
  component: LibraryPage,
});

function LibraryPage() {
  const { domain } = useParams({ from: "/games/$domain/library" });
  const navigate = useNavigate();
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);
  const listRef = useFocusGroup("library-list");

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
  const [searchQuery, setSearchQuery] = useState("");
  const [focusedModId, setFocusedModId] = useState<string | null>(null);
  const [uninstallTarget, setUninstallTarget] = useState<InstalledMod | null>(null);
  const [uninstalling, setUninstalling] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [updatingAll, setUpdatingAll] = useState(false);
  const [updateProgress, setUpdateProgress] = useState<Record<string, ModUpdateProgress>>({});

  const refreshLibrary = useCallback(async () => {
    if (!profile) return;
    const [installed, updateList] = await reloadLibrary(profile.id);
    setMods(installed);
    setUpdates(updateList);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    reloadLibrary(profile.id)
      .then(async ([installed, updateList]) => {
        setMods(installed);
        setUpdates(updateList);
        if (installed.some((m) => !m.category)) {
          const refreshed = await api.refreshModMetadata(profile.id).catch(() => installed);
          setMods(refreshed);
        }
      })
      .finally(() => setLoading(false));
  }, [profile]);

  const filteredMods = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return mods;
    return mods.filter(
      (m) =>
        m.name.toLowerCase().includes(q) ||
        String(m.nexus_mod_id).includes(q) ||
        (m.enabled ? "enabled" : "disabled").includes(q)
    );
  }, [mods, searchQuery]);

  const updateForMod = (mod: InstalledMod) =>
    updates.find((u) => u.installed_mod_id === mod.id);

  const toggleMod = useCallback(async (mod: InstalledMod) => {
    setTogglingId(mod.id);
    setError(null);
    try {
      await api.setModEnabled(mod.id, !mod.enabled);
      setMods((prev) =>
        prev.map((m) => (m.id === mod.id ? { ...m, enabled: !m.enabled } : m))
      );
      void triggerHaptic("success");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    } finally {
      setTogglingId(null);
    }
  }, []);

  const reorderMod = useCallback(
    async (modId: string, direction: "up" | "down") => {
      if (!profile) return;
      try {
        const next = await api.reorderMod(profile.id, modId, direction);
        setMods(next);
        void triggerHaptic("reorder");
      } catch (e) {
        setError(e);
      }
    },
    [profile]
  );

  useEffect(() => {
    const onReorder = (e: Event) => {
      const { modId, direction } = (e as CustomEvent).detail as {
        modId: string;
        direction: "up" | "down";
      };
      void reorderMod(modId, direction);
    };
    window.addEventListener("nexusdeck-library-reorder", onReorder);
    return () => window.removeEventListener("nexusdeck-library-reorder", onReorder);
  }, [reorderMod]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<ModUpdateProgress>("mod-update-progress", (e) => {
      setUpdateProgress((prev) => ({
        ...prev,
        [e.payload.installed_mod_id]: e.payload,
      }));
    }).then((u) => unsubs.push(u));
    listen<InstalledMod>("mod-update-complete", (e) => {
      setUpdateProgress((prev) => {
        const next = { ...prev };
        delete next[e.payload.id];
        return next;
      });
      void refreshLibrary();
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [refreshLibrary]);

  useGamepadContextAction(GP.X, () => {
    const mod = mods.find((m) => m.id === focusedModId);
    if (mod && !compareMode) void toggleMod(mod);
  });

  const focusedMod = mods.find((m) => m.id === focusedModId);
  const { menu: contextMenu } = useControllerContextMenu(
    focusedMod
      ? [
          {
            id: "view",
            label: "View on Nexus",
            icon: CONTEXT_MENU_ICONS.view,
            onAction: () =>
              navigate({
                to: "/games/$domain/mods/$modId",
                params: { domain, modId: String(focusedMod.nexus_mod_id) },
              }),
          },
          {
            id: "toggle",
            label: focusedMod.enabled ? "Disable mod" : "Enable mod",
            icon: CONTEXT_MENU_ICONS.toggle,
            onAction: () => void toggleMod(focusedMod),
          },
          ...(updateForMod(focusedMod)
            ? [
                {
                  id: "update",
                  label: "Update mod",
                  icon: CONTEXT_MENU_ICONS.download,
                  onAction: () => {
                    const u = updateForMod(focusedMod);
                    if (u) void updateMod(u);
                  },
                },
              ]
            : []),
          {
            id: "compare",
            label: "Compare mode",
            icon: CONTEXT_MENU_ICONS.compare,
            onAction: () => {
              setCompareMode(true);
              setCompareA(focusedMod.id);
            },
          },
          {
            id: "uninstall",
            label: "Uninstall mod",
            icon: Trash2,
            variant: "danger",
            onAction: () => setUninstallTarget(focusedMod),
          },
        ]
      : [],
    focusedMod?.name
  );

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
    setUpdateProgress((prev) => ({
      ...prev,
      [update.installed_mod_id]: {
        installed_mod_id: update.installed_mod_id,
        phase: "preparing",
        message: "Starting update…",
      },
    }));
    try {
      await api.startModUpdate(profile.id, update.installed_mod_id);
      void triggerHaptic("install");
    } catch (e) {
      setError(e);
      setUpdateProgress((prev) => {
        const next = { ...prev };
        delete next[update.installed_mod_id];
        return next;
      });
      void triggerHaptic("error");
    }
  };

  const updateAllMods = async () => {
    if (!profile) return;
    setUpdatingAll(true);
    setError(null);
    try {
      const result = await api.updateAllMods(profile.id);
      if (result.errors.length > 0) {
        setError(new Error(result.errors.join("\n")));
      }
      void triggerHaptic("install");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    } finally {
      setUpdatingAll(false);
    }
  };

  const autoSortLoadOrder = async () => {
    if (!profile) return;
    setSorting(true);
    setError(null);
    try {
      const next = await api.autoSortLoadOrder(profile.id);
      setMods(next);
      void triggerHaptic("reorder");
    } catch (e) {
      setError(e);
    } finally {
      setSorting(false);
    }
  };

  const confirmUninstall = async () => {
    if (!uninstallTarget || !profile) return;
    setUninstalling(true);
    setError(null);
    try {
      await api.uninstallMod(uninstallTarget.id);
      setUninstallTarget(null);
      await refreshLibrary();
      void triggerHaptic("success");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    } finally {
      setUninstalling(false);
    }
  };

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up the game first.</p>;
  }

  return (
    <div className="page-section mx-auto max-w-4xl">
      {contextMenu}
      <AppDialog
        open={!!uninstallTarget}
        onOpenChange={(open) => !open && setUninstallTarget(null)}
        title="Uninstall mod?"
      >
        {uninstallTarget && (
          <div className="space-y-4">
            <p>
              Remove <strong>{uninstallTarget.name}</strong> from your library and delete its
              deployed files. Shared files may be restored from other mods.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setUninstallTarget(null)} data-focusable="true">
                Cancel
              </Button>
              <Button
                variant="outline"
                loading={uninstalling}
                onClick={() => void confirmUninstall()}
                data-focusable="true"
              >
                Uninstall
              </Button>
            </div>
          </div>
        )}
      </AppDialog>
      <div className="mb-4">
        <LaunchButton profileId={profile.id} gameDomain={domain} compact className="w-full sm:w-auto" />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Installed Mods</h1>
          <p className="mt-1 text-sm text-[var(--color-muted)]">
            {mods.length} installed · {mods.filter((m) => m.enabled).length} enabled · L2/R2 reorder
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={sorting || mods.length === 0}
            loading={sorting}
            onClick={() => void autoSortLoadOrder()}
            data-focusable="true"
          >
            <ArrowDownAZ className="h-4 w-4" />
            Auto-sort load order
          </Button>
          <Button
            variant={compareMode ? "default" : "outline"}
            onClick={() => {
              setCompareMode(!compareMode);
              setCompareA(null);
              setCompareB(null);
            }}
            data-focusable="true"
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

      <div className="relative">
        <Search className="absolute left-4 top-1/2 h-5 w-5 -translate-y-1/2 text-[var(--color-muted)]" />
        <Input
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Filter installed mods..."
          className="pl-12"
          data-focusable="true"
          data-library-search
        />
      </div>

      {!!error && (
        <ApiErrorBanner context="generic" error={error} onRetry={() => setError(null)} />
      )}

      {updates.length > 0 && (
        <Card className="border-[var(--color-primary)]/30 bg-[var(--color-primary)]/5 p-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="font-semibold">
                {updates.length} update{updates.length === 1 ? "" : "s"} available
              </p>
              <p className="text-sm text-[var(--color-muted)]">
                Updates download and install automatically with your saved options.
              </p>
            </div>
            <Button
              loading={updatingAll}
              disabled={updatingAll}
              onClick={() => void updateAllMods()}
              data-focusable="true"
            >
              <Download className="h-4 w-4" />
              Update all
            </Button>
          </div>
        </Card>
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
              data-focusable="true"
            >
              Export {fmt.label}
            </Button>
          ))}
        </div>
      </Card>

      {exportContent && (
        <pre className="max-h-48 overflow-auto rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)] p-4 text-xs" data-scroll-pane>
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
        X toggles enable/disable. Y opens actions. Uninstall removes the mod entirely.
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

      {!loading && filteredMods.length > 0 && (
        <div ref={listRef} className="space-y-3" data-scroll-pane data-focus-group="library-list">
          {filteredMods.map((mod, index) => {
            const files: string[] = JSON.parse(mod.installed_files_json || "[]");
            const update = updateForMod(mod);
            const progress = updateProgress[mod.id];
            const selected = compareA === mod.id || compareB === mod.id;
            return (
              <Card
                key={mod.id}
                interactive
                role="button"
                tabIndex={0}
                data-focusable="true"
                data-mod-id={mod.id}
                data-enabled={String(mod.enabled)}
                data-mod-index={index}
                onFocus={() => setFocusedModId(mod.id)}
                onClick={() => {
                  if (compareMode) {
                    handleModClick(mod);
                  } else {
                    navigate({
                      to: "/games/$domain/mods/$modId",
                      params: { domain, modId: String(mod.nexus_mod_id) },
                    });
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    if (compareMode) handleModClick(mod);
                    else
                      navigate({
                        to: "/games/$domain/mods/$modId",
                        params: { domain, modId: String(mod.nexus_mod_id) },
                      });
                  }
                }}
                className={`min-h-[72px] p-4 ${selected ? "border-[var(--color-primary)] ring-1 ring-[var(--color-primary)]/30" : ""} ${compareMode ? "cursor-pointer" : "cursor-pointer"}`}
              >
                <div className="flex flex-wrap items-center justify-between gap-4">
                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-lg font-semibold">{mod.name}</span>
                      <Badge variant="muted">#{index + 1}</Badge>
                      <Badge variant={mod.enabled ? "success" : "muted"}>
                        {mod.enabled ? "Enabled" : "Disabled"}
                      </Badge>
                      {mod.category && (
                        <Badge variant="muted">{mod.category}</Badge>
                      )}
                      {update && (
                        <Badge variant="update">Update: v{update.latest_version}</Badge>
                      )}
                      {progress && (
                        <Badge variant="muted" className="gap-1">
                          <Loader2 className="h-3 w-3 animate-spin" />
                          {progress.message}
                        </Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {files.length} files deployed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {update && !compareMode && !progress && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-focusable="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          void updateMod(update);
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
                        data-focusable="true"
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
