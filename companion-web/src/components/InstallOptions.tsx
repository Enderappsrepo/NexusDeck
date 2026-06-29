import { useMemo } from "react";
import type {
  InstallOptionGroup,
  InstallWizard,
  SelectedInstallOption,
} from "./types";

function flagsFromSelections(
  groups: InstallOptionGroup[],
  selections: SelectedInstallOption[]
): Record<string, string> {
  const flags: Record<string, string> = {};
  for (const group of groups) {
    const selected =
      selections.find((s) => s.group_id === group.id)?.option_ids ?? [];
    for (const option of group.options) {
      if (!selected.includes(option.id)) continue;
      for (const flag of option.condition_flags ?? []) {
        flags[flag.name] = flag.value;
      }
    }
  }
  return flags;
}

function conditionVisible(
  condition: InstallOptionGroup["condition"],
  flags: Record<string, string>
): boolean {
  if (!condition?.flags?.length) return true;
  const isOr = condition.operator?.toLowerCase() === "or";
  const match = (f: { name: string; value: string }) => flags[f.name] === f.value;
  return isOr ? condition.flags.some(match) : condition.flags.every(match);
}

function dedupeGroups(groups: InstallOptionGroup[]): InstallOptionGroup[] {
  const seen = new Set<string>();
  return groups.filter((g) => {
    if (seen.has(g.id)) return false;
    seen.add(g.id);
    return true;
  });
}

function visibleGroups(
  wizard: InstallWizard | null,
  flatGroups: InstallOptionGroup[],
  selections: SelectedInstallOption[]
): InstallOptionGroup[] {
  const raw = wizard?.steps?.length
    ? wizard.steps.flatMap((s) => s.groups)
    : flatGroups;
  const allGroups = dedupeGroups(raw);
  const flags = flagsFromSelections(allGroups, selections);
  return allGroups.filter((g) => conditionVisible(g.condition, flags));
}

function updateSelection(
  selections: SelectedInstallOption[],
  groupId: string,
  optionIds: string[]
): SelectedInstallOption[] {
  const exists = selections.some((s) => s.group_id === groupId);
  if (exists) {
    return selections.map((s) =>
      s.group_id === groupId ? { ...s, option_ids: optionIds } : s
    );
  }
  return [...selections, { group_id: groupId, option_ids: optionIds }];
}

interface InstallOptionsProps {
  wizard: InstallWizard | null;
  optionGroups: InstallOptionGroup[];
  selections: SelectedInstallOption[];
  onChange: (next: SelectedInstallOption[]) => void;
}

export function InstallOptions({
  wizard,
  optionGroups,
  selections,
  onChange,
}: InstallOptionsProps) {
  const groups = useMemo(
    () => visibleGroups(wizard, optionGroups, selections),
    [wizard, optionGroups, selections]
  );

  if (groups.length === 0) {
    return (
      <p className="text-sm text-[var(--color-muted)]">
        No install options — the mod will install with default settings.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {wizard?.module_name && (
        <p className="text-sm font-medium text-white">{wizard.module_name}</p>
      )}
      {groups.map((group) => {
        const selected =
          selections.find((s) => s.group_id === group.id)?.option_ids ?? [];
        const multi =
          group.selection_type === "select_any" ||
          group.selection_type === "select_at_least_one";

        return (
          <div key={group.id} className="cc-panel space-y-2">
            <p className="text-[11px] font-bold uppercase tracking-[0.2em] text-[var(--cc-gold)]">
              {group.name}
            </p>
            <div className="space-y-2">
              {group.options.map((option) => {
                const checked = selected.includes(option.id);
                return (
                  <label
                    key={option.id}
                    className={`cc-file ${checked ? "cc-file-active" : ""}`}
                  >
                    <input
                      type={multi ? "checkbox" : "radio"}
                      name={group.id}
                      checked={checked}
                      className="mt-1"
                      onChange={() => {
                        if (multi) {
                          const next = checked
                            ? selected.filter((id) => id !== option.id)
                            : [...selected, option.id];
                          onChange(updateSelection(selections, group.id, next));
                        } else {
                          onChange(updateSelection(selections, group.id, [option.id]));
                        }
                      }}
                    />
                    <span className="min-w-0">
                      <span className="block font-medium">{option.label}</span>
                      {option.description && (
                        <span className="mt-0.5 block text-xs text-[var(--color-muted)]">
                          {option.description}
                        </span>
                      )}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function defaultSelectionsFromPrepare(
  prepare: NonNullable<import("./types").CompanionPreparePayload>
): SelectedInstallOption[] {
  return prepare.default_selections;
}
