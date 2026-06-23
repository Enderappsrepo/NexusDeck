import { useEffect, useCallback } from "react";
import { moveFocus, isTypingElement, activateFocused } from "@/lib/gamepad/focusNavigation";
import { gamepadRouter } from "@/lib/gamepad/GamepadRouter";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";

export function useFocusNavigation(containerRef: React.RefObject<HTMLElement | null>) {
  const { controllerActive } = useGamepadRouterState();

  const handleCustomButton = useCallback((button: number) => {
    // Reserved for component-specific button overrides via router
    void button;
  }, []);

  useEffect(() => {
    return gamepadRouter.onButton(handleCustomButton);
  }, [handleCustomButton]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (isTypingElement(document.activeElement)) return;
      // Steam Input often mirrors face buttons as keyboard keys; ignore those
      // while the in-app router is handling the physical controller.
      if (controllerActive) return;

      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus("down", containerRef.current);
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus("up", containerRef.current);
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus("next", containerRef.current);
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus("prev", containerRef.current);
      } else if (e.key === "Enter" || e.key === " ") {
        const el = document.activeElement as HTMLElement;
        if (
          el?.dataset.focusable === "true" ||
          el?.getAttribute("role") === "button" ||
          el?.tagName === "BUTTON"
        ) {
          e.preventDefault();
          activateFocused();
        }
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [containerRef, controllerActive]);
}

/** @deprecated Use gamepadRouter directly */
export function useGamepad(_onButton: (button: number) => void) {
  // Kept for backwards compat — no-op, router handles all input
}

export const GAMEPAD_HINTS = {
  navigate: "D-pad / Stick",
  confirm: "A",
  back: "B",
  tabs: "L1 / R1",
  launch: "Y",
  scroll: "L2 / R2",
  menu: "Menu",
  secondary: "X",
};
