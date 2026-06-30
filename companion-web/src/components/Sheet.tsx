import { createPortal } from "react-dom";
import { useEffect, type ReactNode } from "react";
import { useSheetA11y } from "../hooks/useSheetA11y";

export function Sheet({
  open,
  onClose,
  label,
  title,
  subtitle,
  headerActions,
  children,
  footer,
}: {
  open: boolean;
  onClose: () => void;
  label: string;
  title: string;
  subtitle?: string;
  headerActions?: ReactNode;
  children: ReactNode;
  footer?: ReactNode;
}) {
  const { sheetRef, sheetProps } = useSheetA11y(open, onClose, label);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="cc-sheet-backdrop" onClick={onClose} role="presentation">
      <div
        ref={sheetRef}
        className="cc-sheet"
        {...sheetProps}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cc-sheet-handle" aria-hidden="true" />
        <header className="cc-sheet-header">
          <div className="min-w-0 flex-1">
            <p className="cc-sheet-title">{title}</p>
            {subtitle && <p className="cc-sheet-subtitle">{subtitle}</p>}
          </div>
          <div className="flex shrink-0 items-start gap-2">
            {headerActions}
            <button type="button" className="cc-sheet-close" onClick={onClose} aria-label="Close">
              ×
            </button>
          </div>
        </header>
        <div className="cc-sheet-body">{children}</div>
        {footer && <footer className="cc-sheet-footer">{footer}</footer>}
      </div>
    </div>,
    document.body
  );
}
