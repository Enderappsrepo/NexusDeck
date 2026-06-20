import { useEffect, useMemo, useState } from "react";
import { Check, CheckCircle2, Circle, ImageIcon, Square } from "lucide-react";
import type {
  InstallOptionGroup,
  InstallWizard,
  SelectedInstallOption,
} from "@/lib/nexus/types";
import { loadFomodAssetUrl } from "@/lib/fomodAssets";
import { InstallWizardStepper, type WizardStepItem } from "@/components/mod/InstallWizardStepper";
import { cn } from "@/lib/utils";

export interface WizardGroupPage {
  group: InstallOptionGroup;
  section?: string | null;
  sectionDescription?: string | null;
}

interface FomodInstallWizardProps {
  wizard: InstallWizard;
  extractDir: string;
  selections: SelectedInstallOption[];
  currentGroupIndex: number;
  onSelectionsChange: (selections: SelectedInstallOption[]) => void;
  disabled?: boolean;
}

function getGroupOptionIds(selections: SelectedInstallOption[], groupId: string): string[] {
  return selections.find((s) => s.group_id === groupId)?.option_ids ?? [];
}

function updateGroupSelection(
  selections: SelectedInstallOption[],
  groupId: string,
  optionIds: string[]
): SelectedInstallOption[] {
  const hasGroup = selections.some((s) => s.group_id === groupId);
  if (hasGroup) {
    return selections.map((s) =>
      s.group_id === groupId ? { ...s, option_ids: optionIds } : s
    );
  }
  return [...selections, { group_id: groupId, option_ids: optionIds }];
}

export function flattenWizardGroups(wizard: InstallWizard): WizardGroupPage[] {
  return wizard.steps.flatMap((step) =>
    step.groups.map((group) => ({
      group,
      section: step.name,
      sectionDescription: step.description,
    }))
  );
}

function FomodOptionImage({
  extractDir,
  imagePath,
  alt,
  className,
}: {
  extractDir: string;
  imagePath?: string | null;
  alt: string;
  className?: string;
}) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    if (!imagePath) return;

    loadFomodAssetUrl(extractDir, imagePath)
      .then((url) => {
        if (cancelled) return;
        if (url) setSrc(url);
        else setFailed(true);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });

    return () => {
      cancelled = true;
    };
  }, [extractDir, imagePath]);

  if (!imagePath || failed || !src) {
    return (
      <div
        className={cn(
          "flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-secondary)]/50 text-[var(--color-muted)]",
          className
        )}
      >
        <ImageIcon className="h-10 w-10 opacity-30" />
        <span className="px-3 text-center text-xs opacity-70">{alt}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      className={cn(
        "rounded-xl border border-[var(--color-border)] object-contain bg-[var(--color-secondary)]/30",
        className
      )}
      loading="lazy"
      onError={() => setFailed(true)}
    />
  );
}

function selectionHint(group: InstallOptionGroup) {
  switch (group.selection_type) {
    case "select_one":
      return "Choose one option (required)";
    case "select_at_most_one":
      return "Optional — choose one or none";
    case "select_at_least_one":
      return "Choose at least one option";
    default:
      return "Optional — choose any that apply";
  }
}

function WizardGroupPageView({
  page,
  selections,
  extractDir,
  onSelectionsChange,
  disabled,
}: {
  page: WizardGroupPage;
  selections: SelectedInstallOption[];
  extractDir: string;
  onSelectionsChange: (selections: SelectedInstallOption[]) => void;
  disabled?: boolean;
}) {
  const group = page.group;
  const selectedIds = getGroupOptionIds(selections, group.id);
  const isSelectOne = group.selection_type === "select_one";
  const isSelectAtMostOne = group.selection_type === "select_at_most_one";
  const isSingleChoice = isSelectOne || isSelectAtMostOne;
  const isMulti =
    group.selection_type === "select_any" || group.selection_type === "select_at_least_one";

  const handleSelectOne = (optionId: string) => {
    onSelectionsChange(updateGroupSelection(selections, group.id, [optionId]));
  };

  const handleSelectAtMostOne = (optionId: string) => {
    const current = getGroupOptionIds(selections, group.id);
    const next = current.includes(optionId) ? [] : [optionId];
    onSelectionsChange(updateGroupSelection(selections, group.id, next));
  };

  const handleToggleMulti = (optionId: string) => {
    const current = getGroupOptionIds(selections, group.id);
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    onSelectionsChange(updateGroupSelection(selections, group.id, next));
  };

  return (
    <fieldset className="space-y-4" disabled={disabled}>
      {page.section && page.section !== group.name && (
        <p className="text-sm font-medium text-[var(--color-muted)]">{page.section}</p>
      )}
      <div>
        <legend className="text-2xl font-semibold">{group.name}</legend>
        {page.sectionDescription && (
          <p className="mt-1 text-sm text-[var(--color-muted)]">{page.sectionDescription}</p>
        )}
        <p className="mt-2 text-sm text-[var(--color-muted)]">{selectionHint(group)}</p>
      </div>

      <div
        className={cn("grid gap-4", group.options.length > 2 ? "sm:grid-cols-2" : "grid-cols-1")}
        role={isSingleChoice ? "radiogroup" : "group"}
        aria-label={group.name}
      >
        {group.options.map((option) => {
          const checked = selectedIds.includes(option.id);
          const inputId = `wizard-${group.id}-${option.id}`;

          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className={cn(
                "focusable relative flex cursor-pointer flex-col overflow-hidden rounded-2xl border-2 transition-all",
                checked
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10 shadow-[var(--shadow-md)]"
                  : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]/40",
                disabled && "pointer-events-none opacity-60"
              )}
              data-focusable="true"
            >
              <input
                id={inputId}
                type={isSingleChoice ? "radio" : "checkbox"}
                name={isSingleChoice ? `wizard-${group.id}` : undefined}
                checked={checked}
                onChange={() => {
                  if (isSelectOne) handleSelectOne(option.id);
                  else if (isSelectAtMostOne) handleSelectAtMostOne(option.id);
                  else handleToggleMulti(option.id);
                }}
                className="sr-only"
                disabled={disabled}
              />

              <div className="absolute right-3 top-3 z-10">
                {isSingleChoice ? (
                  checked ? (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full bg-[var(--color-primary)] text-white">
                      <Circle className="h-3 w-3 fill-current" />
                    </span>
                  ) : (
                    <span className="flex h-7 w-7 items-center justify-center rounded-full border-2 border-[var(--color-border)] bg-[var(--color-card)]/90" />
                  )
                ) : checked ? (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md bg-[var(--color-primary)] text-white">
                    <Check className="h-4 w-4" />
                  </span>
                ) : (
                  <span className="flex h-7 w-7 items-center justify-center rounded-md border-2 border-[var(--color-border)] bg-[var(--color-card)]/90 text-[var(--color-muted)]">
                    <Square className="h-3.5 w-3.5" />
                  </span>
                )}
              </div>

              <FomodOptionImage
                extractDir={extractDir}
                imagePath={option.image_path}
                alt={option.label}
                className="aspect-[16/10] w-full"
              />

              <div className="space-y-1 p-4">
                <div className="flex items-start justify-between gap-2 pr-8">
                  <p className="font-medium leading-snug">{option.label}</p>
                  {checked && (
                    <CheckCircle2 className="h-5 w-5 shrink-0 text-[var(--color-primary)]" />
                  )}
                </div>
                {option.description && (
                  <p className="text-sm text-[var(--color-muted)]">{option.description}</p>
                )}
              </div>
            </label>
          );
        })}
      </div>
    </fieldset>
  );
}

export function FomodInstallWizard({
  wizard,
  extractDir,
  selections,
  currentGroupIndex,
  onSelectionsChange,
  disabled = false,
}: FomodInstallWizardProps) {
  const pages = useMemo(() => flattenWizardGroups(wizard), [wizard]);
  const stepItems: WizardStepItem[] = useMemo(
    () => pages.map((page) => ({ id: page.group.id, label: page.group.name })),
    [pages]
  );

  const currentPage = pages[currentGroupIndex];
  const [moduleImage, setModuleImage] = useState<string | null>(null);

  useEffect(() => {
    if (!wizard.module_image_path) {
      setModuleImage(null);
      return;
    }
    loadFomodAssetUrl(extractDir, wizard.module_image_path).then(setModuleImage);
  }, [extractDir, wizard.module_image_path]);

  if (!currentPage) return null;

  return (
    <div className="space-y-5">
      {moduleImage && currentGroupIndex === 0 && (
        <div className="overflow-hidden rounded-2xl border border-[var(--color-border)]">
          <img
            src={moduleImage}
            alt={wizard.module_name ?? "Mod installer"}
            className="max-h-36 w-full object-cover"
          />
        </div>
      )}

      <InstallWizardStepper steps={stepItems} currentIndex={currentGroupIndex} />

      <WizardGroupPageView
        page={currentPage}
        selections={selections}
        extractDir={extractDir}
        onSelectionsChange={onSelectionsChange}
        disabled={disabled}
      />
    </div>
  );
}

export function wizardGroupIsValid(
  group: InstallOptionGroup,
  selections: SelectedInstallOption[]
): boolean {
  const selected = getGroupOptionIds(selections, group.id);
  switch (group.selection_type) {
    case "select_one":
    case "select_at_least_one":
      return selected.length > 0;
    case "select_at_most_one":
    case "select_any":
      return true;
    default:
      return true;
  }
}

export function buildWizardStepItems(
  wizard: InstallWizard | null | undefined,
  includeReview = true
): WizardStepItem[] {
  const items: WizardStepItem[] = [{ id: "welcome", label: "Welcome" }];
  if (wizard?.steps.length) {
    for (const step of wizard.steps) {
      for (const group of step.groups) {
        items.push({ id: group.id, label: group.name });
      }
    }
  } else {
    items.push({ id: "options", label: "Options" });
  }
  if (includeReview) items.push({ id: "review", label: "Review" });
  return items;
}
