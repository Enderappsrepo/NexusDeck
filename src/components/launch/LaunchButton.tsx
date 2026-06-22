import { useEffect, useState } from "react";
import { Play, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLaunchStore } from "@/stores/launchStore";
import { LaunchConfirmDialog } from "./LaunchConfirmDialog";
import { QuickLaunchMenu } from "./QuickLaunchMenu";
import { LaunchOptionsDialog } from "./LaunchOptionsDialog";
import type { LaunchCheckItem } from "@/lib/nexus/types";

interface LaunchButtonProps {
  profileId: string;
  gameDomain: string;
  compact?: boolean;
  className?: string;
}

export function LaunchButton({
  profileId,
  gameDomain,
  compact = false,
  className,
}: LaunchButtonProps) {
  const {
    launching,
    launchStage,
    runningByProfile,
    settings,
    loadConfigs,
    validateLaunch,
    launch,
    isAnyGameRunning,
  } = useLaunchStore();
  const [validating, setValidating] = useState(false);
  const [quickOpen, setQuickOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<string | undefined>();
  const [validationChecks, setValidationChecks] = useState<LaunchCheckItem[]>([]);

  const running = runningByProfile[profileId]?.running;
  const busy = validating || launching;
  const launchBlocked = busy || !!running;
  const anotherGameActive = isAnyGameRunning() && !running && !busy;

  useEffect(() => {
    loadConfigs(profileId);
  }, [profileId, loadConfigs]);

  useEffect(() => {
    const handler = () => setQuickOpen(true);
    window.addEventListener("nexusdeck-quick-launch", handler);
    return () => window.removeEventListener("nexusdeck-quick-launch", handler);
  }, []);

  const runLaunch = async (configId?: string) => {
    if (launchBlocked) return;

    setValidating(true);
    try {
      const validation = await validateLaunch(profileId, configId);
      if (validation.blockers.length > 0) {
        useLaunchStore.getState().addToast(
          "Launch blocked",
          validation.blockers[0].message,
          "error"
        );
        return;
      }
      if (settings.always_ask_before_launch || validation.warnings.length > 0) {
        setPendingConfigId(configId);
        setValidationChecks(validation.warnings);
        setConfirmOpen(true);
        return;
      }
      await launch(profileId, configId, { skip_validation: true });
    } catch {
      /* toast handled in store */
    } finally {
      setValidating(false);
    }
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      await launch(profileId, pendingConfigId, { skip_validation: true });
    } catch {
      /* toast handled */
    }
  };

  const statusLabel = busy
    ? launchStage === "syncing_plugins"
      ? "Syncing mods…"
      : validating || launchStage === "validating"
        ? "Checking…"
        : "Launching…"
    : running
      ? "Game Running"
      : anotherGameActive
        ? "Another Game Active"
        : null;

  if (compact) {
    return (
      <>
        <Button
          size="lg"
          className={className}
          loading={busy}
          disabled={busy || !!running}
          onClick={() => runLaunch()}
          data-launch-primary="true"
        >
          <Play className="h-5 w-5" />
          {statusLabel ?? "Launch Game"}
        </Button>
        <LaunchConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          checks={validationChecks}
          gameDomain={gameDomain}
          onConfirm={handleConfirm}
        />
      </>
    );
  }

  return (
    <>
      <div className={`flex flex-wrap items-center gap-3 ${className ?? ""}`}>
        <Button
          size="lg"
          className="min-h-[64px] min-w-[220px] flex-1 text-xl shadow-[var(--shadow-md)] sm:flex-none"
          loading={busy}
          disabled={busy || !!running}
          onClick={() => runLaunch()}
          data-launch-primary="true"
        >
          {busy ? (
            statusLabel
          ) : running ? (
            "Game Running"
          ) : anotherGameActive ? (
            "Another Game Active"
          ) : (
            <>
              <Play className="h-6 w-6 fill-current" />
              Launch Game
            </>
          )}
        </Button>
        <Button
          variant="secondary"
          size="lg"
          className="min-h-[64px]"
          onClick={() => setQuickOpen(true)}
          disabled={busy || !!running}
          data-focusable="true"
        >
          Quick Launch
          <ChevronDown className="h-5 w-5" />
        </Button>
        <Button
          variant="outline"
          size="lg"
          className="min-h-[64px]"
          onClick={() => setOptionsOpen(true)}
          data-focusable="true"
        >
          Options
        </Button>
      </div>

      <QuickLaunchMenu
        open={quickOpen}
        onOpenChange={setQuickOpen}
        profileId={profileId}
        onSelect={(configId) => {
          setQuickOpen(false);
          runLaunch(configId);
        }}
      />

      <LaunchOptionsDialog
        open={optionsOpen}
        onOpenChange={setOptionsOpen}
        profileId={profileId}
        gameDomain={gameDomain}
      />

      <LaunchConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        checks={validationChecks}
        gameDomain={gameDomain}
        onConfirm={handleConfirm}
      />
    </>
  );
}
