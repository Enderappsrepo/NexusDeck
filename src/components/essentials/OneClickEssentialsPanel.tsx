import { useCallback, useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, ChevronDown, ChevronUp, Loader2, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { api } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type {
  GameEssentialModStatus,
  GameEssentialsManifest,
  InstallPreset,
  Profile,
} from "@/lib/nexus/types";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { useEssentialsInstallStore } from "@/stores/essentialsInstallStore";
import { useWakeLock } from "@/hooks/useWakeLock";

interface OneClickEssentialsPanelProps {
  profileId: string;
  domain: string;
  profile: Profile;
}

export function resolveEssentialInstallPreset(
  mod: Pick<GameEssentialModStatus, "kind" | "install_preset">
): InstallPreset | undefined {
  if (mod.kind === "bodyslide") {
    return { strategy: "merge_loose_to_data", autoConfirm: true };
  }
  if (mod.kind === "cbbe") {
    return { strategy: "auto", fomodPreset: "cbbe_deck", autoConfirm: true };
  }
  const preset = mod.install_preset;
  if (!preset) return { strategy: "auto", autoConfirm: true };
  return {
    strategy: preset.strategy,
    autoConfirm: preset.auto_confirm ?? true,
    fomodPreset:
      preset.fomod_preset === "cbbe_deck" ? ("cbbe_deck" as const) : undefined,
  };
}

export function OneClickEssentialsPanel({ profileId, domain, profile }: OneClickEssentialsPanelProps) {
  const [manifest, setManifest] = useState<GameEssentialsManifest | null>(null);
  const [status, setStatus] = useState<GameEssentialModStatus[]>([]);
  const [running, setRunning] = useState(false);
  const [includeSetup, setIncludeSetup] = useState(true);
  const [includeOptional, setIncludeOptional] = useState(true);
  const [showPreview, setShowPreview] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);
  const startBatch = useEssentialsInstallStore((s) => s.startBatch);
  const bindDownload = useEssentialsInstallStore((s) => s.bindDownload);
  const markSetupDone = useEssentialsInstallStore((s) => s.markSetupDone);
  const markPostBatchDone = useEssentialsInstallStore((s) => s.markPostBatchDone);
  const activeBatch = useEssentialsInstallStore((s) => s.active);

  useWakeLock(running, "Installing essentials");

  const refreshStatus = useCallback(() => {
    void api.getGameEssentialsStatus(profileId).then(setStatus).catch(() => setStatus([]));
  }, [profileId]);

  useEffect(() => {
    void api
      .getGameEssentialsManifest(domain)
      .then(setManifest)
      .catch(() => setManifest(null));
  }, [domain]);

  useEffect(() => {
    refreshStatus();
  }, [refreshStatus, activeBatch]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<{ step: string; message: string }>("essential-fixes:progress", (e) => {
      setProgressStep(e.payload.message || e.payload.step);
    }).then((u) => unsubs.push(u));
    listen("essential-fixes:complete", () => {
      markSetupDone();
      setProgressStep(null);
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, [markSetupDone]);

  const statusById = useMemo(
    () => new Map(status.map((s) => [s.id, s])),
    [status]
  );

  const selectedModIds = useMemo(() => {
    if (!manifest) return [];
    return manifest.mods
      .filter((m) => m.required || (m.optional && includeOptional))
      .map((m) => m.id);
  }, [manifest, includeOptional]);

  const batchActive =
    activeBatch &&
    !activeBatch.postBatchDone &&
    activeBatch.mods.some(
      (m) => m.status !== "done" && m.status !== "failed" && m.status !== "skipped"
    );
  const allInstalled = useMemo(() => {
    if (!manifest) return false;
    const target = manifest.mods.filter((m) => m.required || (m.optional && includeOptional));
    return target.length > 0 && target.every((m) => statusById.get(m.id)?.installed);
  }, [manifest, includeOptional, statusById]);

  const isBusy = running || !!batchActive;

  const runEssentials = async () => {
    if (!manifest || running) return;
    setRunning(true);
    setError(null);
    setProgressStep("Preparing essentials…");

    const modsToQueue = manifest.mods.filter((m) => selectedModIds.includes(m.id));
    startBatch({
      manifestId: manifest.id,
      name: manifest.display_name,
      gameDomain: domain,
      profile,
      mods: modsToQueue.map((m) => ({
        id: m.id,
        name: m.name,
        optional: m.optional,
        status: "pending" as const,
      })),
    });

    try {
      if (includeSetup) {
        setProgressStep("Running setup fixes (Proton, F4SE, plugins)…");
        await api.applyEssentialFixes(profileId);
        markSetupDone();
      } else {
        markSetupDone();
      }

      setProgressStep("Queuing recommended mods…");
      const queued = await api.queueGameEssentialMods(profileId, selectedModIds);
      for (const item of queued) {
        const mod = manifest.mods.find((m) => m.id === item.essential_id);
        const statusMod = statusById.get(item.essential_id);
        const installPreset = resolveEssentialInstallPreset(
          statusMod ?? { kind: mod?.kind, install_preset: mod?.install_preset }
        );
        registerPendingInstall(item.download.id, {
          source: "essentials",
          modId: item.download.mod_id,
          modName: item.download.mod_name || mod?.name,
          installPreset,
        });
        bindDownload(item.essential_id, item.download.id);
        setProgress(item.download);
      }

      if (queued.length === 0) {
        setProgressStep("Finishing configuration…");
        await api.finishGameEssentials(profileId);
        markPostBatchDone();
      }

      refreshStatus();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
      setProgressStep(null);
    }
  };

  if (!manifest) return null;

  const optionalCount = manifest.mods.filter((m) => m.optional).length;

  return (
    <Card className="border-[var(--color-primary)]/35 bg-gradient-to-br from-[var(--color-card)] to-[var(--color-secondary)]/20">
      <CardContent className="space-y-4 p-4 md:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Sparkles className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
              One-Click Essentials
            </h3>
            <p className="mt-1 text-sm leading-relaxed text-[var(--color-muted)]">
              {manifest.description}
            </p>
          </div>
          <Button
            onClick={() => void runEssentials()}
            loading={isBusy}
            disabled={isBusy || allInstalled}
            data-focusable="true"
            className="min-h-11 shrink-0 px-6 text-base"
          >
            {allInstalled ? "Essentials installed" : "Install Essentials"}
          </Button>
        </div>

        <div className="flex flex-wrap gap-4 text-sm">
          <label className="flex items-center gap-2">
            <Switch checked={includeSetup} onCheckedChange={setIncludeSetup} disabled={isBusy} />
            Include setup fixes
          </label>
          {optionalCount > 0 && (
            <label className="flex items-center gap-2">
              <Switch
                checked={includeOptional}
                onCheckedChange={setIncludeOptional}
                disabled={isBusy}
              />
              Include optional body mods ({optionalCount})
            </label>
          )}
        </div>

        <button
          type="button"
          className="flex w-full items-center justify-between rounded-lg border border-[var(--color-border)] px-3 py-2 text-left text-sm"
          onClick={() => setShowPreview((v) => !v)}
          data-focusable="true"
        >
          <span className="font-medium">What&apos;s included</span>
          {showPreview ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>

        {showPreview && (
          <ul className="space-y-2 text-sm">
            {includeSetup &&
              manifest.setup_steps.map((step) => (
                <li
                  key={step.id}
                  className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
                >
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-muted)]" />
                  <span>{step.label}</span>
                </li>
              ))}
            {manifest.mods
              .filter((m) => m.required || (m.optional && includeOptional))
              .map((mod) => {
                const st = statusById.get(mod.id);
                return (
                  <li
                    key={mod.id}
                    className="flex items-start gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
                  >
                    {st?.installed ? (
                      <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-success)]" />
                    ) : st?.downloading || isBusy ? (
                      <Loader2 className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
                    ) : (
                      <span className="mt-0.5 h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]" />
                    )}
                    <span className="min-w-0 flex-1">
                      <span className="block font-medium">{mod.name}</span>
                      {mod.description && (
                        <span className="text-xs text-[var(--color-muted)]">{mod.description}</span>
                      )}
                    </span>
                    {mod.optional && (
                      <span className="text-[10px] uppercase tracking-wide text-[var(--color-muted)]">
                        Optional
                      </span>
                    )}
                  </li>
                );
              })}
          </ul>
        )}

        {(isBusy && progressStep) && (
          <p className="flex items-center gap-2 text-sm text-[var(--color-primary)]">
            <Loader2 className="h-4 w-4 animate-spin" />
            {progressStep}
          </p>
        )}

        {error && <p className="text-sm text-[var(--color-danger)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
