import { useEffect, useMemo, useRef, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  CheckCircle2,
  Loader2,
  Package,
  Sparkles,
} from "lucide-react";
import { AppDialog } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  buildWizardStepItems,
  filterVisibleWizardSteps,
  FomodInstallWizard,
  wizardStepIsValid,
} from "@/components/mod/FomodInstallWizard";
import { InstallOptionsPanel } from "@/components/mod/InstallOptionsPanel";
import { InstallSummaryPanel } from "@/components/mod/InstallSummaryPanel";
import { InstallWizardStepper } from "@/components/mod/InstallWizardStepper";
import { OptionCard } from "@/components/mod/OptionCard";
import { api } from "@/lib/commands";
import { useGamepadBackHandler, useGamepadTabs } from "@/hooks/useGamepadRouter";
import { focusFirst } from "@/lib/gamepad/focusNavigation";
import { loadFomodAssetUrl, releaseFomodAssetUrls } from "@/lib/fomodAssets";
import { InstallLogPanel } from "@/components/install/InstallLogPanel";
import { InstallErrorPanel } from "@/components/install/InstallErrorPanel";
import { useInstallLogger } from "@/hooks/useInstallLogger";
import { useUiLockStore } from "@/stores/uiLockStore";
import type {
  InstallOptions,
  InstallPreview,
  InstallProgress,
  InstallResult,
  InstallWizard,
  ModFileInfo,
  Profile,
  SelectedInstallOption,
  InstallPreset,
  SevenZipInfo,
} from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";
import { applyCbbeDeckPreset } from "@/lib/fomodPresets";

type InstallPhase = "welcome" | "wizard" | "options" | "review" | "installing" | "error";

interface ModInstallDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profile: Profile;
  modId: number;
  modName: string;
  file: ModFileInfo;
  archivePathOverride?: string;
  replaceModId?: string;
  category?: string;
  tags?: string[];
  installPreset?: InstallPreset;
  onInstalled?: () => void;
  onInstallFailed?: (error: string) => void;
}

function displayInstallPath(fullPath: string, gamePath: string) {
  const normalizedGame = gamePath.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = fullPath.replace(/\\/g, "/");
  if (normalizedPath.startsWith(`${normalizedGame}/`)) {
    return normalizedPath.slice(normalizedGame.length + 1);
  }
  return fullPath;
}

function isInstallCancelled(message: string) {
  return /install cancelled/i.test(message);
}

function phaseToStepperIndex(
  phase: InstallPhase,
  wizardStepIndex: number,
  wizardStepCount: number
) {
  if (phase === "welcome") return 0;
  if (phase === "wizard") return 1 + wizardStepIndex;
  if (phase === "options") return wizardStepCount > 0 ? wizardStepCount + 1 : 1;
  if (phase === "review" || phase === "installing") {
    return wizardStepCount > 0 ? wizardStepCount + 1 : 2;
  }
  return 0;
}

export function ModInstallDialog({
  open,
  onOpenChange,
  profile,
  modId,
  modName,
  file,
  archivePathOverride,
  replaceModId,
  category,
  tags,
  installPreset,
  onInstalled,
  onInstallFailed,
}: ModInstallDialogProps) {
  const [archivePath, setArchivePath] = useState("");
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [installWizard, setInstallWizard] = useState<InstallWizard | null>(null);
  const [preparedExtractDir, setPreparedExtractDir] = useState<string | null>(null);
  const [phase, setPhase] = useState<InstallPhase>("welcome");
  const [wizardStepIndex, setWizardStepIndex] = useState(0);
  const [strategy, setStrategy] = useState("auto");
  const [enableMod, setEnableMod] = useState(true);
  const [overwriteFiles, setOverwriteFiles] = useState(false);
  const [selections, setSelections] = useState<SelectedInstallOption[]>([]);
  const [loading, setLoading] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [installProgress, setInstallProgress] = useState<InstallProgress | null>(null);
  const [analysisProgress, setAnalysisProgress] = useState<InstallProgress | null>(null);
  const [locatingArchive, setLocatingArchive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [extractElapsedSec, setExtractElapsedSec] = useState(0);
  const [dryRun, setDryRun] = useState(false);
  const [dryRunResult, setDryRunResult] = useState<InstallResult | null>(null);
  const [installLogPath, setInstallLogPath] = useState<string | null>(null);
  const { lines: installLogLines, clear: clearInstallLog } = useInstallLogger(
    extracting || installing
  );
  const [reviewImage, setReviewImage] = useState<string | null>(null);
  const [sevenZip, setSevenZip] = useState<SevenZipInfo | null>(null);

  useEffect(() => {
    if (open) {
      api.getSevenZipInfo().then(setSevenZip).catch(() => setSevenZip(null));
    }
  }, [open]);

  useEffect(() => {
    if (!extracting) {
      setExtractElapsedSec(0);
      return;
    }
    const started = Date.now();
    setExtractElapsedSec(0);
    const timer = window.setInterval(() => {
      setExtractElapsedSec(Math.floor((Date.now() - started) / 1000));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [extracting]);

  const previewDebounceRef = useRef<number | null>(null);
  const wizardDebounceRef = useRef<number | null>(null);

  useEffect(() => {
    if (!open || !archivePath || !preview) return;
    // Wizard steps filter client-side; a full preview on every pick re-scans the
    // archive and freezes the UI. Refresh only on the flat options phase.
    if (phase !== "options") return;

    if (previewDebounceRef.current) {
      window.clearTimeout(previewDebounceRef.current);
    }
    previewDebounceRef.current = window.setTimeout(() => {
      void loadPreview(strategy, archivePath, selections, preparedExtractDir, true);
    }, 400);

    return () => {
      if (previewDebounceRef.current) {
        window.clearTimeout(previewDebounceRef.current);
      }
    };
  }, [selections, phase, open, archivePath, strategy, preparedExtractDir]);

  useEffect(() => {
    if (!open || !archivePath || !preparedExtractDir || phase !== "wizard") return;

    if (wizardDebounceRef.current) {
      window.clearTimeout(wizardDebounceRef.current);
    }
    wizardDebounceRef.current = window.setTimeout(() => {
      void api
        .getFomodWizardState({
          extractDir: preparedExtractDir,
          archivePath,
          selections,
        })
        .then((state) => setInstallWizard(state.wizard))
        .catch(() => {});
    }, 200);

    return () => {
      if (wizardDebounceRef.current) {
        window.clearTimeout(wizardDebounceRef.current);
      }
    };
  }, [selections, phase, open, archivePath, preparedExtractDir]);

  useEffect(() => {
    if (open) return;
    if (preparedExtractDir) {
      void api.cleanupPrepareDir(preparedExtractDir).catch(() => {});
    }
  }, [open, preparedExtractDir]);

  useEffect(() => {
    if (preview && preview.file_count === 0 && preview.skipped_existing > 0) {
      setOverwriteFiles(true);
    }
  }, [preview]);

  const wizardRequired = !!preview?.install_wizard_required;
  const wizardStepPages = useMemo(
    () =>
      installWizard ? filterVisibleWizardSteps(installWizard, selections) : [],
    [installWizard, selections]
  );
  const wizardStepCount = wizardStepPages.length;
  const hasWizardSteps = wizardStepCount > 0;
  const showStepper =
    wizardRequired ||
    hasWizardSteps ||
    (preview?.option_groups.length ?? 0) > 0;
  const stepperItems = useMemo(
    () => buildWizardStepItems(installWizard, selections, true),
    [installWizard, selections]
  );
  const stepperIndex = phaseToStepperIndex(phase, wizardStepIndex, wizardStepCount);

  const loadPreview = async (
    nextStrategy: string,
    resolvedPath: string,
    nextSelections?: SelectedInstallOption[],
    extractDir?: string | null,
    silent = false
  ) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await api.previewModInstall({
        profileId: profile.id,
        archivePath: resolvedPath,
        modName,
        strategy: nextStrategy,
        selectedOptions:
          nextSelections && nextSelections.length > 0 ? nextSelections : undefined,
        preparedExtractDir: extractDir ?? preparedExtractDir,
      });
      setPreview(result);
      if (result.install_wizard) {
        setInstallWizard(result.install_wizard);
      }
      if (!nextSelections || nextSelections.length === 0) {
        setSelections(result.default_selections);
      }
      return result;
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPreview(null);
      return null;
    } finally {
      if (!silent) setLoading(false);
    }
  };

  const resolveInitialPhase = (result: InstallPreview) => {
    if (result.install_wizard_required) return "welcome" as const;
    if (result.install_wizard && result.install_wizard.steps.length > 0) return "wizard" as const;
    if (result.option_groups.length > 0) return "options" as const;
    return "review" as const;
  };

  useEffect(() => {
    if (!open) return;

    const presetStrategy = installPreset?.strategy ?? "auto";
    setStrategy(presetStrategy);
    setEnableMod(true);
    setOverwriteFiles(false);
    setSelections([]);
    setPreview(null);
    setInstallWizard(null);
    setPreparedExtractDir(null);
    setPhase("welcome");
    setWizardStepIndex(0);
    setAnalysisProgress(null);
    setLocatingArchive(false);
    setError(null);
    setDryRunResult(null);

    const prepare = async () => {
      setLoading(true);
      try {
        let resolved = archivePathOverride ?? "";
        if (!resolved) {
          setLocatingArchive(true);
          const match = await api.resolveModArchivePath(
            profile.staging_path,
            modFileDownloadName(file)
          );
          resolved = match.path;
          setLocatingArchive(false);
        }
        setArchivePath(resolved);
        const result = await loadPreview(presetStrategy, resolved, undefined, null);
        if (!result) return;
        const nextPhase = resolveInitialPhase(result);

        if (
          installPreset?.autoConfirm &&
          !result.install_wizard_required &&
          nextPhase === "review" &&
          result.option_groups.length === 0
        ) {
          setPhase("installing");
          setInstalling(true);
          setPreview(result);
          setStrategy(presetStrategy);
          setSelections(result.default_selections);
          try {
            const installResult = await api.installModFromArchive({
              profileId: profile.id,
              modName,
              nexusModId: modId,
              nexusFileId: file.file_id,
              archivePath: resolved,
              options: {
                strategy: presetStrategy,
                enable_mod: true,
                overwrite_files: false,
                selected_options: result.default_selections,
                prepared_extract_dir: null,
                dry_run: false,
              },
              fileVersion: file.version ?? null,
              replaceModId: replaceModId ?? null,
            });
            if (installResult.log_path) setInstallLogPath(installResult.log_path);
            onInstalled?.();
            window.dispatchEvent(
              new CustomEvent("nexusdeck-mod-installed", { detail: { modName } })
            );
            onOpenChange(false);
          } catch (e) {
            const message = e instanceof Error ? e.message : String(e);
            setError(message);
            setPhase("error");
            onInstallFailed?.(message);
          } finally {
            setInstalling(false);
            setLoading(false);
          }
          return;
        }

        if (nextPhase === "wizard" && !result.install_wizard_required) {
          setPhase("welcome");
        } else {
          setPhase(nextPhase);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setArchivePath("");
        setPreview(null);
        setLocatingArchive(false);
        setLoading(false);
      }
    };

    prepare();
  }, [
    open,
    archivePathOverride,
    file.file_id,
    file.file_name,
    file.name,
    modName,
    profile.id,
    profile.staging_path,
    installPreset?.strategy,
    installPreset?.autoConfirm,
  ]);

  useEffect(() => {
    if (open) return;
    releaseFomodAssetUrls();
    setReviewImage(null);
  }, [open]);

  useEffect(() => {
    if (!preparedExtractDir || !installWizard?.module_image_path) {
      setReviewImage(null);
      return;
    }
    let cancelled = false;
    loadFomodAssetUrl(preparedExtractDir, installWizard.module_image_path).then((url) => {
      if (!cancelled) setReviewImage(url);
    });
    return () => {
      cancelled = true;
    };
  }, [preparedExtractDir, installWizard?.module_image_path]);

  useEffect(() => {
    if (!open) return;

    const unsubs: Array<() => void> = [];

    listen<InstallProgress>("install:progress", (event) => {
      if (event.payload.profile_id !== profile.id) return;
      if (event.payload.phase === "preview") {
        setAnalysisProgress(event.payload);
      } else if (extracting || installing || phase === "installing") {
        setInstallProgress(event.payload);
      }
    }).then((fn) => unsubs.push(fn));

    return () => {
      unsubs.forEach((fn) => fn());
      setInstallProgress(null);
      setAnalysisProgress(null);
    };
  }, [open, profile.id, extracting, installing]);

  // While extracting/installing, lock the whole flow: the dialog can't be
  // dismissed (Esc / outside / X / Cancel) and the global Back paths no-op, so
  // an accidental tap or B-press can't bail out of an install in progress.
  const installBusy = extracting || installing || phase === "installing";
  const setInstallBusy = useUiLockStore((s) => s.setInstallBusy);
  useEffect(() => {
    setInstallBusy(installBusy);
    return () => setInstallBusy(false);
  }, [installBusy, setInstallBusy]);

  const extractAndConfigure = async () => {
    if (!archivePath) return;
    setExtracting(true);
    setInstallProgress(null);
    setError(null);
    try {
      const result = await api.prepareModInstall({
        profileId: profile.id,
        archivePath,
        modName,
      });
      setPreparedExtractDir(result.prepared_extract_dir);
      setSelections(result.default_selections);
      if (result.install_wizard) {
        setInstallWizard(result.install_wizard);
      }

      if (
        installPreset?.fomodPreset === "cbbe_deck" &&
        result.install_wizard &&
        result.install_wizard.steps.length > 0
      ) {
        const presetSelections = applyCbbeDeckPreset(result.install_wizard);
        setSelections(presetSelections);
        const presetPreview = await loadPreview(
          strategy,
          archivePath,
          presetSelections,
          result.prepared_extract_dir
        );
        if (presetPreview) {
          setPhase("review");
          if (installPreset.autoConfirm) {
            setInstalling(true);
            setPhase("installing");
            try {
              const installResult = await api.installModFromArchive({
                profileId: profile.id,
                modName,
                nexusModId: modId,
                nexusFileId: file.file_id,
                archivePath,
                options: {
                  strategy,
                  enable_mod: true,
                  overwrite_files: false,
                  selected_options: presetSelections,
                  prepared_extract_dir: result.prepared_extract_dir,
                  dry_run: false,
                },
                fileVersion: file.version ?? null,
                replaceModId: replaceModId ?? null,
              });
              if (installResult.log_path) setInstallLogPath(installResult.log_path);
              onInstalled?.();
              window.dispatchEvent(
                new CustomEvent("nexusdeck-mod-installed", { detail: { modName } })
              );
              onOpenChange(false);
            } catch (e) {
              const message = e instanceof Error ? e.message : String(e);
              setError(message);
              setPhase("error");
              onInstallFailed?.(message);
            } finally {
              setInstalling(false);
            }
          }
        }
        return;
      }

      const previewResult = await loadPreview(
        strategy,
        archivePath,
        result.default_selections,
        result.prepared_extract_dir
      );
      if (!previewResult) return;

      if (result.install_wizard && result.install_wizard.steps.length > 0) {
        setWizardStepIndex(0);
        setPhase("wizard");
      } else if (previewResult.option_groups.length > 0) {
        setPhase("options");
      } else {
        setPhase("review");
      }
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isInstallCancelled(message)) {
        onOpenChange(false);
        return;
      }
      setError(message);
    } finally {
      setExtracting(false);
    }
  };

  const goToReview = async () => {
    if (!archivePath) return;
    setPhase("review");
    await loadPreview(strategy, archivePath, selections, preparedExtractDir);
  };

  const handleStrategyChange = async (next: string) => {
    setStrategy(next);
    if (archivePath && phase === "review") {
      await loadPreview(next, archivePath, selections, preparedExtractDir);
    }
  };

  const handleSelectionsChange = (next: SelectedInstallOption[]) => {
    setSelections(next);
  };

  const installPaths = useMemo(() => {
    if (!preview) return [];
    const source =
      preview.deploy_files.length > 0
        ? preview.deploy_files
        : preview.entries.map((entry) => entry.path);
    return source.map((path) => displayInstallPath(path, profile.game_path));
  }, [preview, profile.game_path]);

  const install = async () => {
    if (!archivePath) return;
    setInstalling(true);
    setPhase("installing");
    setInstallProgress(null);
    setError(null);
    setInstallLogPath(null);
    clearInstallLog();
    setDryRunResult(null);
    try {
      const options: InstallOptions = {
        strategy,
        enable_mod: enableMod,
        overwrite_files: overwriteFiles,
        selected_options: selections,
        prepared_extract_dir: preparedExtractDir,
        dry_run: dryRun,
      };
      const result = await api.installModFromArchive({
        profileId: profile.id,
        modName,
        nexusModId: modId,
        nexusFileId: file.file_id,
        archivePath,
        options,
        category: category ?? null,
        tags: tags ?? [],
        fileVersion: file.version ?? null,
        replaceModId: replaceModId ?? null,
      });
      if (result.log_path) setInstallLogPath(result.log_path);
      if (result.dry_run) {
        setDryRunResult(result);
        setPhase("review");
        return;
      }
      if (localStorage.getItem("nexusdeck_auto_sort_after_install") === "true") {
        await api.autoSortLoadOrder(profile.id).catch(() => {});
      }
      onInstalled?.();
      window.dispatchEvent(new CustomEvent("nexusdeck-mod-installed", { detail: { modName } }));
      onOpenChange(false);
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      if (isInstallCancelled(message)) {
        onOpenChange(false);
        return;
      }
      const logMatch = message.match(/Full log: (.+)$/m);
      if (logMatch) setInstallLogPath(logMatch[1].trim());
      setError(message);
      setPhase("error");
      onInstallFailed?.(message);
    } finally {
      setInstalling(false);
    }
  };

  const installProgressPercent =
    installProgress && installProgress.files_total > 0
      ? Math.round((installProgress.files_done / installProgress.files_total) * 100)
      : null;

  const showDeterminateProgress =
    installProgressPercent !== null &&
    (extracting ||
      installProgress?.stage === "extracting" ||
      installProgress?.stage === "deploying");

  const extractAlmostDone =
    extracting && installProgressPercent !== null && installProgressPercent >= 90;

  const handleCancel = () => {
    if (installBusy) {
      void api.cancelInstall(profile.id).catch(() => {});
      return;
    }
    onOpenChange(false);
  };

  const currentWizardStep = wizardStepPages[wizardStepIndex];
  const wizardCanAdvance =
    !currentWizardStep || wizardStepIsValid(currentWizardStep, selections);

  const goNext = async () => {
    if (phase === "welcome") {
      await extractAndConfigure();
      return;
    }
    if (phase === "wizard") {
      if (wizardStepIndex < wizardStepCount - 1) {
        setWizardStepIndex((i) => i + 1);
        return;
      }
      await goToReview();
      return;
    }
    if (phase === "options") {
      await goToReview();
      return;
    }
    if (phase === "review") {
      await install();
    }
  };

  const goBack = () => {
    if (phase === "review") {
      if (hasWizardSteps) {
        setPhase("wizard");
        setWizardStepIndex(wizardStepCount - 1);
      } else if (preview?.option_groups.length) {
        setPhase("options");
      } else if (wizardRequired) {
        setPhase("welcome");
      }
      return;
    }
    if (phase === "options") {
      if (wizardRequired) setPhase("welcome");
      return;
    }
    if (phase === "wizard") {
      if (wizardStepIndex > 0) {
        setWizardStepIndex((i) => i - 1);
      } else if (wizardRequired) {
        setPhase("welcome");
      }
    }
  };

  const showBack =
    phase === "wizard" ||
    phase === "options" ||
    (phase === "review" && (hasWizardSteps || !!preview?.option_groups.length || wizardRequired));

  useGamepadBackHandler(() => {
    if (!open || installBusy) return;
    if (showBack) goBack();
    else onOpenChange(false);
  });

  const primaryLabel =
    phase === "installing"
      ? installProgress?.message ?? "Installing…"
      : extracting
        ? installProgress?.message ?? "Extracting archive…"
        : loading && phase === "review"
          ? "Updating preview…"
          : phase === "welcome"
            ? hasWizardSteps || wizardRequired
              ? "Extract & configure"
              : "Begin installation"
            : phase === "wizard"
              ? wizardStepIndex < wizardStepCount - 1
                ? "Next"
                : "Review & install"
              : phase === "options"
                ? "Continue to review"
                : "Install mod";

  const primaryDisabled =
    loading ||
    installing ||
    extracting ||
    !preview ||
    !archivePath ||
    (phase === "wizard" && !wizardCanAdvance) ||
    (phase === "welcome" && loading) ||
    phase === "error";

  // Controller: re-home focus to the meaningful target on every step/phase
  // change (AppDialog only focuses on first open). Option phases land on the
  // first selectable option so the d-pad moves option→option immediately;
  // welcome/review land on the primary action (marked data-focus-start) so a
  // single A advances. Never steals focus mid-install.
  useEffect(() => {
    if (!open || phase === "installing" || phase === "error") return;
    const raf = requestAnimationFrame(() => {
      const dialog = document.querySelector<HTMLElement>('[role="dialog"]');
      if (!dialog) return;
      const optionFirst =
        phase === "wizard" || phase === "options"
          ? dialog.querySelector<HTMLElement>("[aria-pressed]")
          : null;
      const target =
        dialog.querySelector<HTMLElement>('[data-focus-start="true"]') ?? optionFirst;
      if (target) target.focus();
      else focusFirst(dialog);
    });
    return () => cancelAnimationFrame(raf);
  }, [open, phase, wizardStepIndex]);

  // Shoulder buttons page through install steps (B already goes back). The
  // router routes L1/R1 through the active tab handler, so we register one here
  // (page scope, most-recent → wins over the page underneath). Three sentinel
  // "tabs" anchored on the middle make L1 deterministically resolve to "back"
  // and R1 to "next" with no wrap hazard, mapped to the existing goBack/goNext.
  useGamepadTabs(
    ["__nd_back__", "__nd_current__", "__nd_next__"],
    "__nd_current__",
    (id) => {
      // installBusy already includes phase === "installing".
      if (installBusy || phase === "error") return;
      if (id === "__nd_next__") {
        if (!primaryDisabled) void goNext();
      } else if (id === "__nd_back__") {
        if (showBack) goBack();
      }
    },
    "page"
  );

  const displayTitle = installWizard?.module_name ?? modName;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Install: ${displayTitle}`}
      description={`${file.name} · v${file.version}`}
      className="max-w-6xl"
      dismissible={!installBusy}
      disableOutsideClose
    >
      <div className="space-y-5">
        {!loading && preview && showStepper && phase !== "welcome" && (
          <InstallWizardStepper steps={stepperItems} currentIndex={stepperIndex} />
        )}

        {loading && !preview && (
          <div className="rounded-xl border border-[var(--color-border)] p-6 text-center">
            <Loader2 className="mx-auto mb-3 h-8 w-8 animate-spin text-[var(--color-primary)]" />
            <p className="font-medium">
              {locatingArchive
                ? "Locating downloaded archive…"
                : analysisProgress?.message ?? "Analyzing archive…"}
            </p>
            {analysisProgress && analysisProgress.files_total > 0 && (
              <p className="mt-2 text-sm text-[var(--color-muted)]">
                {analysisProgress.files_total.toLocaleString()} files found
              </p>
            )}
          </div>
        )}

        {(phase === "wizard" || phase === "options") && preview ? (
          phase === "wizard" && installWizard && preparedExtractDir ? (
            <FomodInstallWizard
              wizard={installWizard}
              extractDir={preparedExtractDir}
              selections={selections}
              currentStepIndex={wizardStepIndex}
              optionFileCounts={preview.option_file_counts}
              onSelectionsChange={handleSelectionsChange}
              disabled={loading || installing || extracting}
            />
          ) : (
          <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_280px]">
            <div className="min-w-0 space-y-5">
              {phase === "options" && preview.option_groups.length > 0 && (
                <InstallOptionsPanel
                  groups={preview.option_groups}
                  selections={selections}
                  onChange={handleSelectionsChange}
                  disabled={loading || installing || extracting}
                />
              )}
            </div>
            <InstallSummaryPanel
              preview={preview}
              gamePath={profile.game_path}
              loading={loading}
              className="lg:sticky lg:top-0 lg:self-start"
            />
          </div>
          )
        ) : null}

        {phase === "welcome" && preview && !extracting && (
          <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
            <div className="bg-[image:var(--gradient-primary)] px-6 py-8 text-white">
              <div className="flex items-start gap-4">
                <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-white/15">
                  <Sparkles className="h-7 w-7" />
                </div>
                <div>
                  <h3 className="text-2xl font-bold">{displayTitle}</h3>
                  <p className="mt-1 text-sm text-white/80">{preview.plan.description}</p>
                </div>
              </div>
            </div>
            <div className="space-y-4 p-6">
              {sevenZip && !sevenZip.available && (
                <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4 text-sm">
                  <p className="font-medium text-[var(--color-warning)]">
                    Built-in decompressor only
                  </p>
                  <p className="mt-1 text-[var(--color-muted)]">
                    Native 7-Zip was not found. Large solid archives can take several minutes to
                    extract.
                  </p>
                </div>
              )}
              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Archive</p>
                  <p className="mt-1 text-lg font-semibold">
                    {preview.file_count.toLocaleString()} files
                  </p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Installer</p>
                  <p className="mt-1 text-lg font-semibold">FOMOD wizard</p>
                </div>
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-secondary)]/40 p-4">
                  <p className="text-xs uppercase tracking-wide text-[var(--color-muted)]">Steps</p>
                  <p className="mt-1 text-lg font-semibold">Extract → configure → install</p>
                </div>
              </div>
              <p className="text-sm text-[var(--color-muted)]">
                {sevenZip?.available
                  ? "NexusDeck will extract the archive with native 7-Zip, then walk you through each install step with previews — similar to Vortex."
                  : "NexusDeck will extract the archive, then walk you through each install step with previews — similar to Vortex."}
              </p>
            </div>
          </div>
        )}

        {phase === "review" && preview && (
          <div className="space-y-5">
            {reviewImage && (
              <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
                <img
                  src={reviewImage}
                  alt={displayTitle}
                  className="max-h-36 w-full object-cover"
                />
              </div>
            )}

            {dryRunResult && (
              <div className="rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4">
                <div className="flex items-start gap-3">
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
                  <div className="space-y-1">
                    <p className="font-medium">Dry run complete — no files were changed</p>
                    <p className="text-sm text-[var(--color-muted)]">
                      {dryRunResult.files_planned ?? dryRunResult.files_installed ?? preview.file_count}{" "}
                      file(s) would be deployed
                      {dryRunResult.conflicts.length > 0
                        ? ` · ${dryRunResult.conflicts.length} potential conflict(s)`
                        : ""}
                    </p>
                    {dryRunResult.log_path && (
                      <p className="font-mono text-xs text-[var(--color-muted)]">
                        Log: {dryRunResult.log_path}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            )}

            <div
              className={
                preview.plan.requires_confirmation
                  ? "rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4"
                  : "rounded-xl border border-[var(--color-success)]/40 bg-[var(--color-success)]/10 p-4"
              }
            >
              <div className="flex items-start gap-3">
                {preview.plan.requires_confirmation ? (
                  <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-warning)]" />
                ) : (
                  <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-[var(--color-success)]" />
                )}
                <div className="space-y-1">
                  <p className="font-medium">Ready to install</p>
                  <p className="text-sm text-[var(--color-muted)]">{preview.plan.description}</p>
                  <p className="text-sm text-[var(--color-muted)]">
                    Destination:{" "}
                    <span className="font-mono text-xs">
                      {displayInstallPath(preview.plan.target, profile.game_path)}
                    </span>
                  </p>
                </div>
              </div>
            </div>

            <div>
              <p className="mb-2 text-sm font-medium">Install method</p>
              <div className="grid gap-2 sm:grid-cols-2">
                {preview.strategies.map((s) => (
                  <OptionCard
                    key={s.id}
                    control="radio"
                    checked={strategy === s.id}
                    disabled={loading || installing}
                    onToggle={() => void handleStrategyChange(s.id)}
                    title={s.label}
                  />
                ))}
              </div>
            </div>

            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              <OptionCard
                control="checkbox"
                checked={enableMod}
                disabled={loading || installing}
                onToggle={() => setEnableMod((v) => !v)}
                title="Enable after install"
                description="Mark mod as active in your library"
              />
              <OptionCard
                control="checkbox"
                checked={overwriteFiles}
                disabled={loading || installing}
                onToggle={() => setOverwriteFiles((v) => !v)}
                title="Overwrite existing files"
                description="Replace files that already exist at the target path"
              />
              <OptionCard
                control="checkbox"
                checked={dryRun}
                disabled={loading || installing}
                onToggle={() => setDryRun((v) => !v)}
                title="Dry run"
                description="Simulate install and write a log without changing game files"
              />
            </div>

            <div className="rounded-xl border border-[var(--color-border)] p-4">
              <div className="mb-2 flex items-center gap-2">
                <Package className="h-5 w-5" />
                <span className="font-medium">{preview.file_count} files will be deployed</span>
              </div>
              {preview.skipped_existing > 0 && (
                <p className="mb-2 text-sm text-[var(--color-warning)]">
                  {preview.skipped_existing} file(s) already exist and will be skipped unless you
                  enable overwrite.
                </p>
              )}
              <div className="max-h-40 overflow-auto text-sm text-[var(--color-muted)] scrollbar-thin">
                {installPaths.slice(0, 30).map((path) => (
                  <div key={path} className="truncate font-mono text-xs">
                    {path}
                  </div>
                ))}
                {installPaths.length > 30 && (
                  <p className="mt-2">…and {installPaths.length - 30} more</p>
                )}
              </div>
            </div>

            {preview.conflicts.length > 0 && (
              <div className="rounded-xl border border-[var(--color-warning)]/40 bg-[var(--color-warning)]/10 p-4">
                <div className="mb-2 flex items-center gap-2 text-[var(--color-warning)]">
                  <AlertTriangle className="h-5 w-5" />
                  <span className="font-medium">{preview.conflicts.length} potential conflicts</span>
                </div>
                <div className="max-h-32 space-y-1 overflow-auto text-sm scrollbar-thin">
                  {preview.conflicts.slice(0, 10).map((c) => (
                    <p key={c.path} className="font-mono text-xs">
                      {c.path} — used by {c.existing_mod}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {phase === "error" && error && (
          <InstallErrorPanel
            error={error}
            logPath={installLogPath}
            archivePath={archivePath}
            onRetry={() => {
              setError(null);
              setPhase("review");
            }}
            onDismiss={() => onOpenChange(false)}
          />
        )}

        {error && phase !== "error" && (
          <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        <InstallLogPanel lines={installLogLines} defaultOpen={phase === "installing"} />

        {(extracting || phase === "installing") && (
          <div className="rounded-xl border border-[var(--color-border)] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                <div>
                  <p className="font-medium">
                    {installProgress?.message ?? (extracting ? "Extracting archive…" : "Installing…")}
                  </p>
                  {showDeterminateProgress && installProgress && (
                    <p className="text-sm text-[var(--color-muted)]">
                      {installProgress.files_done.toLocaleString()} of{" "}
                      {installProgress.files_total.toLocaleString()} files
                    </p>
                  )}
                  {extracting && extractElapsedSec > 0 && (
                    <p className="mt-1 text-xs text-[var(--color-muted)]">
                      Elapsed: {extractElapsedSec}s
                    </p>
                  )}
                </div>
              </div>
              {showDeterminateProgress && installProgressPercent !== null && (
                <div className="text-right">
                  <p className="text-3xl font-bold tabular-nums text-[var(--color-primary)]">
                    {installProgressPercent}%
                  </p>
                  {extractAlmostDone && (
                    <p className="text-xs font-medium text-[var(--color-success)]">Almost done</p>
                  )}
                </div>
              )}
            </div>
            {showDeterminateProgress && installProgressPercent !== null ? (
              <div className="space-y-2">
                <Progress value={installProgressPercent} />
                {extracting && installProgressPercent === 0 && extractElapsedSec >= 15 && (
                  <p className="text-xs text-[var(--color-muted)]">
                    Still working… {extractElapsedSec}s elapsed. Solid archives can take several
                    minutes before the first files appear.
                  </p>
                )}
                {extracting && installProgress && installProgress.files_total > 0 && (
                  <p className="text-xs text-[var(--color-muted)]">
                    {installProgress.message.includes("built-in")
                      ? "Using the built-in decompressor — this can be much slower on large solid archives."
                      : "Large archives can take a few minutes — progress updates as files are extracted."}
                  </p>
                )}
              </div>
            ) : (
              <div className="h-3 overflow-hidden rounded-full bg-[var(--color-secondary)]">
                <div className="h-full w-1/3 animate-pulse rounded-full bg-[var(--color-primary)]" />
              </div>
            )}
            {installProgress?.current_file && (
              <p className="mt-3 truncate font-mono text-xs text-[var(--color-muted)]">
                {installProgress.current_file}
              </p>
            )}
          </div>
        )}

        {/* Sticky action bar: on the Deck's short screen the dialog body scrolls,
            so pin Cancel / Back / Install to the bottom edge — the primary action
            is always reachable without scrolling to the end of a long review. */}
        <div className="sticky bottom-0 z-10 -mx-4 -mb-4 flex gap-3 border-t border-[var(--color-border)] bg-[var(--color-card)] px-4 py-3 sm:-mx-6 sm:-mb-6 sm:px-6 sm:py-4">
          <Button
            variant="outline"
            className="flex-1"
            onClick={handleCancel}
            data-focusable="true"
          >
            {installBusy ? "Stop install" : "Cancel"}
          </Button>
          {showBack && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={goBack}
              disabled={loading || installing || extracting}
              data-focusable="true"
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          {phase !== "error" && (
            <Button
              size="lg"
              className="flex-[1.4]"
              onClick={() => void goNext()}
              disabled={primaryDisabled}
              data-focusable="true"
              data-focus-start={
                phase === "welcome" || phase === "review" ? "true" : undefined
              }
            >
              {loading && phase === "review" ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  {primaryLabel}
                </>
              ) : (
                <>
                  {primaryLabel}
                  {phase !== "review" && phase !== "installing" && (
                    <ArrowRight className="ml-2 h-4 w-4" />
                  )}
                </>
              )}
            </Button>
          )}
        </div>
      </div>
    </AppDialog>
  );
}
