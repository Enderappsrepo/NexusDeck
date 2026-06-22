import type { InstallWizard, SelectedInstallOption } from "@/lib/nexus/types";
import { flattenWizardGroups } from "@/components/mod/FomodInstallWizard";

const CBBE_DECK_PREFERENCES: Array<{ pattern: RegExp; weight: number }> = [
  { pattern: /recommended|default|standard|normal/i, weight: 10 },
  { pattern: /curvy|curv/i, weight: 8 },
  { pattern: /nevernude|no nude/i, weight: 7 },
  { pattern: /unified|single/i, weight: 6 },
  { pattern: /no physics|without physics|lite|light/i, weight: 9 },
  { pattern: /cbbe/i, weight: 5 },
  { pattern: /no/i, weight: 2 },
];

function scoreOption(label: string): number {
  let score = 0;
  for (const pref of CBBE_DECK_PREFERENCES) {
    if (pref.pattern.test(label)) score += pref.weight;
  }
  return score;
}

function pickBestOption(
  groupId: string,
  options: { id: string; name: string; description?: string | null }[]
): SelectedInstallOption | null {
  if (options.length === 0) return null;
  const ranked = [...options].sort((a, b) => {
    const aLabel = `${a.name} ${a.description ?? ""}`;
    const bLabel = `${b.name} ${b.description ?? ""}`;
    return scoreOption(bLabel) - scoreOption(aLabel);
  });
  return { group_id: groupId, option_ids: [ranked[0]!.id] };
}

/** Pick sensible CBBE FOMOD options for Steam Deck (lighter physics, standard body). */
export function applyCbbeDeckPreset(wizard: InstallWizard): SelectedInstallOption[] {
  const selections: SelectedInstallOption[] = [];
  for (const page of flattenWizardGroups(wizard)) {
    const group = page.group;
    if (group.options.length === 0) continue;
    const pick =
      group.type === "SelectAny"
        ? pickBestOption(group.id, group.options)
        : pickBestOption(group.id, group.options);
    if (pick) selections.push(pick);
  }
  return selections;
}
