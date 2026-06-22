import { Layers } from "lucide-react";
import { OptionCard } from "@/components/mod/OptionCard";
import type { InstallOptionGroup, SelectedInstallOption } from "@/lib/nexus/types";

interface InstallOptionsPanelProps {
  groups: InstallOptionGroup[];
  selections: SelectedInstallOption[];
  onChange: (selections: SelectedInstallOption[]) => void;
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

export function InstallOptionsPanel({
  groups,
  selections,
  onChange,
  disabled = false,
}: InstallOptionsPanelProps) {
  if (groups.length === 0) return null;

  const handleSelectOne = (group: InstallOptionGroup, optionId: string) => {
    onChange(updateGroupSelection(selections, group.id, [optionId]));
  };

  const handleSelectAny = (group: InstallOptionGroup, optionId: string, checked: boolean) => {
    const current = getGroupOptionIds(selections, group.id);
    const next = checked ? [...current, optionId] : current.filter((id) => id !== optionId);
    onChange(updateGroupSelection(selections, group.id, next));
  };

  return (
    <div className="space-y-4 rounded-xl border border-[var(--color-border)] p-4">
      <div className="flex items-center gap-2">
        <Layers className="h-5 w-5" />
        <span className="font-medium">Install options</span>
      </div>
      <p className="text-sm text-[var(--color-muted)]">
        This mod includes optional components. Choose which parts to install.
      </p>

      <div className="space-y-4">
        {groups.map((group) => {
          const selectedIds = getGroupOptionIds(selections, group.id);
          const isSelectOne = group.selection_type === "select_one";
          const isSelectAtMostOne = group.selection_type === "select_at_most_one";
          const isSingleChoice = isSelectOne || isSelectAtMostOne;
          const isAtLeastOne = group.selection_type === "select_at_least_one";

          return (
            <fieldset key={group.id} className="space-y-2" disabled={disabled}>
              <legend className="text-sm font-medium">{group.name}</legend>
              {isSelectOne && (
                <p className="text-xs text-[var(--color-muted)]">Choose one (required)</p>
              )}
              {isSelectAtMostOne && (
                <p className="text-xs text-[var(--color-muted)]">Optional — choose one or none</p>
              )}
              {isAtLeastOne && (
                <p className="text-xs text-[var(--color-muted)]">Choose at least one</p>
              )}
              {!isSingleChoice && !isAtLeastOne && (
                <p className="text-xs text-[var(--color-muted)]">Choose any that apply</p>
              )}

              <div className="space-y-2">
                {group.options.map((option) => {
                  const checked = selectedIds.includes(option.id);

                  if (isSingleChoice) {
                    return (
                      <OptionCard
                        key={option.id}
                        control="radio"
                        checked={checked}
                        disabled={disabled}
                        onToggle={() => {
                          if (isSelectAtMostOne && checked) {
                            onChange(updateGroupSelection(selections, group.id, []));
                          } else {
                            handleSelectOne(group, option.id);
                          }
                        }}
                        title={option.label}
                        description={option.description ?? undefined}
                      />
                    );
                  }

                  return (
                    <OptionCard
                      key={option.id}
                      control="checkbox"
                      checked={checked}
                      disabled={disabled}
                      onToggle={() => handleSelectAny(group, option.id, !checked)}
                      title={option.label}
                      description={option.description ?? undefined}
                    />
                  );
                })}
              </div>
            </fieldset>
          );
        })}
      </div>
    </div>
  );
}
