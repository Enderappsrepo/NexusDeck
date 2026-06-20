import { createFileRoute, Link, useNavigate, useParams } from "@tanstack/react-router";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, GitCompare, Package, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import type { InstalledMod, ModUpdateInfo } from "@/lib/nexus/types";

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
    try {
      await api.updateModSafe(profile.id, update.installed_mod_id);
      const next = await api.checkProfileUpdates(profile.id);
      setUpdates(next);
      void triggerHaptic("install");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    }
  };

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up the game first.</p>;
  }

  return (
    <div className="page-section mx-auto max-w-4xl">
      {contextMenu}
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
        X toggles enable/disable. Y opens actions. Disabling removes files from Data; backups stay in staging.
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
                      {update && (
                        <Badge variant="update">Update: v{update.latest_version}</Badge>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {files.length} files deployed
                    </p>
                  </div>
                  <div className="flex gap-2">
                    {update && !compareMode && (
                      <Button
                        variant="secondary"
                        size="sm"
                        data-focusable="true"
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
