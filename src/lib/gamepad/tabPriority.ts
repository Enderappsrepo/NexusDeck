import type { TabHandler } from "@/lib/gamepad/GamepadRouter";

/** Page-scoped tab handlers beat sidebar; most recent registration wins within scope. */
export function resolveTabHandler(handlers: TabHandler[]): TabHandler | undefined {
  for (let i = handlers.length - 1; i >= 0; i--) {
    if (handlers[i].scope !== "sidebar") return handlers[i];
  }
  return handlers[handlers.length - 1];
}
