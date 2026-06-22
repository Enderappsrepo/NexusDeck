import { moveFocus, focusFirst, getFocusableElements } from "@/lib/gamepad/focusNavigation";

window.addEventListener("keydown", (e) => {
  if (e.key === "ArrowDown") {
    e.preventDefault();
    moveFocus("next");
  } else if (e.key === "ArrowUp") {
    e.preventDefault();
    moveFocus("prev");
  }
});

focusFirst(document.getElementById("fixture"));

(window as Window & { __focusTest?: typeof import("@/lib/gamepad/focusNavigation") }).__focusTest =
  { moveFocus, focusFirst, getFocusableElements };
