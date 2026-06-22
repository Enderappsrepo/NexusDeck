import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  Circle,
  Copy,
  Download,
  ExternalLink,
  Palette,
  Shirt,
  Sparkles,
  AlertCircle,
  Loader2,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import type { BodySetupStatus } from "@/lib/nexus/types";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { cn } from "@/lib/utils";
import { BodyModSetupWizard } from "@/components/wizard/BodyModSetupWizard";
import { useGamesStore } from "@/stores";

const STEP_ICONS = {
  done: CheckCircle2,
  action_needed: AlertCircle,
  pending: Circle,
};

export function BodySlideSetupPanel({ profileId }: { profileId: string }) {
  const profile = useGamesStore((s) => s.profiles.find((p) => p.id === profileId));
  const [status, setStatus] = useState<BodySetupStatus | null>(null);
  const [launching, setLaunching] = useState<"bodyslide" | "outfit" | null>(null);
  const [configuring, setConfiguring] = useState(false);
  const [copiedPath, setCopiedPath] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);
  const [wizardOpen, setWizardOpen] = useState(false);

  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);

  const refresh = useCallback(() => {
    api
      .getBodySetupStatus(profileId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [profileId]);

  useEffect(() => {
    refresh();
    const handler = () => refresh();
    window.addEventListener("nexusdeck-mod-installed", handler);
    return () => window.removeEventListener("nexusdeck-mod-installed", handler);
  }, [refresh]);

  if (!status) return null;

  const showPanel =
    status.can_one_click_install ||
    status.cbbe_installed ||
    status.bodyslide_installed;
  if (!showPanel) return null;

  const oneClickInstall = async () => {
    setInstalling(true);
    setError(null);
    setMessage(null);
    try {
      const progress = await api.queueBodyslideInstall(profileId);
      registerPendingInstall(progress.id, { source: "bodyslide" });
      setProgress(progress);
      setMessage("Downloading BodySlide — it will install automatically when complete.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setInstalling(false);
    }
  };

  const launchBodySlide = async () => {
    setLaunching("bodyslide");
    setError(null);
    setMessage(null);
    try {
      setMessage(await api.launchBodyslide(profileId));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(null);
    }
  };

  const launchOutfitStudio = async () => {
    setLaunching("outfit");
    setError(null);
    setMessage(null);
    try {
      setMessage(await api.launchOutfitStudio(profileId));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(null);
    }
  };

  const configurePaths = async () => {
    setConfiguring(true);
    setError(null);
    setMessage(null);
    try {
      const result = await api.configureBodyslidePaths(profileId);
      setMessage(`Game path saved to BodySlide Config.xml: ${result.game_data_path}`);
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setConfiguring(false);
    }
  };

  const copyGamePath = async () => {
    if (!status.bodyslide_game_data_path) return;
    try {
      await navigator.clipboard.writeText(status.bodyslide_game_data_path);
      setCopiedPath(true);
      window.setTimeout(() => setCopiedPath(false), 2000);
    } catch {
      setError("Could not copy path to clipboard.");
    }
  };

  const openNexus = () => {
    if (status.nexus_bodyslide_url) {
      void openUrl(status.nexus_bodyslide_url);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)]">
      <div className="border-b border-[var(--color-border)] p-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
              <Shirt className="h-6 w-6" />
            </div>
            <div>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="text-lg font-bold">BodySlide &amp; Outfits</h3>
                {status.bodyslide_installed && (
                  <Badge variant="success">Installed</Badge>
                )}
                {status.presets_built && <Badge variant="success">Meshes built</Badge>}
                {!status.bodyslide_installed && status.can_one_click_install && (
                  <Badge variant="warning">Setup needed</Badge>
                )}
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                Build CBBE body meshes and preview outfits. One-click install from Nexus, then
                launch directly through Proton.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {(status.can_one_click_cbbe || status.can_one_click_install) && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => setWizardOpen(true)}
                data-focusable="true"
              >
                Setup wizard
              </Button>
            )}
            {status.can_one_click_install && !status.bodyslide_installed && (
              <Button size="sm" onClick={oneClickInstall} loading={installing} data-focusable="true">
                <Download className="h-4 w-4" />
                One-Click Install
              </Button>
            )}
            {!status.bodyslide_installed && status.nexus_bodyslide_url && (
              <Button variant="secondary" size="sm" onClick={openNexus} data-focusable="true">
                <ExternalLink className="h-4 w-4" />
                Nexus page
              </Button>
            )}
            {status.bodyslide_installed && (
              <>
                <Button
                  size="sm"
                  onClick={launchBodySlide}
                  loading={launching === "bodyslide"}
                  data-focusable="true"
                >
                  <Sparkles className="h-4 w-4" />
                  Launch BodySlide
                </Button>
                {status.outfit_studio_available && (
                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={launchOutfitStudio}
                    loading={launching === "outfit"}
                    data-focusable="true"
                  >
                    <Palette className="h-4 w-4" />
                    Outfit Studio
                  </Button>
                )}
              </>
            )}
          </div>
        </div>
      </div>

      {status.bodyslide_installed && status.bodyslide_game_data_path && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-5 py-3 text-sm">
          <p className="font-medium">Game Data folder</p>
          <p className="mt-1 text-[var(--color-muted)]">
            {status.bodyslide_browse_hint ??
              "NexusDeck configures BodySlide before launch. You should not need to browse for your game folder."}
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <code className="max-w-full overflow-x-auto rounded-lg bg-[var(--color-background)] px-2 py-1 text-xs">
              {status.bodyslide_game_data_path}
            </code>
            <Button variant="outline" size="sm" onClick={copyGamePath} data-focusable="true">
              <Copy className="h-4 w-4" />
              {copiedPath ? "Copied" : "Copy path"}
            </Button>
            {!status.bodyslide_config_ready && (
              <Button
                variant="secondary"
                size="sm"
                onClick={configurePaths}
                loading={configuring}
                data-focusable="true"
              >
                Fix BodySlide path
              </Button>
            )}
            {status.bodyslide_config_ready && (
              <Badge variant="success">Path configured</Badge>
            )}
          </div>
          <p className="mt-2 text-xs text-[var(--color-muted)]">
            If BodySlide still asks: click <strong>Launch BodySlide</strong> again (not from Steam
            directly), or tap <strong>Fix BodySlide path</strong> above, then relaunch.
          </p>
        </div>
      )}

      {status.bodyslide_installed && !status.presets_built && (
        <div className="border-b border-[var(--color-border)] bg-[var(--color-warning)]/10 px-5 py-3 text-sm">
          <p className="font-medium text-[var(--color-warning)]">Next: Batch Build</p>
          <p className="mt-1 text-[var(--color-muted)]">
            Open BodySlide, pick your CBBE preset, click <strong>Batch Build</strong>, then launch
            the game. Output lands in <span className="font-mono">Data/meshes/</span>.
          </p>
        </div>
      )}

      <ol className="divide-y divide-[var(--color-border)]">
        {status.steps.map((step) => {
          const Icon = STEP_ICONS[step.status as keyof typeof STEP_ICONS] ?? Circle;
          const expanded = expandedStep === step.id;
          return (
            <li key={step.id}>
              <button
                type="button"
                className="focusable flex w-full items-start gap-3 px-5 py-3 text-left hover:bg-[var(--color-secondary)]/30"
                onClick={() => setExpandedStep(expanded ? null : step.id)}
                data-focusable="true"
              >
                <Icon
                  className={cn(
                    "mt-0.5 h-5 w-5 shrink-0",
                    step.status === "done" && "text-[var(--color-success)]",
                    step.status === "action_needed" && "text-[var(--color-warning)]",
                    step.status === "pending" && "text-[var(--color-muted)]"
                  )}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium">{step.label}</p>
                  {expanded && step.description && (
                    <p className="mt-1 text-sm text-[var(--color-muted)]">{step.description}</p>
                  )}
                </div>
              </button>
            </li>
          );
        })}
      </ol>

      {(message || error) && (
        <div className="border-t border-[var(--color-border)] px-5 py-3 text-sm">
          {error ? (
            <p className="text-[var(--color-danger)]">{error}</p>
          ) : (
            <p className="flex items-center gap-2 text-[var(--color-muted)]">
              {installing && <Loader2 className="h-4 w-4 animate-spin" />}
              {message}
            </p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-5 py-3 text-xs text-[var(--color-muted)]">
        BodySlide runs through your game&apos;s Proton prefix on Steam Deck. For complex outfit
        editing, Desktop Mode may be easier — built meshes sync to your game folder automatically.
      </div>

      {profile && (
        <BodyModSetupWizard
          open={wizardOpen}
          onOpenChange={setWizardOpen}
          profileId={profileId}
          gameDomain={profile.game_domain}
        />
      )}
    </section>
  );
}
