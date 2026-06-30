import { useEffect, useRef } from "react";

export function useSheetA11y(open: boolean, onClose: () => void, label = "Dialog") {
  const sheetRef = useRef<HTMLDivElement>(null);
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    sheetRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onCloseRef.current();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [open]);

  return { sheetRef, sheetProps: { role: "dialog" as const, "aria-modal": true, "aria-label": label, tabIndex: -1 as const } };
}
