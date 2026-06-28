import { useEffect, useState } from "react";
import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { CONTEXT_HINTS } from "@/lib/gamepad/contexts";
import { useSettingsStore } from "@/stores/settingsStore";
import { resolveCompactNav } from "@/lib/platform";
import { useIsNarrow } from "@/hooks/useMediaQuery";

function parseHintEntry(label: string): { button: string; desc: string } {
  const colonIdx = label.indexOf(":");
  if (colonIdx >= 0) {
    return {
      button: label.slice(0, colonIdx).trim(),
      desc: label.slice(colonIdx + 1).trim(),
    };
  }
  return { button: label, desc: label };
}

/**
 * Deck-specific action bar shown when ControllerHintBar is hidden in Gaming Mode.
 */
export function DeckActionBar() {
  const { controllerActive, context } = useGamepadRouterState();
  const deckDetected = useSettingsStore((s) => s.deckDetected);
  const navMode = useSettingsStore((s) => s.navMode);
  const narrow = useIsNarrow();
  const compactNav = resolveCompactNav(navMode, narrow, deckDetected);
  const [focusedLabel, setFocusedLabel] = useState<string | null>(null);

  useEffect(() => {
    const syncFocus = () => {
      const el = document.activeElement as HTMLElement | null;
      if (!el || el === document.body) {
        setFocusedLabel(null);
        return;
      }
      const modRow = el.closest("[data-nexus-mod-id]");
      if (modRow instanceof HTMLElement) {
        const name = modRow.querySelector("[data-mod-name]")?.textContent?.trim();
        setFocusedLabel(name ?? null);
        return;
      }
      const label =
        el.getAttribute("aria-label") ??
        el.getAttribute("title") ??
        (el.textContent?.trim().slice(0, 48) || null);
      setFocusedLabel(label);
    };
    document.addEventListener("focusin", syncFocus);
    syncFocus();
    return () => document.removeEventListener("focusin", syncFocus);
  }, []);

  if (!deckDetected || !compactNav || !controllerActive) return null;

  const hints = CONTEXT_HINTS[context] ?? CONTEXT_HINTS.global;
  const entries = Object.entries(hints).filter(([, v]) => v) as Array<[string, string]>;

  return (
    <div
      className="pointer-events-none fixed inset-x-0 z-[55] border-t border-[var(--color-border)] bg-[var(--color-card)]/96 px-3 py-2 backdrop-blur-md"
      style={{ bottom: "var(--deck-action-bar-bottom, 4.25rem)" }}
      data-deck-action-bar
      aria-hidden
    >
      {focusedLabel && (
        <p className="mb-1 truncate text-center text-xs font-medium text-[var(--color-primary)]">
          {focusedLabel}
        </p>
      )}
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-center gap-x-3 gap-y-1 text-sm text-[var(--color-muted)]">
        {entries.map(([key, label]) => {
          const { button, desc } = parseHintEntry(label);
          return (
            <span key={key} className="whitespace-nowrap">
              <kbd className="mr-1 rounded-md bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-foreground)] shadow-[var(--shadow-sm)]">
                {button}
              </kbd>
              {desc}
            </span>
          );
        })}
      </div>
    </div>
  );
}
