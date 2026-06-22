import { applyCbbeDeckPreset } from "../src/lib/fomodPresets.ts";
import type { InstallWizard } from "../src/lib/nexus/types.ts";

function assert(condition: boolean, message: string) {
  if (!condition) throw new Error(message);
}

const wizard: InstallWizard = {
  name: "CBBE",
  steps: [
    {
      name: "Body",
      groups: [
        {
          id: "body",
          name: "Body",
          type: "SelectOne",
          options: [
            { id: "thin", name: "Thin" },
            { id: "curvy", name: "Curvy (recommended)" },
          ],
        },
      ],
    },
    {
      name: "Physics",
      groups: [
        {
          id: "physics",
          name: "Physics",
          type: "SelectOne",
          options: [
            { id: "full", name: "Full physics" },
            { id: "none", name: "No physics" },
          ],
        },
      ],
    },
  ],
};

const selections = applyCbbeDeckPreset(wizard);
assert(selections.length === 2, "expected two group selections");
assert(
  selections.find((s) => s.group_id === "body")?.option_ids[0] === "curvy",
  "expected curvy body preset"
);
assert(
  selections.find((s) => s.group_id === "physics")?.option_ids[0] === "none",
  "expected no physics preset"
);

console.log("CBBE deck FOMOD preset checks passed");
