import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import { CheckCircle2, Loader2, Wrench } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/commands";
import { cn } from "@/lib/utils";
import type { EssentialFixStepResult, EssentialFixesManifest } from "@/lib/nexus/types";
import { useWakeLock } from "@/hooks/useWakeLock";

interface EssentialFixesPanelProps {
  profileId: string;
  domain: string;
}

export function EssentialFixesPanel({ profileId, domain }: EssentialFixesPanelProps) {
  const [manifest, setManifest] = useState<EssentialFixesManifest | null>(null);
  const [running, setRunning] = useState(false);
  const [progressStep, setProgressStep] = useState<string | null>(null);
  const [results, setResults] = useState<EssentialFixStepResult[] | null>(null);

  useWakeLock(running, "Installing essential fixes");

  useEffect(() => {
    api
      .getEssentialFixesManifest(domain)
      .then(setManifest)
      .catch(() => setManifest(null));
  }, [domain]);

  useEffect(() => {
    const unsubs: Array<() => void> = [];
    listen<{ step: string; message: string }>("essential-fixes:progress", (e) => {
      setProgressStep(e.payload.message || e.payload.step);
    }).then((u) => unsubs.push(u));
    listen("essential-fixes:complete", () => {
      setRunning(false);
      setProgressStep(null);
    }).then((u) => unsubs.push(u));
    return () => unsubs.forEach((u) => u());
  }, []);

  const runAll = async () => {
    setRunning(true);
    setResults(null);
    setProgressStep("Starting…");
    try {
      const result = await api.applyEssentialFixes(profileId);
      setResults(result.steps);
    } catch (e) {
      setResults([
        {
          id: "error",
          label: "Essential fixes",
          success: false,
          skipped: false,
          message: e instanceof Error ? e.message : String(e),
        },
      ]);
    } finally {
      setRunning(false);
      setProgressStep(null);
    }
  };

  if (!manifest) return null;

  return (
    <Card className="border-[var(--color-primary)]/30 bg-[var(--color-card)]">
      <CardContent className="space-y-4 p-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="flex items-center gap-2 text-lg font-semibold">
              <Wrench className="h-5 w-5 text-[var(--color-primary)]" />
              {manifest.display_name}
            </h3>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              One-click Proton deps, script extender, audio, and safe autofixes.
            </p>
          </div>
          <Button
            onClick={() => void runAll()}
            loading={running}
            disabled={running}
            data-focusable="true"
            className="shrink-0"
          >
            Install All Essentials
          </Button>
        </div>

        <ul className="space-y-2 text-sm">
          {manifest.steps.map((step) => {
            const done = results?.find((r) => r.id === step.id);
            return (
              <li
                key={step.id}
                className="flex items-center gap-2 rounded-lg border border-[var(--color-border)] px-3 py-2"
              >
                {running && progressStep?.includes(step.label) ? (
                  <Loader2 className="h-4 w-4 shrink-0 animate-spin text-[var(--color-primary)]" />
                ) : done?.success ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0 text-[var(--color-success)]" />
                ) : (
                  <span className="h-4 w-4 shrink-0 rounded-full border border-[var(--color-border)]" />
                )}
                <span className="flex-1">{step.label}</span>
                {done && (
                  <span
                    className={cn(
                      "text-xs",
                      done.success ? "text-[var(--color-muted)]" : "text-[var(--color-danger)]"
                    )}
                  >
                    {done.skipped ? "OK" : done.message.slice(0, 48)}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      </CardContent>
    </Card>
  );
}
