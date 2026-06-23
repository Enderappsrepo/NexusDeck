import { useCallback, useEffect, useState } from "react";
import { Volume2, VolumeX, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProtonLogPanel } from "@/components/proton/ProtonLogPanel";
import { useProtonLogger } from "@/hooks/useProtonLogger";
import { useWakeLock } from "@/hooks/useWakeLock";
import { api } from "@/lib/commands";
import type { BethesdaAudioStatus } from "@/lib/nexus/types";

const BETHESDA_DOMAINS = new Set(["fallout4", "skyrimspecialedition"]);

export function VoiceAudioPanel({
  profileId,
  gameDomain,
}: {
  profileId: string;
  gameDomain: string;
}) {
  const [status, setStatus] = useState<BethesdaAudioStatus | null>(null);
  const [fixing, setFixing] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [logPath, setLogPath] = useState<string | null>(null);
  const { lines: protonLogLines, clear: clearProtonLog } = useProtonLogger(fixing, "audio");
  useWakeLock(fixing, "Applying voice audio fix");

  const refresh = useCallback(() => {
    if (!BETHESDA_DOMAINS.has(gameDomain)) {
      setStatus(null);
      return;
    }
    api
      .getBethesdaAudioStatus(profileId)
      .then(setStatus)
      .catch(() => setStatus(null));
  }, [profileId, gameDomain]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  if (!status?.applicable) return null;

  const applyFix = async () => {
    setFixing(true);
    setError(null);
    setMessage(null);
    setLogPath(null);
    clearProtonLog();
    try {
      const result = await api.fixBethesdaAudio(profileId);
      setStatus(result);
      if (result.log_path) setLogPath(result.log_path);
      setMessage(
        result.ready
          ? "Voice audio fix applied. Launch the game to test NPC dialogue."
          : result.message ?? "Fix partially applied — check Troubleshoot for details."
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setFixing(false);
    }
  };

  return (
    <section className="overflow-hidden rounded-2xl border border-[var(--color-border)] bg-[image:var(--gradient-surface)]">
      <div className="flex flex-wrap items-start justify-between gap-4 p-5">
        <div className="flex min-w-0 items-center gap-3">
          <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-primary)]/15 text-[var(--color-primary)]">
            {status.ready ? <Volume2 className="h-6 w-6" /> : <VolumeX className="h-6 w-6" />}
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <h3 className="text-lg font-bold">Voice &amp; music audio</h3>
              {status.ready ? (
                <Badge variant="success">Configured</Badge>
              ) : (
                <Badge variant="warning">Fix recommended</Badge>
              )}
            </div>
            <p className="text-sm text-[var(--color-muted)]">
              {status.ready
                ? "Proton audio is configured for NPC dialogue and music."
                : "Gunshots work but no NPC voices? NexusDeck installs XACT and sets xaudio2 in your Proton prefix."}
            </p>
          </div>
        </div>
        {!status.ready && (
          <Button size="sm" onClick={applyFix} loading={fixing} data-focusable="true">
            Fix voice audio
          </Button>
        )}
      </div>

      {!status.ready && (
        <div className="border-t border-[var(--color-border)] bg-[var(--color-secondary)]/20 px-5 py-3 text-xs text-[var(--color-muted)]">
          Applied automatically when you launch from NexusDeck. Use the button above if you still
          have silent dialogue, or launch the game from Steam without going through NexusDeck first.
        </div>
      )}

      {(message || error) && (
        <div className="border-t border-[var(--color-border)] px-5 py-3 text-sm">
          {error ? (
            <p className="text-[var(--color-danger)]">{error}</p>
          ) : (
            <p className="flex items-center gap-2 text-[var(--color-muted)]">
              {fixing && <Loader2 className="h-4 w-4 animate-spin" />}
              {message}
            </p>
          )}
        </div>
      )}

      {(fixing || protonLogLines.length > 0 || logPath) && (
        <div className="border-t border-[var(--color-border)] px-5 py-3">
          <ProtonLogPanel
            lines={protonLogLines}
            logPath={logPath}
            defaultOpen={fixing}
            title="Audio fix log"
          />
        </div>
      )}
    </section>
  );
}
