import { useCallback } from "react";
import { api } from "@/lib/commands";
import { GP } from "@/lib/gamepad/buttons";
import type { InputContext } from "@/lib/gamepad/contexts";
import { focusedBrowseModId } from "@/lib/gamepad/domHelpers";
import { useGamepadContextAction } from "@/hooks/useGamepadRouter";

interface EndorseableMod {
  mod_id: number;
  version: string;
}

export function useEndorseFocusedMod(
  domain: string,
  mods: EndorseableMod[],
  context: InputContext
) {
  const endorse = useCallback(async () => {
    const modIdNum = focusedBrowseModId();
    if (!modIdNum) return;
    const mod = mods.find((m) => m.mod_id === modIdNum);
    if (!mod?.version) return;
    try {
      await api.endorseMod(domain, modIdNum, mod.version);
    } catch {
      // User may not be signed in or already endorsed
    }
  }, [domain, mods]);

  useGamepadContextAction(GP.Y, () => {
    const modIdNum = focusedBrowseModId();
    if (!modIdNum) return;
    const mod = mods.find((m) => m.mod_id === modIdNum);
    if (!mod?.version) return;
    void endorse();
    return true;
  }, context);
}
