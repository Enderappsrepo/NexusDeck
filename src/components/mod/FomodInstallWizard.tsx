import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Circle, ImageIcon, Square } from "lucide-react";
import type {
  FomodCondition,
  FomodFlag,
  InstallOptionGroup,
  InstallWizard,
  InstallWizardStep,
  SelectedInstallOption,
} from "@/lib/nexus/types";
import { loadFomodAssetUrl } from "@/lib/fomodAssets";
import { cn } from "@/lib/utils";

export interface WizardGroupPage {
  group: InstallOptionGroup;
  section?: string | null;
  sectionDescription?: string | null;
}

export interface WizardStepPage {
  step: InstallWizardStep;
  groups: InstallOptionGroup[];
}

interface FomodInstallWizardProps {
  wizard: InstallWizard;
  extractDir: string;
  selections: SelectedInstallOption[];
  currentStepIndex: number;
  optionFileCounts?: Record<string, number>;
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

function activeFlagsFromSelections(
  wizard: InstallWizard,
  selections: SelectedInstallOption[]
): Record<string, string> {
  const flags: Record<string, string> = {};
  const groups = flattenWizardGroups(wizard).map((p) => p.group);
  for (const group of groups) {
    const selectedIds =
      selections.find((s) => s.group_id === group.id)?.option_ids ?? [];
    for (const option of group.options) {
      if (!selectedIds.includes(option.id)) continue;
      for (const flag of option.condition_flags ?? []) {
        flags[flag.name] = flag.value;
      }
    }
  }
  return flags;
}

function conditionMatches(
  condition: FomodCondition | null | undefined,
  flags: Record<string, string>
): boolean {
  if (!condition?.flags?.length) return true;
  const isOr = condition.operator?.toLowerCase() === "or";
  const matches = (flag: FomodFlag) => flags[flag.name] === flag.value;
  return isOr ? condition.flags.some(matches) : condition.flags.every(matches);
}

export function filterVisibleWizardGroups(
  wizard: InstallWizard,
  selections: SelectedInstallOption[]
): WizardGroupPage[] {
  const flags = activeFlagsFromSelections(wizard, selections);
  const pages: WizardGroupPage[] = [];

  for (const step of wizard.steps) {
    if (!conditionMatches(step.condition, flags)) continue;
    for (const group of step.groups) {
      if (!conditionMatches(group.condition, flags)) continue;
      pages.push({
        group,
        section: step.name,
        sectionDescription: step.description,
      });
    }
  }
  return pages;
}

export function filterVisibleWizardSteps(
  wizard: InstallWizard,
  selections: SelectedInstallOption[]
): WizardStepPage[] {
  const flags = activeFlagsFromSelections(wizard, selections);
  const pages: WizardStepPage[] = [];

  for (const step of wizard.steps) {
    if (!conditionMatches(step.condition, flags)) continue;
    const groups: InstallOptionGroup[] = [];
    for (const group of step.groups) {
      if (!conditionMatches(group.condition, flags)) continue;
      groups.push(group);
    }
    if (groups.length > 0) {
      pages.push({ step, groups });
    }
  }
  return pages;
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
      return "Choose one (required)";
    case "select_at_most_one":
      return "Optional — one or none";
    case "select_at_least_one":
      return "Choose at least one";
    default:
      return "Optional — any that apply";
  }
}

function OptionListGroup({
  group,
  selections,
  optionFileCounts,
  focusedOptionId,
  onFocusOption,
  onSelectionsChange,
  disabled,
}: {
  group: InstallOptionGroup;
  selections: SelectedInstallOption[];
  optionFileCounts?: Record<string, number>;
  focusedOptionId: string | null;
  onFocusOption: (id: string) => void;
  onSelectionsChange: (selections: SelectedInstallOption[]) => void;
  disabled?: boolean;
}) {
  const selectedIds = getGroupOptionIds(selections, group.id);
  const isSelectOne = group.selection_type === "select_one";
  const isSelectAtMostOne = group.selection_type === "select_at_most_one";
  const isSingleChoice = isSelectOne || isSelectAtMostOne;

  const handleSelectOne = (optionId: string) => {
    onFocusOption(optionId);
    onSelectionsChange(updateGroupSelection(selections, group.id, [optionId]));
  };

  const handleSelectAtMostOne = (optionId: string) => {
    onFocusOption(optionId);
    const current = getGroupOptionIds(selections, group.id);
    const next = current.includes(optionId) ? [] : [optionId];
    onSelectionsChange(updateGroupSelection(selections, group.id, next));
  };

  const handleToggleMulti = (optionId: string) => {
    onFocusOption(optionId);
    const current = getGroupOptionIds(selections, group.id);
    const next = current.includes(optionId)
      ? current.filter((id) => id !== optionId)
      : [...current, optionId];
    onSelectionsChange(updateGroupSelection(selections, group.id, next));
  };

  return (
    <fieldset className="space-y-2" disabled={disabled}>
      <div>
        <legend className="text-lg font-semibold">{group.name}</legend>
        <p className="text-xs text-[var(--color-muted)]">{selectionHint(group)}</p>
      </div>
      <div className="space-y-1" role={isSingleChoice ? "radiogroup" : "group"} aria-label={group.name}>
        {group.options.map((option) => {
          const checked = selectedIds.includes(option.id);
          const inputId = `wizard-${group.id}-${option.id}`;
          const fileCount = optionFileCounts?.[option.id];
          const zeroFiles = fileCount === 0;
          const isFocused = focusedOptionId === option.id;

          return (
            <label
              key={option.id}
              htmlFor={inputId}
              className={cn(
                "focusable flex cursor-pointer items-start gap-3 rounded-xl border px-3 py-2.5 transition-all",
                checked
                  ? "border-[var(--color-primary)] bg-[var(--color-primary)]/10"
                  : isFocused
                    ? "border-[var(--color-border-strong)] bg-[var(--color-secondary)]/40"
                    : "border-[var(--color-border)] hover:border-[var(--color-primary)]/40 hover:bg-[var(--color-secondary)]/30",
                disabled && "pointer-events-none opacity-60"
              )}
              data-focusable="true"
              onMouseEnter={() => onFocusOption(option.id)}
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
                className="mt-1 h-4 w-4 accent-[var(--color-primary)]"
                disabled={disabled}
              />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-medium">{option.label}</span>
                  {fileCount !== undefined && (
                    <span
                      className={cn(
                        "rounded-md px-1.5 py-0.5 text-xs",
                        zeroFiles
                          ? "bg-[var(--color-warning)]/15 text-[var(--color-warning)]"
                          : "bg-[var(--color-secondary)] text-[var(--color-muted)]"
                      )}
                    >
                      {zeroFiles ? (
                        <span className="inline-flex items-center gap-1">
                          <AlertTriangle className="h-3 w-3" />0 files
                        </span>
                      ) : (
                        `${fileCount.toLocaleString()} files`
                      )}
                    </span>
                  )}
                </div>
                {option.description && (
                  <p className="mt-0.5 text-sm text-[var(--color-muted)]">{option.description}</p>
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
  currentStepIndex,
  optionFileCounts,
  onSelectionsChange,
  disabled = false,
}: FomodInstallWizardProps) {
  const stepPages = useMemo(
    () => filterVisibleWizardSteps(wizard, selections),
    [wizard, selections]
  );
  const currentPage = stepPages[currentStepIndex];

  const [focusedOptionId, setFocusedOptionId] = useState<string | null>(null);

  const focusedOption = useMemo(() => {
    if (!currentPage) return null;
    for (const group of currentPage.groups) {
      const selected = getGroupOptionIds(selections, group.id);
      for (const option of group.options) {
        if (focusedOptionId === option.id || selected.includes(option.id)) {
          return option;
        }
      }
    }
    return currentPage.groups[0]?.options[0] ?? null;
  }, [currentPage, selections, focusedOptionId]);

  useEffect(() => {
    if (focusedOption) setFocusedOptionId(focusedOption.id);
  }, [currentStepIndex, focusedOption?.id]);

  if (!currentPage) return null;

  return (
    <div className="grid gap-5 lg:grid-cols-[180px_minmax(0,1fr)_minmax(220px,280px)]">
      <nav className="space-y-1" aria-label="Install steps">
        {stepPages.map((page, index) => {
          const active = index === currentStepIndex;
          const done = index < currentStepIndex;
          return (
            <div
              key={page.step.id}
              className={cn(
                "rounded-lg px-3 py-2 text-sm",
                active
                  ? "bg-[var(--color-primary)]/15 font-semibold text-[var(--color-primary)]"
                  : done
                    ? "text-[var(--color-success)]"
                    : "text-[var(--color-muted)]"
              )}
            >
              <span className="flex items-center gap-2">
                {done ? (
                  <CheckCircle2 className="h-4 w-4 shrink-0" />
                ) : (
                  <Circle className={cn("h-4 w-4 shrink-0", active && "fill-current")} />
                )}
                <span className="truncate">{page.step.name}</span>
              </span>
            </div>
          );
        })}
      </nav>

      <div className="min-w-0 space-y-5">
        {currentPage.step.description && (
          <p className="text-sm text-[var(--color-muted)]">{currentPage.step.description}</p>
        )}
        {currentPage.groups.map((group) => (
          <OptionListGroup
            key={group.id}
            group={group}
            selections={selections}
            optionFileCounts={optionFileCounts}
            focusedOptionId={focusedOptionId}
            onFocusOption={setFocusedOptionId}
            onSelectionsChange={onSelectionsChange}
            disabled={disabled}
          />
        ))}
      </div>

      <aside className="space-y-3 lg:sticky lg:top-0 lg:self-start">
        {focusedOption && (
          <>
            <FomodOptionImage
              extractDir={extractDir}
              imagePath={focusedOption.image_path}
              alt={focusedOption.label}
              className="aspect-[4/5] w-full"
            />
            <div>
              <p className="font-semibold">{focusedOption.label}</p>
              {focusedOption.description && (
                <p className="mt-1 text-sm text-[var(--color-muted)]">
                  {focusedOption.description}
                </p>
              )}
            </div>
          </>
        )}
      </aside>
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

export function wizardStepIsValid(
  stepPage: WizardStepPage,
  selections: SelectedInstallOption[]
): boolean {
  return stepPage.groups.every((group) => wizardGroupIsValid(group, selections));
}

export function buildWizardStepItems(
  wizard: InstallWizard | null | undefined,
  selections: SelectedInstallOption[] = [],
  includeReview = true
) {
  const items = [{ id: "welcome", label: "Welcome" }];
  if (wizard?.steps.length) {
    for (const page of filterVisibleWizardSteps(wizard, selections)) {
      items.push({ id: page.step.id, label: page.step.name });
    }
  } else {
    items.push({ id: "options", label: "Options" });
  }
  if (includeReview) items.push({ id: "review", label: "Review" });
  return items;
}
