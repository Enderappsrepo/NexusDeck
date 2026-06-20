import { useGamepadRouterState } from "@/hooks/useGamepadRouter";
import { CONTEXT_HINTS } from "@/lib/gamepad/contexts";

export function ControllerHintBar() {
  const { controllerActive, hintBarVisible, context } = useGamepadRouterState();

  if (!controllerActive || !hintBarVisible) return null;

  const hints = CONTEXT_HINTS[context] ?? CONTEXT_HINTS.global;
  const entries = Object.entries(hints).filter(([, v]) => v);

  return (
    <div
      className="pointer-events-none fixed inset-x-0 bottom-0 z-40 border-t border-[var(--color-border)] bg-[var(--color-card)]/95 px-4 py-2 backdrop-blur-md"
      data-controller-hint-bar
      aria-hidden
    >
      <div className="mx-auto flex max-w-4xl flex-wrap items-center justify-center gap-x-4 gap-y-1 text-sm text-[var(--color-muted)]">
        {entries.map(([key, label]) => {
          const colonIdx = label.indexOf(":");
          const button = colonIdx >= 0 ? label.slice(0, colonIdx).trim() : label;
          const desc = colonIdx >= 0 ? label.slice(colonIdx + 1).trim() : key;
          return (
            <span key={key} className="whitespace-nowrap">
              <kbd className="mr-1.5 rounded-md bg-[var(--color-secondary)] px-2 py-0.5 font-mono text-xs font-semibold text-[var(--color-foreground)]">
                {button}
              </kbd>
              {desc}
            </span>
          );
        })}
        <span className="whitespace-nowrap text-xs opacity-60">View: toggle hints</span>
      </div>
    </div>
  );
}
