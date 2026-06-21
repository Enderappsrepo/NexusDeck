import { useCallback, useEffect, useState } from "react";
import { openUrl } from "@tauri-apps/plugin-opener";
import {
  CheckCircle2,
  Circle,
  ExternalLink,
  Shirt,
  Sparkles,
  AlertCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { api } from "@/lib/commands";
import type { BodySetupStatus } from "@/lib/nexus/types";
import { cn } from "@/lib/utils";

const STEP_ICONS = {
  done: CheckCircle2,
  action_needed: AlertCircle,
  pending: Circle,
};

export function BodySlideSetupPanel({ profileId }: { profileId: string }) {
  const [status, setStatus] = useState<BodySetupStatus | null>(null);
  const [launching, setLaunching] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [expandedStep, setExpandedStep] = useState<string | null>(null);

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

  const showPanel = status.cbbe_installed || status.bodyslide_installed;
  if (!showPanel) return null;

  const launch = async () => {
    setLaunching(true);
    setError(null);
    setMessage(null);
    try {
      setMessage(await api.launchBodyslide(profileId));
      refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLaunching(false);
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
              <div className="flex items-center gap-2">
                <h3 className="text-lg font-bold">Body &amp; Outfit Setup</h3>
                {status.presets_built && <Badge variant="success">Ready</Badge>}
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                CBBE requires BodySlide to build body meshes before they appear in-game.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {!status.bodyslide_installed && status.nexus_bodyslide_url && (
              <Button variant="secondary" size="sm" onClick={openNexus}>
                <ExternalLink className="h-4 w-4" />
                Install BodySlide
              </Button>
            )}
            {status.bodyslide_installed && (
              <Button size="sm" onClick={launch} loading={launching}>
                <Sparkles className="h-4 w-4" />
                Launch BodySlide
              </Button>
            )}
          </div>
        </div>
      </div>

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
            <p className="text-[var(--color-muted)]">{message}</p>
          )}
        </div>
      )}

      <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-5 py-3 text-xs text-[var(--color-muted)]">
        On Steam Deck: use Desktop Mode for BodySlide, or pre-build presets on a PC and copy
        meshes to <span className="font-mono">Data/meshes/</span>.
      </div>
    </section>
  );
}
