import { isTypingElement } from "./focusNavigation";
import { gamepadRouter } from "./GamepadRouter";

const MIRRORED_KEYS = new Set([
  "ArrowUp",
  "ArrowDown",
  "ArrowLeft",
  "ArrowRight",
  "Enter",
  " ",
  "Escape",
  "Backspace",
]);

/** Block keyboard events Steam Input mirrors from the same physical button press. */
export function installMirroredKeySuppressor(): () => void {
  const onKeyDown = (e: KeyboardEvent) => {
    if (!gamepadRouter.isPadConnected()) return;
    if (!MIRRORED_KEYS.has(e.key)) return;
    if (isTypingElement(document.activeElement) && e.key !== "Escape") return;
    e.preventDefault();
    e.stopImmediatePropagation();
  };

  window.addEventListener("keydown", onKeyDown, true);
  return () => window.removeEventListener("keydown", onKeyDown, true);
}
