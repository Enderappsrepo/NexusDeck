/**
 * Platform / device heuristics that drive performance defaults.
 *
 * The Steam Deck (both LCD and OLED) reports a 1280×800 logical resolution under
 * a Linux webview. That pairing is a strong "this is a Deck" signal, used only to
 * pick the default for Performance Mode "auto" — the user can always override it
 * in Settings.
 */

export type PerformanceMode = "auto" | "on" | "off";

/**
 * Primary-navigation preference.
 * - `auto`   → bottom bar on narrow viewports or a detected Steam Deck, rail otherwise
 * - `bottom` → always the touch-first bottom bar (force it on undetectable handhelds)
 * - `sidebar`→ always the desktop left rail
 */
export type NavMode = "auto" | "bottom" | "sidebar";

export function detectSteamDeck(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") return false;
  const ua = navigator.userAgent ?? "";
  const isLinux = /linux/i.test(ua) && !/android/i.test(ua);
  const w = window.screen?.width ?? 0;
  const h = window.screen?.height ?? 0;
  const deckResolution = (w === 1280 && h === 800) || (w === 800 && h === 1280);
  return isLinux && deckResolution;
}

/** Resolve whether the lightweight visual profile should be active right now. */
export function resolvePerfActive(mode: PerformanceMode, deckDetected: boolean): boolean {
  if (mode === "on") return true;
  if (mode === "off") return false;
  return deckDetected;
}

/** Drive the `<html data-perf>` attribute the perf-mode CSS keys off of. */
export function applyPerfAttribute(active: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.perf = active ? "true" : "false";
}

export function applyDeckAttribute(deck: boolean): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.deck = deck ? "true" : "false";
}

/**
 * Resolve whether the compact (bottom-bar) navigation should be used right now.
 * `narrow` is the live viewport signal (< lg) supplied by the shell; the Deck is
 * always treated as compact so the primary handheld gets the touch-first bar even
 * at its 1280px landscape width.
 */
export function resolveCompactNav(
  mode: NavMode,
  narrow: boolean,
  deckDetected: boolean
): boolean {
  if (mode === "bottom") return true;
  if (mode === "sidebar") return false;
  return narrow || deckDetected;
}
