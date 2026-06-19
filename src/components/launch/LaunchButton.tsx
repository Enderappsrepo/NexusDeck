import { useEffect, useState } from "react";
import { Play, ChevronDown, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useLaunchStore } from "@/stores/launchStore";
import { LaunchConfirmDialog } from "./LaunchConfirmDialog";
import { QuickLaunchMenu } from "./QuickLaunchMenu";
import { LaunchOptionsDialog } from "./LaunchOptionsDialog";

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
  } = useLaunchStore();
  const [quickOpen, setQuickOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingConfigId, setPendingConfigId] = useState<string | undefined>();
  const [validationWarnings, setValidationWarnings] = useState<string[]>([]);

  const running = runningByProfile[profileId]?.running;

  useEffect(() => {
    loadConfigs(profileId);
  }, [profileId, loadConfigs]);

  useEffect(() => {
    const handler = () => setQuickOpen(true);
    window.addEventListener("nexusdeck-quick-launch", handler);
    return () => window.removeEventListener("nexusdeck-quick-launch", handler);
  }, []);

  const runLaunch = async (configId?: string) => {
    try {
      const validation = await validateLaunch(profileId, configId);
      if (validation.blockers.length > 0) {
        return;
      }
      if (settings.always_ask_before_launch || validation.warnings.length > 0) {
        setPendingConfigId(configId);
        setValidationWarnings(validation.warnings.map((w) => w.message));
        setConfirmOpen(true);
        return;
      }
      await launch(profileId, configId);
    } catch {
      /* toast handled in store */
    }
  };

  const handleConfirm = async () => {
    setConfirmOpen(false);
    try {
      await launch(profileId, pendingConfigId);
    } catch {
      /* toast handled */
    }
  };

  if (compact) {
    return (
      <>
        <Button
          size="lg"
          className={className}
          loading={launching}
          disabled={running}
          onClick={() => runLaunch()}
          data-launch-primary="true"
        >
          <Play className="h-5 w-5" />
          {running ? "Running" : "Launch Game"}
        </Button>
        <LaunchConfirmDialog
          open={confirmOpen}
          onOpenChange={setConfirmOpen}
          warnings={validationWarnings}
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
          loading={launching}
          disabled={running}
          onClick={() => runLaunch()}
          data-launch-primary="true"
        >
          {launching ? (
            <>
              <Loader2 className="h-6 w-6 animate-spin" />
              {launchStage === "syncing_plugins"
                ? "Syncing mods…"
                : launchStage === "validating"
                  ? "Checking…"
                  : "Launching…"}
            </>
          ) : running ? (
            "Game Running"
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
        warnings={validationWarnings}
        onConfirm={handleConfirm}
      />
    </>
  );
}
