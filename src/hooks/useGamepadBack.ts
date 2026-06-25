import { useEffect } from "react";
import { useGamepadBackHandler } from "@/hooks/useGamepadTabs";
import { useAppBack } from "@/hooks/useAppBack";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";

export function useGamepadBack() {
  const goBack = useAppBack();
  const { controllerActive } = useGamepadRouterState();
  useGamepadBackHandler(goBack);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== "Escape" && e.key !== "Backspace") return;
      // Steam maps B to Esc/Backspace; the gamepad B already drives back, so
      // ignore the mirrored key whenever a pad is present to avoid double-back.
      if (controllerActive || gamepadRouter.isPadConnected()) return;
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
