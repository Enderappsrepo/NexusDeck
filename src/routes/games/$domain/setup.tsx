import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { ScriptExtenderInstallDialog } from "@/components/wizard/ScriptExtenderInstallDialog";
import { useWizardStore, useGamesStore } from "@/stores";
import { api } from "@/lib/commands";
import {
  getGameMeta,
  hasScriptExtender,
  isSupportedDomain,
  loadSupportedGames,
} from "@/lib/games";
import { resolveGameDomain, usePathname } from "@/lib/routeParams";
import type { GameCandidate, ScriptExtenderStatus, SupportedGameInfo } from "@/lib/nexus/types";

export const Route = createFileRoute("/games/$domain/setup")({
  component: SetupWizardPage,
});

function SetupWizardPage() {
  const pathname = usePathname();
  const domain = resolveGameDomain(Route.useParams().domain, pathname);
  const navigate = useNavigate();
  const loadProfiles = useGamesStore((s) => s.loadProfiles);
  const {
    step,
    gamePath,
    stagingPath,
    protonPrefixPath,
    profileName,
    f4seStatus,
    setStep,
    setGamePath,
    setStagingPath,
    setProtonPrefixPath,
    setProfileName,
    setF4seStatus,
    reset,
  } = useWizardStore();

  const [candidates, setCandidates] = useState<GameCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extenderDialogOpen, setExtenderDialogOpen] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);

  const gameMeta = getGameMeta(domain, supportedGames);
  const extenderLabel = gameMeta?.script_extender_label ?? "Script extender";
  const showExtenderStep = hasScriptExtender(domain);

  useEffect(() => {
    loadSupportedGames().then(setSupportedGames);
  }, []);

  useEffect(() => {
    if (!domain || !isSupportedDomain(domain)) return;

    let cancelled = false;

    async function init() {
      reset();
      setDetecting(false);
      setSubmitting(false);
      setMessage("");
      setCandidates([]);

      const meta = getGameMeta(domain);
      let prefilledPath = "";

      try {
        const existing = await api.getProfile(domain);
        if (cancelled) return;

        if (existing) {
          prefilledPath = existing.game_path;
          setGamePath(existing.game_path);
          setStagingPath(existing.staging_path);
          setProtonPrefixPath(existing.proton_prefix_path ?? "");
          setProfileName(existing.name);
        } else if (meta?.display_name) {
          setProfileName(meta.display_name);
        }
      } catch {
        if (meta?.display_name) {
          setProfileName(meta.display_name);
        }
      }

      await runDetect(prefilledPath);
    }

    void init();
    return () => {
      cancelled = true;
    };
  }, [domain]);

  const runDetect = async (keepPath = "") => {
    setDetecting(true);
    setMessage("");
    try {
      const result = await api.runWizardStep(domain, "detect_game", {});
      const found = (result.data as GameCandidate[]) ?? [];
      setCandidates(found);
      setMessage(
        found.length > 0
          ? result.message
          : keepPath
            ? "Using your saved game path. Scan again or edit below if needed."
            : "No Steam install found — enter your game folder path below."
      );

      if (found.length > 0 && !keepPath.trim()) {
        const c = found[0];
        setGamePath(c.install_path);
        if (c.proton_prefix_path) setProtonPrefixPath(c.proton_prefix_path);
      }

      const staging = await api.runWizardStep(domain, "default_staging", {});
      const defaultPath = (staging.data as { staging_path: string }).staging_path;
      setStagingPath(useWizardStore.getState().stagingPath.trim() || defaultPath);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not detect the game automatically. Enter the path manually."
      );
    } finally {
      setDetecting(false);
    }
  };

  const checkScriptExtender = async () => {
    if (!gamePath.trim()) return;
    try {
      const status =
        domain === "fallout4"
          ? await api.detectF4se(gamePath)
          : await api.detectScriptExtender(domain, gamePath);
      setF4seStatus(status);
      setMessage(status.message);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    }
  };

  const nextStepIndex = (from: number) => {
    let next = from + 1;
    if (next === 2 && !showExtenderStep) next = 3;
    return next;
  };

  const prevStepIndex = (from: number) => {
    let prev = from - 1;
    if (prev === 2 && !showExtenderStep) prev = 1;
    return prev;
  };

  const nextStep = async () => {
    setSubmitting(true);
    setMessage("");

    try {
      if (step === 0) {
        const path = gamePath.trim();
        if (!path) {
          setMessage("Enter the folder that contains your game executable.");
          return;
        }
        await api.validateGamePath(domain, path);
      } else if (step === 2 && showExtenderStep) {
        await checkScriptExtender();
      } else if (step === 3) {
        if (!profileName.trim()) {
          setMessage("Enter a profile name.");
          return;
        }
      } else if (step === 4) {
        const result = await api.runWizardStep(domain, "test_deploy", {
          game_path: gamePath,
        });
        setMessage(result.message);

        await api.createProfile({
          gameDomain: domain,
          name: profileName.trim(),
          gamePath: gamePath.trim(),
          stagingPath: stagingPath.trim(),
          protonPrefixPath: protonPrefixPath || null,
        });

        await loadProfiles();
        navigate({ to: "/games/$domain", params: { domain } });
        return;
      }

      const next = nextStepIndex(step);
      setStep(next);

      if (next === 2 && showExtenderStep) {
        await checkScriptExtender();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const f4se = f4seStatus as ScriptExtenderStatus | null;
  const busy = detecting || submitting;

  const stepLabels = [
    "Game Path",
    "Staging Folder",
    showExtenderStep ? extenderLabel : "Verify",
    "Profile",
    "Test Deploy",
  ];

  if (!domain || !isSupportedDomain(domain)) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h1 className="text-2xl font-bold">Game not recognized</h1>
        <p className="mt-4 text-[var(--color-muted)]">
          Pick a supported game from the games list to run setup.
        </p>
        <Link to="/games" className="mt-8 inline-block">
          <Button size="lg">Browse games</Button>
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="mb-2 text-3xl font-bold">
        Set up {gameMeta?.display_name ?? domain}
      </h1>
      <StepIndicator currentStep={step} className="mb-8" />

      <Card>
        <CardHeader>
          <CardTitle>
            Step {step + 1}: {stepLabels[step]}
          </CardTitle>
          <CardDescription>
            {detecting ? "Scanning for Steam installs…" : message}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {step === 0 && (
            <>
              {candidates.length > 0 && (
                <div className="space-y-2">
                  {candidates.map((c) => (
                    <Button
                      key={c.install_path}
                      variant={gamePath === c.install_path ? "default" : "secondary"}
                      className="w-full justify-start text-left"
                      onClick={() => {
                        setGamePath(c.install_path);
                        if (c.proton_prefix_path) setProtonPrefixPath(c.proton_prefix_path);
                      }}
                    >
                      {c.name}: {c.install_path}
                    </Button>
                  ))}
                </div>
              )}
              <Input
                placeholder="Path to game folder"
                value={gamePath}
                onChange={(e) => setGamePath(e.target.value)}
              />
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  void runDetect();
                }}
                disabled={detecting || submitting}
              >
                {detecting ? "Scanning…" : "Scan Steam again"}
              </Button>
            </>
          )}

          {step === 1 && (
            <Input
              placeholder="Mod staging / downloads folder"
              value={stagingPath}
              onChange={(e) => setStagingPath(e.target.value)}
            />
          )}

          {step === 2 && showExtenderStep && (
            <div className="space-y-4 rounded-xl bg-[var(--color-secondary)] p-4">
              {f4se ? (
                <p
                  className={
                    f4se.installed
                      ? "text-[var(--color-success)]"
                      : "text-[var(--color-warning)]"
                  }
                >
                  {f4se.message}
                </p>
              ) : (
                <p>Checking for {extenderLabel}…</p>
              )}
              {protonPrefixPath && (
                <p className="text-sm text-[var(--color-muted)]">
                  Proton prefix: {protonPrefixPath}
                </p>
              )}
              <div className="flex flex-wrap gap-3">
                <Button onClick={() => setExtenderDialogOpen(true)}>
                  {f4se?.installed ? `Manage ${extenderLabel}` : `Install ${extenderLabel}`}
                </Button>
                <Button variant="outline" onClick={checkScriptExtender}>
                  Re-check
                </Button>
              </div>
              {!f4se?.installed && (
                <p className="text-sm text-[var(--color-muted)]">
                  You can continue without {extenderLabel}, but most mods will not work until
                  it is installed.
                </p>
              )}
            </div>
          )}

          {step === 3 && (
            <Input
              placeholder="Profile name"
              value={profileName}
              onChange={(e) => setProfileName(e.target.value)}
            />
          )}

          {step === 4 && (
            <p className="text-[var(--color-muted)]">
              Ready to save your profile. NexusDeck will use this configuration for mod
              downloads and deployment.
            </p>
          )}

          <div className="flex gap-3 pt-4">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep(prevStepIndex(step))}
                disabled={submitting}
              >
                Back
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={nextStep} disabled={busy}>
              {submitting
                ? "Working…"
                : detecting
                  ? "Scanning…"
                  : step === 4
                    ? "Finish Setup"
                    : "Continue"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {showExtenderStep && (
        <ScriptExtenderInstallDialog
          open={extenderDialogOpen}
          onOpenChange={setExtenderDialogOpen}
          domain={domain}
          gamePath={gamePath}
          onInstalled={setF4seStatus}
        />
      )}
    </div>
  );
}
