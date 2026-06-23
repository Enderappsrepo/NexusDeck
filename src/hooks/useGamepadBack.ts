import { useEffect } from "react";
import { useGamepadBackHandler } from "@/hooks/useGamepadTabs";
import { useAppBack } from "@/hooks/useAppBack";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";

export function useGamepadBack() {
  const goBack = useAppBack();
  const { controllerActive } = useGamepadRouterState();
  useGamepadBackHandler(goBack);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      // Avoid double-back when Steam also maps B to Backspace.
      if (controllerActive && e.key === "Backspace") return;
      const target = e.target as HTMLElement;
      if (
        target.tagName === "INPUT" ||
        target.tagName === "TEXTAREA" ||
        target.tagName === "SELECT" ||
        target.isContentEditable
      ) {
        return;
      }
      e.preventDefault();
      goBack();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [goBack, controllerActive]);
}
