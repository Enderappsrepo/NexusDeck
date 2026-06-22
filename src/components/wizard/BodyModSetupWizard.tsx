import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import { Link } from "@tanstack/react-router";
import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  Sparkles,
  Shirt,
} from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import type { BodySetupStatus } from "@/lib/nexus/types";
import { useDownloadsStore, useInstallQueueStore } from "@/stores";
import { cn } from "@/lib/utils";

const STEPS = ["intro", "cbbe", "bodyslide", "build", "done"] as const;
type WizardStep = (typeof STEPS)[number];

interface BodyModSetupWizardProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  gameDomain: string;
}

export function BodyModSetupWizard({
  open,
  onOpenChange,
  profileId,
  gameDomain,
}: BodyModSetupWizardProps) {
  const [step, setStep] = useState<WizardStep>("intro");
  const [status, setStatus] = useState<BodySetupStatus | null>(null);
  const [busy, setBusy] = useState<"cbbe" | "bodyslide" | "launch" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const setProgress = useDownloadsStore((s) => s.setProgress);
  const registerPendingInstall = useInstallQueueStore((s) => s.registerPendingInstall);

  const refresh = useCallback(() => {
    api.getBodySetupStatus(profileId).then(setStatus).catch(() => setStatus(null));
  }, [profileId]);

  useEffect(() => {
    if (!open) return;
    refresh();
    const handler = () => refresh();
    window.addEventListener("nexusdeck-mod-installed", handler);
    return () => window.removeEventListener("nexusdeck-mod-installed", handler);
  }, [open, refresh]);

  useEffect(() => {
    if (!open || !status) return;
    if (status.presets_built) setStep("done");
    else if (status.bodyslide_installed) setStep("build");
    else if (status.cbbe_installed) setStep("bodyslide");
  }, [open, status?.cbbe_installed, status?.bodyslide_installed, status?.presets_built]);

  const stepIndex = STEPS.indexOf(step);
  const canNext = step !== "done";

  const installCbbe = async () => {
    setBusy("cbbe");
    setError(null);
    setMessage(null);
    try {
      const progress = await api.queueCbbeInstall(profileId);
      registerPendingInstall(progress.id, { source: "cbbe" });
      setProgress(progress);
      setMessage("Downloading CBBE — use the FOMOD wizard when install starts.");
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const installBodySlide = async () => {
    setBusy("bodyslide");
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
      setBusy(null);
    }
  };

  const launchBodySlide = async () => {
    setBusy("launch");
    setError(null);
    setMessage(null);
    try {
      setMessage(await api.launchBodyslide(profileId));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const openNexus = (url?: string | null) => {
    if (url) void openUrl(url);
  };

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Body mod setup wizard"
      className="max-w-lg"
    >
      <div className="mb-4 flex items-center gap-2">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
          <Shirt className="h-5 w-5" />
        </div>
        <div className="flex flex-wrap gap-1">
          {STEPS.map((s, i) => (
            <Badge
              key={s}
              variant={i <= stepIndex ? "default" : "muted"}
              className={cn("text-xs capitalize", i > stepIndex && "opacity-50")}
            >
              {s === "cbbe" ? "CBBE" : s}
            </Badge>
          ))}
        </div>
      </div>

      {step === "intro" && (
        <div className="space-y-3 text-sm text-[var(--color-muted)]">
          <p>
            This wizard walks you through CBBE → BodySlide → Batch Build so outfit mods work on
            Steam Deck.
          </p>
          <p>Each step auto-detects when complete. You can close and resume anytime.</p>
        </div>
      )}

      {step === "cbbe" && status && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Install a body framework (CBBE). The FOMOD installer lets you pick body shape and
            physics options.
          </p>
          {status.cbbe_installed ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-success)]">
              <CheckCircle2 className="h-4 w-4" />
              Body mod detected
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status.can_one_click_cbbe && (
                <Button size="sm" onClick={installCbbe} loading={busy === "cbbe"} data-focusable="true">
                  <Download className="h-4 w-4" />
                  One-Click CBBE
                </Button>
              )}
              {status.nexus_cbbe_url && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openNexus(status.nexus_cbbe_url)}
                  data-focusable="true"
                >
                  <ExternalLink className="h-4 w-4" />
                  Nexus page
                </Button>
              )}
              <Button variant="outline" size="sm" asChild data-focusable="true">
                <Link to="/games/$domain/mods" params={{ domain: gameDomain }}>
                  Browse mods
                </Link>
              </Button>
            </div>
          )}
        </div>
      )}

      {step === "bodyslide" && status && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            BodySlide builds body meshes from your CBBE preset. One-click install deploys to{" "}
            <span className="font-mono">Data/CalienteTools/BodySlide</span>.
          </p>
          {status.bodyslide_installed ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-success)]">
              <CheckCircle2 className="h-4 w-4" />
              BodySlide installed
            </p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {status.can_one_click_install && (
                <Button
                  size="sm"
                  onClick={installBodySlide}
                  loading={busy === "bodyslide"}
                  data-focusable="true"
                >
                  <Download className="h-4 w-4" />
                  One-Click BodySlide
                </Button>
              )}
              {status.nexus_bodyslide_url && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => openNexus(status.nexus_bodyslide_url)}
                  data-focusable="true"
                >
                  <ExternalLink className="h-4 w-4" />
                  Nexus page
                </Button>
              )}
            </div>
          )}
        </div>
      )}

      {step === "build" && status && (
        <div className="space-y-4">
          <p className="text-sm text-[var(--color-muted)]">
            Launch BodySlide, select your CBBE preset, then click <strong>Batch Build</strong>.
            Output meshes land in <span className="font-mono">Data/meshes/</span>.
          </p>
          {status.presets_built ? (
            <p className="flex items-center gap-2 text-sm text-[var(--color-success)]">
              <CheckCircle2 className="h-4 w-4" />
              Body meshes detected
            </p>
          ) : (
            <Button
              size="sm"
              onClick={launchBodySlide}
              loading={busy === "launch"}
              data-focusable="true"
            >
              <Sparkles className="h-4 w-4" />
              Launch BodySlide
            </Button>
          )}
        </div>
      )}

      {step === "done" && (
        <p className="text-sm text-[var(--color-success)]">
          Setup complete — launch the game and verify your character body in-game.
        </p>
      )}

      {(message || error) && (
        <p
          className={cn(
            "mt-4 text-sm",
            error ? "text-[var(--color-danger)]" : "text-[var(--color-muted)]"
          )}
        >
          {error ?? message}
        </p>
      )}

      <div className="mt-6 flex justify-between gap-2">
        <Button
          variant="outline"
          disabled={stepIndex === 0}
          onClick={() => setStep(STEPS[stepIndex - 1])}
          data-focusable="true"
        >
          <ChevronLeft className="h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
            Close
          </Button>
          {canNext && (
            <Button
              onClick={() => setStep(STEPS[Math.min(stepIndex + 1, STEPS.length - 1)])}
              data-focusable="true"
            >
              Next
              <ChevronRight className="h-4 w-4" />
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
