import { createFileRoute, Link } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import {
  ArrowDown,
  ArrowDownAZ,
  ArrowUp,
  ChevronLeft,
  ListOrdered,
  MonitorSmartphone,
  RefreshCw,
  ShieldCheck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card } from "@/components/ui/card";
import { ApiErrorBanner } from "@/components/ui/ApiErrorBanner";
import { EmptyState } from "@/components/ui/EmptyState";
import { LaunchButton } from "@/components/launch/LaunchButton";
import { useProfile } from "@/stores";
import { api } from "@/lib/commands";
import { triggerHaptic } from "@/lib/haptics";
import { getPairedDeck, sendLoadOrderToPairedDeck } from "@/lib/remote/sendToDeck";
import { useSettingsStore } from "@/stores/settingsStore";
import { LoadOrderIssuesPanel } from "@/components/game/LoadOrderIssuesPanel";
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
  const { profile, profilesLoading } = useProfile(domain);

  const [state, setState] = useState<LoadOrderState | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [sorting, setSorting] = useState(false);
  const [rescanning, setRescanning] = useState(false);
  const [scanningDisk, setScanningDisk] = useState(false);
  const [togglingId, setTogglingId] = useState<string | null>(null);
  const [syncNote, setSyncNote] = useState<string | null>(null);
  const [sendingToDeck, setSendingToDeck] = useState(false);
  const [tab, setTab] = useState<"mods" | "plugins">("mods");

  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const pairedDeck = !deckDetected ? getPairedDeck() : null;

  const refresh = useCallback(async () => {
    if (!profile) return;
    setError(null);
    try {
      const next = await api.getLoadOrderState(profile.id);
      setState(next);
    } catch (e) {
      setError(e);
    }
  }, [profile]);

  useEffect(() => {
    if (!profile) {
      setLoading(profilesLoading);
      return;
    }
    let cancelled = false;
    setLoading(true);
    setScanningDisk(true);
    // List from the real game Data folder, not just the DB: reconcile restores
    // any ledgered mods the DB dropped, and rescan imports mod plugins already
    // deployed under Data/ that aren't tracked yet — so the list reflects what
    // is actually on disk. Best-effort: fall back to the DB/ledger on error.
    void (async () => {
      try {
        await api.reconcileModLibrary(profile.id);
        await api.rescanLibraryFromDisk(profile.id);
      } catch {
        // ignore — the refresh below still shows whatever the DB/ledger holds
      }
      if (cancelled) return;
      setScanningDisk(false);
      await refresh();
      if (!cancelled) setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [profile, profilesLoading, refresh]);

  useEffect(() => {
    const onInstalled = () => {
      void refresh();
    };
    window.addEventListener("nexusdeck-mod-installed", onInstalled);
    return () => window.removeEventListener("nexusdeck-mod-installed", onInstalled);
  }, [refresh]);

  const rescanFromDisk = async () => {
    if (!profile) return;
    setRescanning(true);
    setError(null);
    setSyncNote(null);
    try {
      const recovered = await api.reconcileModLibrary(profile.id);
      const result = await api.rescanLibraryFromDisk(profile.id);
      const note = [recovered.restored > 0 ? recovered.message : null, result.message]
        .filter(Boolean)
        .join(" ");
      setSyncNote(note);
      await refresh();
      void triggerHaptic(
        recovered.restored > 0 || result.mods_added > 0 ? "success" : "reorder"
      );
    } catch (e) {
      setError(e);
    } finally {
      setRescanning(false);
    }
  };

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

  const sendLoadOrderToDeck = async () => {
    if (!profile || !pairedDeck) return;
    setSendingToDeck(true);
    setError(null);
    try {
      const message = await sendLoadOrderToPairedDeck(pairedDeck, profile.id);
      setSyncNote(message);
      void triggerHaptic("success");
    } catch (e) {
      setError(e);
      void triggerHaptic("error");
    } finally {
      setSendingToDeck(false);
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

  if (profilesLoading && !profile) {
    return <p className="text-[var(--color-muted)]">Loading profile…</p>;
  }

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
          <h1 className="page-header-title">Load Order</h1>
          <p className="mt-1 max-w-2xl text-sm text-[var(--color-muted)]">
            Scanned from your game's <code className="text-xs">Data</code> folder. NexusDeck writes{" "}
            <code className="text-xs">plugins.txt</code> before launch — no manual toggling needed.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void rescanFromDisk()}
            loading={rescanning}
            disabled={rescanning || loading}
            data-focusable="true"
            title="Re-scan the game Data folder and refresh the list"
          >
            <RefreshCw className="h-4 w-4" />
            Rescan
          </Button>
          <LaunchButton profileId={profile.id} gameDomain={domain} compact />
        </div>
      </div>

      {state && state.loot_issues.length > 0 && (
        <LoadOrderIssuesPanel issues={state.loot_issues} gameDomain={domain} />
      )}

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
              {pairedDeck && (
                <Button
                  variant="outline"
                  onClick={() => void sendLoadOrderToDeck()}
                  loading={sendingToDeck}
                  disabled={sendingToDeck || (state.mods.length ?? 0) === 0}
                  data-focusable="true"
                >
                  <MonitorSmartphone className="h-4 w-4" />
                  Send to Deck
                </Button>
              )}
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
        <ApiErrorBanner context="generic" error={error} onRetry={() => void refresh()} />
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

      {loading && (
        <p className="text-[var(--color-muted)]">
          {scanningDisk ? "Scanning game Data folder…" : "Loading load order…"}
        </p>
      )}

      {!loading && state && tab === "mods" && state.mods.length === 0 && (
        <EmptyState
          icon={ListOrdered}
          title="No mods in library"
          description="If mods are already in your game folder, rescan to import them into NexusDeck."
          action={
            <Button onClick={() => void rescanFromDisk()} loading={rescanning} data-focusable="true">
              <RefreshCw className="h-4 w-4" />
              Rescan from game folder
            </Button>
          }
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
