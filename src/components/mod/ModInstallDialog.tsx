import { useEffect, useMemo, useState } from "react";
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
  flattenWizardGroups,
  FomodInstallWizard,
  wizardGroupIsValid,
} from "@/components/mod/FomodInstallWizard";
import { InstallOptionsPanel } from "@/components/mod/InstallOptionsPanel";
import { InstallWizardStepper } from "@/components/mod/InstallWizardStepper";
import { api } from "@/lib/commands";
import { loadFomodAssetUrl, releaseFomodAssetUrls } from "@/lib/fomodAssets";
import type {
  InstallOptions,
  InstallPreview,
  InstallProgress,
  InstallWizard,
  ModFileInfo,
  Profile,
  SelectedInstallOption,
} from "@/lib/nexus/types";
import { modFileDownloadName } from "@/lib/nexus/types";

type InstallPhase = "welcome" | "wizard" | "options" | "review" | "installing";

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
  onInstalled?: () => void;
}

function displayInstallPath(fullPath: string, gamePath: string) {
  const normalizedGame = gamePath.replace(/\\/g, "/").replace(/\/$/, "");
  const normalizedPath = fullPath.replace(/\\/g, "/");
  if (normalizedPath.startsWith(`${normalizedGame}/`)) {
    return normalizedPath.slice(normalizedGame.length + 1);
  }
  return fullPath;
}

function phaseToStepperIndex(
  phase: InstallPhase,
  wizardGroupIndex: number,
  wizardGroupCount: number
) {
  if (phase === "welcome") return 0;
  if (phase === "wizard") return 1 + wizardGroupIndex;
  if (phase === "options") return wizardGroupCount > 0 ? wizardGroupCount + 1 : 1;
  if (phase === "review" || phase === "installing") {
    return wizardGroupCount > 0 ? wizardGroupCount + 1 : 2;
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
  onInstalled,
}: ModInstallDialogProps) {
  const [archivePath, setArchivePath] = useState("");
  const [preview, setPreview] = useState<InstallPreview | null>(null);
  const [installWizard, setInstallWizard] = useState<InstallWizard | null>(null);
  const [preparedExtractDir, setPreparedExtractDir] = useState<string | null>(null);
  const [phase, setPhase] = useState<InstallPhase>("welcome");
  const [wizardGroupIndex, setWizardGroupIndex] = useState(0);
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
  const [reviewImage, setReviewImage] = useState<string | null>(null);

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

  useEffect(() => {
    if (preview && preview.file_count === 0 && preview.skipped_existing > 0) {
      setOverwriteFiles(true);
    }
  }, [preview]);

  const wizardRequired = !!preview?.install_wizard_required;
  const wizardGroupPages = useMemo(
    () => (installWizard ? flattenWizardGroups(installWizard) : []),
    [installWizard]
  );
  const wizardGroupCount = wizardGroupPages.length;
  const hasWizardSteps = wizardGroupCount > 0;
  const showStepper =
    wizardRequired ||
    hasWizardSteps ||
    (preview?.option_groups.length ?? 0) > 0;
  const stepperItems = useMemo(
    () => buildWizardStepItems(installWizard, true),
    [installWizard]
  );
  const stepperIndex = phaseToStepperIndex(phase, wizardGroupIndex, wizardGroupCount);

  const loadPreview = async (
    nextStrategy: string,
    resolvedPath: string,
    nextSelections?: SelectedInstallOption[],
    extractDir?: string | null
  ) => {
    setLoading(true);
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
      setLoading(false);
    }
  };

  const resolveInitialPhase = (result: InstallPreview) => {
    if (result.install_wizard_required) return "welcome" as const;
    if (result.option_groups.length > 0) return "options" as const;
    return "review" as const;
  };

  useEffect(() => {
    if (!open) return;

    setStrategy("auto");
    setEnableMod(true);
    setOverwriteFiles(false);
    setSelections([]);
    setPreview(null);
    setInstallWizard(null);
    setPreparedExtractDir(null);
    setPhase("welcome");
    setWizardGroupIndex(0);
    setAnalysisProgress(null);
    setLocatingArchive(false);
    setError(null);

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
        const result = await loadPreview("auto", resolved, undefined, null);
        if (result) setPhase(resolveInitialPhase(result));
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
        setArchivePath("");
        setPreview(null);
        setLocatingArchive(false);
        setLoading(false);
      }
    };

    prepare();
  }, [open, archivePathOverride, file.file_id, file.file_name, file.name, modName, profile.id, profile.staging_path]);

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
      } else if (extracting || installing) {
        setInstallProgress(event.payload);
      }
    }).then((fn) => unsubs.push(fn));

    return () => {
      unsubs.forEach((fn) => fn());
      setInstallProgress(null);
      setAnalysisProgress(null);
    };
  }, [open, profile.id, extracting, installing]);

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
      const previewResult = await loadPreview(
        strategy,
        archivePath,
        result.default_selections,
        result.prepared_extract_dir
      );
      if (!previewResult) return;

      if (result.install_wizard && result.install_wizard.steps.length > 0) {
        setWizardGroupIndex(0);
        setPhase("wizard");
      } else if (previewResult.option_groups.length > 0) {
        setPhase("options");
      } else {
        setPhase("review");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
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
    try {
      const options: InstallOptions = {
        strategy,
        enable_mod: enableMod,
        overwrite_files: overwriteFiles,
        selected_options: selections,
        prepared_extract_dir: preparedExtractDir,
      };
      await api.installModFromArchive({
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
      if (localStorage.getItem("nexusdeck_auto_sort_after_install") === "true") {
        await api.autoSortLoadOrder(profile.id).catch(() => {});
      }
      onInstalled?.();
      onOpenChange(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setPhase("review");
    } finally {
      setInstalling(false);
    }
  };

  const installProgressPercent =
    installProgress && installProgress.files_total > 0
      ? Math.round((installProgress.files_done / installProgress.files_total) * 100)
      : null;

  const extractAlmostDone =
    extracting && installProgressPercent !== null && installProgressPercent >= 90;

  const currentWizardGroup = wizardGroupPages[wizardGroupIndex]?.group;
  const wizardCanAdvance =
    !currentWizardGroup || wizardGroupIsValid(currentWizardGroup, selections);

  const goNext = async () => {
    if (phase === "welcome") {
      await extractAndConfigure();
      return;
    }
    if (phase === "wizard") {
      if (wizardGroupIndex < wizardGroupCount - 1) {
        setWizardGroupIndex((i) => i + 1);
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
        setWizardGroupIndex(wizardGroupCount - 1);
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
      if (wizardGroupIndex > 0) {
        setWizardGroupIndex((i) => i - 1);
      } else if (wizardRequired) {
        setPhase("welcome");
      }
    }
  };

  const showBack =
    phase === "wizard" ||
    phase === "options" ||
    (phase === "review" && (hasWizardSteps || !!preview?.option_groups.length || wizardRequired));

  const primaryLabel =
    phase === "installing"
      ? installProgress?.message ?? "Installing…"
      : extracting
        ? installProgress?.message ?? "Extracting archive…"
        : loading && phase === "review"
          ? "Updating preview…"
          : phase === "welcome"
            ? "Begin installation"
            : phase === "wizard"
              ? wizardGroupIndex < wizardGroupCount - 1
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
    (phase === "welcome" && loading);

  const displayTitle = installWizard?.module_name ?? modName;

  return (
    <AppDialog
      open={open}
      onOpenChange={onOpenChange}
      title={`Install: ${displayTitle}`}
      description={`${file.name} · v${file.version}`}
      className="max-w-4xl"
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
                NexusDeck will extract the archive with native 7-Zip, then walk you through each
                install step with previews — similar to Vortex.
              </p>
            </div>
          </div>
        )}

        {phase === "wizard" && installWizard && preparedExtractDir && (
          <FomodInstallWizard
            wizard={installWizard}
            extractDir={preparedExtractDir}
            selections={selections}
            currentGroupIndex={wizardGroupIndex}
            onSelectionsChange={handleSelectionsChange}
            disabled={loading || installing || extracting}
          />
        )}

        {phase === "options" && preview && preview.option_groups.length > 0 && (
          <InstallOptionsPanel
            groups={preview.option_groups}
            selections={selections}
            onChange={handleSelectionsChange}
            disabled={loading || installing || extracting}
          />
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
              <label className="mb-2 block text-sm font-medium">Install method</label>
              <select
                value={strategy}
                onChange={(e) => void handleStrategyChange(e.target.value)}
                className="focusable h-12 w-full rounded-xl border-2 border-[var(--color-border)] bg-[var(--color-card)] px-4"
                data-focusable="true"
                disabled={loading || installing}
              >
                {preview.strategies.map((s) => (
                  <option key={s.id} value={s.id}>
                    {s.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-4">
                <input
                  type="checkbox"
                  checked={enableMod}
                  onChange={(e) => setEnableMod(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
                  disabled={loading || installing}
                />
                <div>
                  <p className="font-medium">Enable after install</p>
                  <p className="text-sm text-[var(--color-muted)]">Mark mod as active in your library</p>
                </div>
              </label>
              <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-[var(--color-border)] p-4">
                <input
                  type="checkbox"
                  checked={overwriteFiles}
                  onChange={(e) => setOverwriteFiles(e.target.checked)}
                  className="mt-1 h-5 w-5 accent-[var(--color-primary)]"
                  disabled={loading || installing}
                />
                <div>
                  <p className="font-medium">Overwrite existing files</p>
                  <p className="text-sm text-[var(--color-muted)]">
                    Replace files that already exist at the target path
                  </p>
                </div>
              </label>
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

        {error && (
          <p className="rounded-xl bg-[var(--color-danger)]/10 p-3 text-sm text-[var(--color-danger)]">
            {error}
          </p>
        )}

        {(extracting || phase === "installing") && (
          <div className="rounded-xl border border-[var(--color-border)] p-5">
            <div className="mb-4 flex items-start justify-between gap-4">
              <div className="flex items-center gap-3">
                <Loader2 className="h-6 w-6 animate-spin text-[var(--color-primary)]" />
                <div>
                  <p className="font-medium">
                    {installProgress?.message ?? (extracting ? "Extracting archive…" : "Installing…")}
                  </p>
                  {extracting && installProgress && installProgress.files_total > 0 && (
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
              {extracting && installProgressPercent !== null && (
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
            {installProgressPercent !== null ? (
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
                      ? "Tip: Install 7-Zip for much faster extraction of large mods."
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

        <div className="flex gap-3">
          <Button variant="outline" className="flex-1" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {showBack && (
            <Button
              variant="outline"
              className="flex-1"
              onClick={goBack}
              disabled={loading || installing || extracting}
            >
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back
            </Button>
          )}
          <Button
            size="lg"
            className="flex-[1.4]"
            onClick={() => void goNext()}
            disabled={primaryDisabled}
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
        </div>
      </div>
    </AppDialog>
  );
}
