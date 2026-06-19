import { useCallback } from "react";
import { useGamepad } from "@/hooks/useFocusNavigation";

export function useGamepadBackHandler(onBack: () => void) {
  const handleBack = useCallback(
    (button: number) => {
      if (button === 1) onBack();
    },
    [onBack]
  );

  useGamepad(handleBack);
}

export function useGamepadTabs(
  tabIds: string[],
  activeTab: string,
  onTabChange: (tabId: string) => void
) {
  const handleTabs = useCallback(
    (button: number) => {
      const idx = tabIds.indexOf(activeTab);
      if (idx === -1) return;
      if (button === 4) {
        const prev = tabIds[(idx - 1 + tabIds.length) % tabIds.length];
        onTabChange(prev);
      } else if (button === 5) {
        const next = tabIds[(idx + 1) % tabIds.length];
        onTabChange(next);
      }
    },
    [tabIds, activeTab, onTabChange]
  );

  useGamepad(handleTabs);
}
