import { createFileRoute, useNavigate, useParams } from "@tanstack/react-router";

import { useEffect, useState } from "react";

import { Button } from "@/components/ui/button";

import { Input } from "@/components/ui/input";

import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

import { StepIndicator } from "@/components/wizard/StepIndicator";

import { ScriptExtenderInstallDialog } from "@/components/wizard/ScriptExtenderInstallDialog";

import { useWizardStore } from "@/stores";

import { api } from "@/lib/commands";
import {
  getGameMeta,
  hasScriptExtender,
  loadSupportedGames,
} from "@/lib/games";
import type { GameCandidate, ScriptExtenderStatus, SupportedGameInfo } from "@/lib/nexus/types";



export const Route = createFileRoute("/games/$domain/setup")({

  component: SetupWizardPage,

});



function SetupWizardPage() {

  const { domain } = useParams({ from: "/games/$domain/setup" });

  const navigate = useNavigate();

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

  const [loading, setLoading] = useState(false);

  const [extenderDialogOpen, setExtenderDialogOpen] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);

  const gameMeta = getGameMeta(domain, supportedGames);
  const extenderLabel = gameMeta?.script_extender_label ?? "Script extender";
  const showExtenderStep = hasScriptExtender(domain, supportedGames);

  useEffect(() => {
    loadSupportedGames().then(setSupportedGames);
  }, []);



  useEffect(() => {

    reset();

    runDetect();

  }, [domain]);



  const runDetect = async () => {

    setLoading(true);

    const result = await api.runWizardStep(domain, "detect_game", {});

    setCandidates(result.data as GameCandidate[]);

    setMessage(result.message);

    if ((result.data as GameCandidate[]).length > 0) {

      const c = (result.data as GameCandidate[])[0];

      setGamePath(c.install_path);

      if (c.proton_prefix_path) setProtonPrefixPath(c.proton_prefix_path);

    }

    const staging = await api.runWizardStep(domain, "default_staging", {});

    setStagingPath((staging.data as { staging_path: string }).staging_path);

    setLoading(false);

  };



  const checkScriptExtender = async () => {
    if (!gamePath) return;
    const status =
      domain === "fallout4"
        ? await api.detectF4se(gamePath)
        : await api.detectScriptExtender(domain, gamePath);
    setF4seStatus(status);
    setMessage(status.message);
  };



  const nextStep = async () => {

    setLoading(true);

    try {

      if (step === 0) {

        await api.validateGamePath(domain, gamePath);

      } else if (step === 2 && showExtenderStep) {
        await checkScriptExtender();

      } else if (step === 4) {

        const result = await api.runWizardStep(domain, "test_deploy", { game_path: gamePath });

        setMessage(result.message);

        await api.createProfile({

          gameDomain: domain,

          name: profileName,

          gamePath,

          stagingPath,

          protonPrefixPath: protonPrefixPath || null,

        });

        navigate({ to: "/games/$domain", params: { domain } });

        return;

      }

      setStep(step + 1);

      if (step + 1 === 2 && showExtenderStep) await checkScriptExtender();

    } catch (e) {

      setMessage(e instanceof Error ? e.message : String(e));

    } finally {

      setLoading(false);

    }

  };



  const f4se = f4seStatus as ScriptExtenderStatus | null;



  return (

    <div className="mx-auto max-w-2xl">

      <h1 className="mb-2 text-3xl font-bold">
        Set up {gameMeta?.display_name ?? domain}
      </h1>

      <StepIndicator currentStep={step} className="mb-8" />



      <Card>

        <CardHeader>

          <CardTitle>

            Step {step + 1}:{" "}

            {["Game Path", "Staging Folder", showExtenderStep ? extenderLabel : "Verify", "Profile", "Test Deploy"][step]}

          </CardTitle>

          <CardDescription>{message}</CardDescription>

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
                <p className={f4se.installed ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>
                  {f4se.message}
                </p>
              ) : (
                <p>Checking for {extenderLabel}...</p>
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
                  You can continue without {extenderLabel}, but most mods will not work until it is installed.
                </p>
              )}
            </div>
          )}

          {step === 2 && !showExtenderStep && (
            <p className="text-[var(--color-muted)]">
              No script extender check is required for this game. Continue to create your profile.
            </p>
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

              Ready to save your profile. NexusDeck will use this configuration for mod downloads and deployment.

            </p>

          )}



          <div className="flex gap-3 pt-4">

            {step > 0 && (

              <Button variant="outline" onClick={() => setStep(step - 1)} disabled={loading}>

                Back

              </Button>

            )}

            <Button size="lg" className="flex-1" onClick={nextStep} disabled={loading}>

              {loading ? "Working..." : step === 4 ? "Finish Setup" : "Continue"}

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


