import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/commands";
import type { NexusDeckSteamShortcutResult } from "@/lib/nexus/types";

type Phase = "checking" | "waiting" | "adding" | "done" | "error";

interface AddToSteamDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  displayName: string;
  onSuccess?: (result: NexusDeckSteamShortcutResult) => void;
}

export function AddToSteamDialog({
  open,
  onOpenChange,
  displayName,
  onSuccess,
}: AddToSteamDialogProps) {
  const [phase, setPhase] = useState<Phase>("checking");
  const [message, setMessage] = useState<string | null>(null);
  const [result, setResult] = useState<NexusDeckSteamShortcutResult | null>(null);
  const [quitting, setQuitting] = useState(false);
  const cancelledRef = useRef(false);

  const runAutomatedAdd = useCallback(async () => {
    cancelledRef.current = false;
    setPhase("checking");
    setMessage(null);
    setResult(null);

    try {
      const steamRunning = await api.isSteamRunning();
      if (cancelledRef.current) return;

      if (steamRunning) {
        setPhase("waiting");
        setMessage(
          "Close Steam completely before we add NexusDeck. On Steam Deck: Steam menu → Exit, or Power → Exit."
        );
        const added = await api.addNexusDeckToSteamWhenReady(
          displayName.trim() || "NexusDeck",
          180
        );
        if (cancelledRef.current) return;
        setResult(added);
        setPhase("done");
        setMessage(
          added.already_existed
            ? "NexusDeck is already in your Steam library. Open Steam to launch it."
            : "Added to Steam! Open Steam from Desktop Mode — NexusDeck will appear in your library."
        );
        onSuccess?.(added);
        return;
      }

      setPhase("adding");
      const added = await api.addNexusDeckToSteam(displayName.trim() || "NexusDeck");
      if (cancelledRef.current) return;
      setResult(added);
      setPhase("done");
      setMessage(
        added.already_existed
          ? "NexusDeck is already in your Steam library."
          : "Added to Steam! Open Steam to launch NexusDeck from your library."
      );
      onSuccess?.(added);
    } catch (e) {
      if (cancelledRef.current) return;
      setPhase("error");
      setMessage(e instanceof Error ? e.message : String(e));
    }
  }, [displayName, onSuccess]);

  useEffect(() => {
    if (open) {
      void runAutomatedAdd();
    } else {
      cancelledRef.current = true;
      setPhase("checking");
      setMessage(null);
      setResult(null);
    }
    return () => {
      cancelledRef.current = true;
    };
  }, [open, runAutomatedAdd]);

  const quitSteam = async () => {
    setQuitting(true);
    try {
      await api.quitSteamClient();
      setMessage("Sent quit request to Steam — waiting for it to close…");
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setQuitting(false);
    }
  };

  const busy = phase === "checking" || phase === "waiting" || phase === "adding";

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Add NexusDeck to Steam"
      description="NexusDeck will be added to your Steam library automatically once Steam is closed."
      dismissible={!busy}
      disableOutsideClose={busy}
    >
      <div className="space-y-4">
        {phase === "waiting" && (
          <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 text-sm">
            <p className="font-medium text-[var(--color-warning)]">Please close Steam first</p>
            <p className="mt-2 text-[var(--color-muted)]">
              Steam must fully exit so we can update your library safely. NexusDeck will add itself
              automatically as soon as Steam closes.
            </p>
            <ol className="mt-3 list-decimal space-y-1 pl-5 text-[var(--color-muted)]">
              <li>Switch to Desktop Mode if you are in Gaming Mode</li>
              <li>Steam menu → Exit (or Power → Exit on Deck)</li>
              <li>Wait — this dialog will continue on its own</li>
            </ol>
          </div>
        )}

        {message && (
          <p
            className={
              phase === "error"
                ? "text-sm text-[var(--color-danger)]"
                : "text-sm text-[var(--color-muted)]"
            }
          >
            {busy && <Loader2 className="mr-2 inline h-4 w-4 animate-spin" />}
            {message}
          </p>
        )}

        {result && phase === "done" && (
          <p className="rounded-xl bg-[var(--color-secondary)] p-3 font-mono text-xs break-all">
            {result.launch_options
              ? `${result.executable} ${result.launch_options}`
              : result.executable}
          </p>
        )}

        <div className="flex flex-wrap gap-2">
          {phase === "waiting" && (
            <Button
              variant="secondary"
              onClick={() => void quitSteam()}
              loading={quitting}
              disabled={quitting}
              data-focusable="true"
            >
              Quit Steam for me
            </Button>
          )}
          {phase === "done" && (
            <Button onClick={() => onOpenChange(false)} data-focusable="true">
              Done
            </Button>
          )}
          {phase === "error" && (
            <>
              <Button onClick={() => void runAutomatedAdd()} data-focusable="true">
                Try again
              </Button>
              <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
                Cancel
              </Button>
            </>
          )}
          {!busy && phase !== "done" && phase !== "error" && (
            <Button variant="outline" onClick={() => onOpenChange(false)} data-focusable="true">
              Cancel
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
