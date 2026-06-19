import { useEffect, useCallback, useRef } from "react";

const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable="true"]';

export function useGamepad(onButton: (button: number) => void) {
  useEffect(() => {
    let raf: number;
    const pressed = new Set<number>();

    const poll = () => {
      const pads = navigator.getGamepads?.() ?? [];
      for (const pad of pads) {
        if (!pad) continue;
        pad.buttons.forEach((btn, i) => {
          if (btn.pressed && !pressed.has(i)) {
            pressed.add(i);
            onButton(i);
          } else if (!btn.pressed) {
            pressed.delete(i);
          }
        });
      }
      raf = requestAnimationFrame(poll);
    };
    raf = requestAnimationFrame(poll);
    return () => cancelAnimationFrame(raf);
  }, [onButton]);
}

export function useFocusNavigation(containerRef: React.RefObject<HTMLElement | null>) {
  const getFocusable = useCallback(() => {
    const root = containerRef.current ?? document.body;
    return Array.from(root.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
      (el) => el.offsetParent !== null || el === document.activeElement
    );
  }, [containerRef]);

  const focusIndex = useRef(0);

  const moveFocus = useCallback(
    (direction: "next" | "prev" | "up" | "down") => {
      const items = getFocusable();
      if (items.length === 0) return;

      const current = document.activeElement as HTMLElement;
      let idx = items.indexOf(current);
      if (idx === -1) idx = focusIndex.current;

      if (direction === "next") idx = (idx + 1) % items.length;
      else if (direction === "prev") idx = (idx - 1 + items.length) % items.length;
      else if (direction === "down" || direction === "up") {
        const rect = current?.getBoundingClientRect() ?? items[idx]?.getBoundingClientRect();
        if (!rect) return;
        const candidates = items
          .map((el, i) => ({ el, i, r: el.getBoundingClientRect() }))
          .filter(({ r }) =>
            direction === "down" ? r.top > rect.top + 4 : r.top < rect.top - 4
          )
          .sort((a, b) =>
            direction === "down" ? a.r.top - b.r.top : b.r.top - a.r.top
          );
        if (candidates.length > 0) idx = candidates[0].i;
      }

      focusIndex.current = idx;
      items[idx]?.focus();
    },
    [getFocusable]
  );

  const handleGamepadButton = useCallback(
    (button: number) => {
      switch (button) {
        case 12:
          moveFocus("up");
          break;
        case 13:
          moveFocus("down");
          break;
        case 14:
          moveFocus("prev");
          break;
        case 15:
          moveFocus("next");
          break;
        case 0: {
          const el = document.activeElement as HTMLElement;
          if (el?.dataset.launchPrimary === "true") {
            el.click();
          } else {
            el?.click();
          }
          break;
        }
        case 3: {
          const el = document.activeElement as HTMLElement;
          if (el?.dataset.launchPrimary === "true") {
            el.dispatchEvent(new CustomEvent("nexusdeck-quick-launch"));
          }
          break;
        }
        default:
          break;
      }
    },
    [moveFocus]
  );

  useGamepad(handleGamepadButton);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        moveFocus("down");
      } else if (e.key === "ArrowUp") {
        e.preventDefault();
        moveFocus("up");
      } else if (e.key === "ArrowRight") {
        e.preventDefault();
        moveFocus("next");
      } else if (e.key === "ArrowLeft") {
        e.preventDefault();
        moveFocus("prev");
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [moveFocus]);
}

export const GAMEPAD_HINTS = {
  navigate: "D-pad / Stick",
  confirm: "A",
  back: "B",
  tabs: "L1 / R1",
  launch: "Y",
};
