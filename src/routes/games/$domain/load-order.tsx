import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  ChevronLeft,
  ListOrdered,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import { triggerHaptic } from "@/lib/haptics";
import type { LoadOrderState } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/load-order")({
  component: LoadOrderPage,
});

const KIND_LABEL: Record<string, string> = {
  vanilla: "Vanilla",
  dlc: "DLC",
  creation_club: "Creation Club",
  mod: "Mod",
};

function LoadOrderPage() {
  const { domain } = Route.useParams();
  const { getProfile } = useGamesStore();
  const profile = getProfile(domain);

  const [state, setState] = useState<LoadOrderState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [tab, setTab] = useState<"mods" | "plugins">("mods");

  const refresh = useCallback(async () => {
    if (!profile) return;
    setError(null);
    const next = await api.getLoadOrderState(profile.id);
    setState(next);
  }, [profile]);

  useEffect(() => {
    if (!profile) return;
    setLoading(true);
    refresh().finally(() => setLoading(false));
  }, [profile, refresh]);

  const syncPlugins = async () => {
    if (!profile) return;
    setSyncing(true);
    setError(null);
    try {
      const res = await api.syncPluginsTxt(profile.id);
      setSyncNote(`Synced ${res.plugin_count} plugin(s) to plugins.txt`);
      await refresh();
      void triggerHaptic("success");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    } finally {
      setSyncing(false);
    }
  };

  const autoSort = async () => {
    if (!profile) return;
    setSorting(true);
    setError(null);
    try {
      await api.autoSortLoadOrder(profile.id);
      await refresh();
      setSyncNote("Load order sorted with LOOT and plugins.txt updated");
      void triggerHaptic("reorder");
    } catch (e) {
      setError(e);
    } finally {
      setSorting(false);
    }
  };

  const toggleMod = async (modId: string, enabled: boolean) => {
    setTogglingId(modId);
    setError(null);
    try {
      await api.setModEnabled(modId, !enabled);
      await refresh();
      void triggerHaptic("success");
    } catch (e) {
      setError(e);
    } finally {
      setTogglingId(null);
    }
  };

  const reorder = async (modId: string, direction: "up" | "down") => {
    if (!profile) return;
    try {
      await api.reorderMod(profile.id, modId, direction);
      await refresh();
      void triggerHaptic("reorder");
    } catch (e) {
      setError(e);
    }
  };

  if (!profile) {
    return <p className="text-[var(--color-muted)]">Set up the game first.</p>;
  }

  const activePlugins = state?.plugins.filter((p) => p.enabled) ?? [];

  return (
    <div className="page-section mx-auto max-w-4xl space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <Link
            to="/games/$domain/library"
            params={{ domain }}
            className="mb-2 inline-flex items-center gap-1 text-sm text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
          >
            <ChevronLeft className="h-4 w-4" />
            Library
          </Link>
          <h1 className="text-3xl font-bold tracking-tight">Load Order</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            Manage mod order and which plugins load in-game. NexusDeck writes{" "}
            <code className="text-xs">plugins.txt</code> before launch so mods stay enabled in
            Creations — no manual toggling needed.
          </p>
        </div>
        <LaunchButton profileId={profile.id} gameDomain={domain} compact />
      </div>

      {state && (
        <Card className="border-[var(--color-primary)]/20 bg-[var(--color-primary)]/5 p-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="space-y-1">
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="h-5 w-5 text-[var(--color-success)]" />
                {state.active_plugin_count} active plugin
                {state.active_plugin_count === 1 ? "" : "s"}
              </p>
              <p className="text-sm text-[var(--color-muted)]">{state.message}</p>
              {state.plugins_txt_path && (
                <p className="text-xs text-[var(--color-muted)] break-all">
                  plugins.txt → {state.plugins_txt_path}
                </p>
              )}
              {syncNote && (
                <p className="text-sm text-[var(--color-success)]">{syncNote}</p>
              )}
            </div>
            <div className="flex flex-wrap gap-2">
              <Button
                onClick={() => void syncPlugins()}
                loading={syncing}
                disabled={!state.plugins_txt_ready || syncing}
                data-focusable="true"
              >
                <RefreshCw className="h-4 w-4" />
                Sync plugins.txt
              </Button>
              <Button
                variant="secondary"
                onClick={() => void autoSort()}
                loading={sorting}
                disabled={sorting || (state.mods.length ?? 0) === 0}
                data-focusable="true"
              >
                <ArrowDownAZ className="h-4 w-4" />
                Auto-sort (LOOT)
              </Button>
            </div>
          </div>
        </Card>
      )}

      {!!error && (
        <ApiErrorBanner context="generic" error={error} onRetry={() => setError(null)} />
      )}

      <div className="flex gap-2">
        <Button
          variant={tab === "mods" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("mods")}
          data-focusable="true"
        >
          Mod order
        </Button>
        <Button
          variant={tab === "plugins" ? "default" : "outline"}
          size="sm"
          onClick={() => setTab("plugins")}
          data-focusable="true"
        >
          Plugin list ({activePlugins.length})
        </Button>
      </div>

      {loading && <p className="text-[var(--color-muted)]">Loading load order…</p>}

      {!loading && state && tab === "mods" && state.mods.length === 0 && (
        <EmptyState
          icon={ListOrdered}
          title="No mods installed"
          description="Install mods from Browse, then return here to order them."
        />
      )}

      {!loading && state && tab === "mods" && state.mods.length > 0 && (
        <div className="space-y-3" data-scroll-pane>
          {state.mods.map((mod, index) => (
            <Card key={mod.id} className="p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge variant="muted">#{index + 1}</Badge>
                    <span className="font-semibold">{mod.name}</span>
                    <Badge variant={mod.enabled ? "success" : "muted"}>
                      {mod.enabled ? "Enabled" : "Disabled"}
                    </Badge>
                  </div>
                  {mod.plugins.length > 0 && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">
                      {mod.plugins.join(", ")}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === 0}
                    onClick={() => void reorder(mod.id, "up")}
                    data-focusable="true"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={index === state.mods.length - 1}
                    onClick={() => void reorder(mod.id, "down")}
                    data-focusable="true"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </Button>
                  <Button
                    variant={mod.enabled ? "outline" : "default"}
                    size="sm"
                    loading={togglingId === mod.id}
                    onClick={() => void toggleMod(mod.id, mod.enabled)}
                    data-focusable="true"
                  >
                    {mod.enabled ? "Disable" : "Enable"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      )}

      {!loading && state && tab === "plugins" && (
        <div className="space-y-2" data-scroll-pane>
          <p className="text-sm text-[var(--color-muted)]">
            Plugins with a checkmark are written to plugins.txt and load when you launch through
            NexusDeck.
          </p>
          {state.plugins.map((plugin) => (
            <Card
              key={plugin.name}
              className={`flex flex-wrap items-center justify-between gap-2 p-3 ${plugin.enabled ? "" : "opacity-60"}`}
            >
              <div className="flex min-w-0 flex-wrap items-center gap-2">
                <Badge variant={plugin.enabled ? "success" : "muted"}>
                  {plugin.enabled ? "Active" : "Inactive"}
                </Badge>
                <span className="font-mono text-sm">{plugin.name}</span>
                <Badge variant="muted">{KIND_LABEL[plugin.kind] ?? plugin.kind}</Badge>
              </div>
              {plugin.mod_name && (
                <span className="text-sm text-[var(--color-muted)]">{plugin.mod_name}</span>
              )}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
