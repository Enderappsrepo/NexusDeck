import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { open } from "@tauri-apps/plugin-dialog";
import { FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { StepIndicator } from "@/components/wizard/StepIndicator";
import { ScriptExtenderInstallDialog } from "@/components/wizard/ScriptExtenderInstallDialog";
import { ProtonDepsInstallProgress } from "@/components/proton/ProtonDepsInstallProgress";
import { useGamepadBackHandler } from "@/hooks/useGamepadRouter";
import { PROTON_DEPS_PACKAGES } from "@/lib/autofix-types";
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

const SKYRIM_APP_ID = 489830;

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
    modManager,
    f4seStatus,
    setStep,
    setGamePath,
    setStagingPath,
    setProtonPrefixPath,
    setProfileName,
    setModManager,
    setF4seStatus,
    reset,
  } = useWizardStore();

  const [candidates, setCandidates] = useState<GameCandidate[]>([]);
  const [message, setMessage] = useState("");
  const [detecting, setDetecting] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [extenderDialogOpen, setExtenderDialogOpen] = useState(false);
  const [supportedGames, setSupportedGames] = useState<SupportedGameInfo[]>([]);
  const [prefixMessage, setPrefixMessage] = useState("");
  const [protonMessage, setProtonMessage] = useState("");
  const [installingProton, setInstallingProton] = useState(false);
  const [stepActivity, setStepActivity] = useState<string | null>(null);

  const isSkyrimSe = domain === "skyrimspecialedition";
  const gameMeta = getGameMeta(domain, supportedGames);
  const extenderLabel = gameMeta?.script_extender_label ?? "Script extender";
  const showExtenderStep = hasScriptExtender(domain);

  const stepLabels = useMemo(() => {
    if (isSkyrimSe) {
      return [
        "Game Path",
        "Proton Prefix",
        "Proton Deps",
        "Staging",
        extenderLabel,
        "Mod Manager",
        "Profile",
        "Finish",
      ];
    }
    return [
      "Game Path",
      "Staging Folder",
      showExtenderStep ? extenderLabel : "Verify",
      "Profile",
      "Test Deploy",
    ];
  }, [isSkyrimSe, extenderLabel, showExtenderStep]);

  const finalStep = stepLabels.length - 1;

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
      setPrefixMessage("");
      setProtonMessage("");
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
          setModManager(existing.mod_manager ?? "direct");
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
            : "No Steam install found automatically — use Browse folder or paste the path below."
      );

      if (found.length > 0 && !keepPath.trim()) {
        const c = found[0];
        setGamePath(c.install_path);
        if (c.proton_prefix_path) setProtonPrefixPath(c.proton_prefix_path);
        if (isSkyrimSe && c.library_path) {
          const sd = await api.runWizardStep(domain, "sd_card_warning", {
            library_path: c.library_path,
          });
          if (sd.message) setMessage((m) => `${m}\n${sd.message}`);
        }
      }

      const staging = await api.runWizardStep(domain, "default_staging", {});
      const defaultPath = (staging.data as { staging_path: string }).staging_path;
      setStagingPath(useWizardStore.getState().stagingPath.trim() || defaultPath);
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "Could not detect the game automatically. Use Browse folder or enter the path manually."
      );
    } finally {
      setDetecting(false);
    }
  };

  const browseGameFolder = async () => {
    setMessage("");
    try {
      const selected = await open({
        directory: true,
        multiple: false,
        title: "Select your game folder",
        defaultPath: gamePath.trim() || undefined,
      });
      if (typeof selected !== "string") return;
      await api.validateGamePath(domain, selected);
      setGamePath(selected);
      setMessage("Game folder selected.");
    } catch (e) {
      setMessage(
        e instanceof Error
          ? e.message
          : "That folder does not look like a valid game install."
      );
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

  const runSkyrimPrefixCheck = async () => {
    const result = await api.runWizardStep(domain, "verify_prefix", {
      proton_prefix_path: protonPrefixPath || null,
    });
    setPrefixMessage(result.message);
    return result;
  };

  const runSkyrimProtonDeps = async () => {
    const pt = await api.detectProtontricks();
    if (!pt.available) {
      setProtonMessage(pt.message);
      return;
    }
    setInstallingProton(true);
    setProtonMessage("");
    try {
      const result = await api.installProtonDeps(
        domain,
        false,
        undefined,
        protonPrefixPath || undefined
      );
      setProtonMessage(result.message);
    } catch (e) {
      setProtonMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setInstallingProton(false);
    }
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
      }

      if (isSkyrimSe) {
        if (step === 1) {
          setStepActivity("Checking Proton prefix…");
          const prefix = await runSkyrimPrefixCheck();
          if (!prefix.success) {
            setStepActivity("Preparing Proton prefix (launch from Steam if needed)…");
            const boot = await api.runWizardStep(domain, "bootstrap_vanilla", {
              app_id: SKYRIM_APP_ID,
            });
            setPrefixMessage(boot.message);
          }
          setStepActivity("Checking Proton version…");
          const proton = await api.runWizardStep(domain, "check_proton_version", {
            app_id: SKYRIM_APP_ID,
          });
          setPrefixMessage((m) => `${m}\n${proton.message}`);
          setStepActivity(null);
        } else if (step === 2) {
          await runSkyrimProtonDeps();
        } else if (step === 4) {
          await checkScriptExtender();
        } else if (step === 6) {
          if (!profileName.trim()) {
            setMessage("Enter a profile name.");
            return;
          }
        } else if (step === finalStep) {
          await finishSetup();
          return;
        }
      } else {
        if (step === 2 && showExtenderStep) {
          await checkScriptExtender();
        } else if (step === 3) {
          if (!profileName.trim()) {
            setMessage("Enter a profile name.");
            return;
          }
        } else if (step === finalStep) {
          await finishSetup();
          return;
        }
      }

      const next = step + 1;
      setStep(next);

      if (isSkyrimSe && next === 4) {
        await checkScriptExtender();
      } else if (!isSkyrimSe && next === 2 && showExtenderStep) {
        await checkScriptExtender();
      }
    } catch (e) {
      setMessage(e instanceof Error ? e.message : String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const finishSetup = async () => {
    await api.runWizardStep(domain, "test_deploy", { game_path: gamePath });
    await api.createProfile({
      gameDomain: domain,
      name: profileName.trim(),
      gamePath: gamePath.trim(),
      stagingPath: stagingPath.trim(),
      protonPrefixPath: protonPrefixPath || null,
      modManager: modManager,
    });
    await loadProfiles();
    navigate({
      to: "/games/$domain/mods",
      params: { domain },
      search: { welcome: "1", modId: undefined },
    });
  };

  const f4se = f4seStatus as ScriptExtenderStatus | null;
  const busy = detecting || submitting;

  useGamepadBackHandler(() => {
    if (step > 0 && !busy) setStep(step - 1);
  });

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

  const renderStepBody = () => {
    if (step === 0) {
      return (
        <>
          {candidates.length > 0 && (
            <div className="space-y-2">
              {candidates.map((c) => (
                <Button
                  key={c.install_path}
                  variant={gamePath === c.install_path ? "default" : "secondary"}
                  className="w-full justify-start text-left"
                  data-focusable="true"
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
            placeholder="Path to game folder (e.g. …/steamapps/common/Skyrim Special Edition)"
            value={gamePath}
            onChange={(e) => setGamePath(e.target.value)}
            data-focusable="true"
          />
          <div className="flex flex-wrap gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void browseGameFolder()}
              disabled={detecting || submitting}
              data-focusable="true"
            >
              <FolderOpen className="h-4 w-4" />
              Browse folder
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void runDetect()}
              disabled={detecting || submitting}
              data-focusable="true"
            >
              {detecting ? "Scanning…" : "Scan Steam again"}
            </Button>
          </div>
        </>
      );
    }

    if (isSkyrimSe && step === 1) {
      return (
        <div className="space-y-3 rounded-xl bg-[var(--color-secondary)] p-4 text-sm">
          <p>Proton prefix: {protonPrefixPath || "Not detected yet"}</p>
          <p className="text-[var(--color-muted)]">
            Launch Skyrim once from Steam if the prefix is missing. DeckModFix will verify My Games folders.
          </p>
          {prefixMessage && <p>{prefixMessage}</p>}
          <Button variant="outline" size="sm" onClick={() => void runSkyrimPrefixCheck()} data-focusable="true">
            Re-check prefix
          </Button>
        </div>
      );
    }

    if (isSkyrimSe && step === 2) {
      return (
        <div className="space-y-3 rounded-xl bg-[var(--color-secondary)] p-4 text-sm">
          <p>Installs vcrun2019, .NET 4.8, and DirectX into the Proton prefix via protontricks.</p>
          {protonMessage && !installingProton && <p>{protonMessage}</p>}
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runSkyrimProtonDeps()}
            disabled={installingProton}
            data-focusable="true"
          >
            {installingProton ? "Installing…" : "Install dependencies now"}
          </Button>
          {installingProton && (
            <ProtonDepsInstallProgress
              active={installingProton}
              packages={PROTON_DEPS_PACKAGES[domain] ?? []}
            />
          )}
        </div>
      );
    }

    const stagingStep = isSkyrimSe ? 3 : 1;
    if (step === stagingStep) {
      return (
        <Input
          placeholder="Mod staging / downloads folder"
          value={stagingPath}
          onChange={(e) => setStagingPath(e.target.value)}
          data-focusable="true"
        />
      );
    }

    const extenderStep = isSkyrimSe ? 4 : 2;
    if (step === extenderStep && showExtenderStep) {
      return (
        <div className="space-y-4 rounded-xl bg-[var(--color-secondary)] p-4">
          {f4se ? (
            <p className={f4se.installed ? "text-[var(--color-success)]" : "text-[var(--color-warning)]"}>
              {f4se.message}
            </p>
          ) : (
            <p>Checking for {extenderLabel}…</p>
          )}
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => setExtenderDialogOpen(true)} data-focusable="true">
              {f4se?.installed ? `Manage ${extenderLabel}` : `Install ${extenderLabel}`}
            </Button>
            <Button variant="outline" onClick={() => void checkScriptExtender()} data-focusable="true">
              Re-check
            </Button>
          </div>
        </div>
      );
    }

    if (isSkyrimSe && step === 5) {
      return (
        <div className="flex flex-col gap-3">
          <Button
            variant={modManager === "mo2" ? "default" : "secondary"}
            className="w-full justify-start"
            onClick={() => setModManager("mo2")}
            data-focusable="true"
          >
            Mod Organizer 2 (recommended for large lists)
          </Button>
          <Button
            variant={modManager === "direct" ? "default" : "secondary"}
            className="w-full justify-start"
            onClick={() => setModManager("direct")}
            data-focusable="true"
          >
            Direct deploy (NexusDeck manages Data folder)
          </Button>
        </div>
      );
    }

    const profileStep = isSkyrimSe ? 6 : 3;
    if (step === profileStep) {
      return (
        <Input
          placeholder="Profile name"
          value={profileName}
          onChange={(e) => setProfileName(e.target.value)}
          data-focusable="true"
        />
      );
    }

    return (
      <p className="text-[var(--color-muted)]">
        Ready to save your profile.
        {isSkyrimSe
          ? " DeckModFix will run an initial diagnostic scan after setup."
          : " NexusDeck will use this configuration for mod downloads and deployment."}
      </p>
    );
  };

  return (
    <div className="mx-auto max-w-2xl" data-scroll-pane>
      <h1 className="mb-2 text-3xl font-bold">
        Set up {gameMeta?.display_name ?? domain}
        {isSkyrimSe && (
          <span className="ml-2 text-lg font-normal text-[var(--color-muted)]">DeckModFix</span>
        )}
      </h1>
      <StepIndicator currentStep={step} labels={stepLabels} className="mb-8" />

      <Card>
        <CardHeader>
          <CardTitle>
            Step {step + 1}: {stepLabels[step]}
          </CardTitle>
          <CardDescription>
            {stepActivity ??
              (detecting
                ? "Scanning for Steam installs…"
                : installingProton
                  ? "Installing Proton dependencies into your prefix…"
                  : message || prefixMessage || protonMessage)}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {renderStepBody()}

          <div className="flex gap-3 pt-4">
            {step > 0 && (
              <Button
                variant="outline"
                onClick={() => setStep(step - 1)}
                disabled={submitting}
                data-focusable="true"
              >
                Back
              </Button>
            )}
            <Button size="lg" className="flex-1" onClick={() => void nextStep()} disabled={busy || !!stepActivity} data-focusable="true">
              {stepActivity
                ? stepActivity
                : submitting
                  ? "Working…"
                  : detecting
                    ? "Scanning…"
                    : installingProton
                      ? "Installing Proton deps…"
                      : step === finalStep
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
