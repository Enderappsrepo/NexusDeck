const FOCUSABLE =
  'button:not([disabled]):not([data-gamepad-skip="true"]), [href]:not([data-gamepad-skip="true"]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable="true"]';

/** Primary page content — excludes header chrome and the sidebar rail. */
export function defaultFocusContainer(): HTMLElement {
  return (
    document.querySelector<HTMLElement>("main.app-scroll-pane") ??
    document.querySelector<HTMLElement>("main[data-scroll-pane]") ??
    document.body
  );
}

export function isTypingElement(el: Element | null): boolean {
  if (!el) return false;
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el as HTMLElement).isContentEditable
  );
}

function isFocusableVisible(el: HTMLElement): boolean {
  if (el.dataset.gamepadSkip === "true") return false;
  const style = getComputedStyle(el);
  return (
    (el.offsetParent !== null || el === document.activeElement) &&
    style.display !== "none" &&
    style.visibility !== "hidden" &&
    style.pointerEvents !== "none"
  );
}

export function getFocusableElements(root: HTMLElement | Document = document): HTMLElement[] {
  const container = root instanceof Document ? root.body : root;
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE)).filter(
    isFocusableVisible
  );
}

let focusIndex = 0;

type FocusDirection = "next" | "prev" | "up" | "down";

/**
 * Pick the best element in the pressed direction using 2D geometry.
 *
 * The key rule is *band alignment*: a candidate whose perpendicular extent
 * overlaps the current element's (i.e. it's in the same column when moving
 * up/down, or the same row when moving left/right) is treated as "in line" and
 * chosen by nearest travel-axis distance. Only when nothing overlaps the band do
 * we fall back to a weighted center distance. This stops the focus ring from
 * drifting diagonally to whatever happens to be closest by center — the #1 cause
 * of "I pressed down and it jumped somewhere random" on a controller.
 *
 * Returns -1 when nothing lies that way.
 */
function directionalPick(
  items: HTMLElement[],
  current: HTMLElement,
  direction: FocusDirection
): number {
  const cur = current.getBoundingClientRect();
  const cx = cur.left + cur.width / 2;
  const cy = cur.top + cur.height / 2;
  let best = -1;
  let bestScore = Infinity;
  // Large constant so any band-aligned candidate always outranks a misaligned one.
  const OFF_BAND = 1_000_000;

  items.forEach((el, i) => {
    if (el === current) return;
    const r = el.getBoundingClientRect();
    if (r.width === 0 && r.height === 0) return;
    const dx = r.left + r.width / 2 - cx;
    const dy = r.top + r.height / 2 - cy;

    let primary: number;
    let cross: number;
    let aligned: boolean;
    switch (direction) {
      case "down":
        if (dy <= 1) return;
        primary = dy;
        cross = Math.abs(dx);
        aligned = r.left < cur.right && r.right > cur.left;
        break;
      case "up":
        if (dy >= -1) return;
        primary = -dy;
        cross = Math.abs(dx);
        aligned = r.left < cur.right && r.right > cur.left;
        break;
      case "next":
        if (dx <= 1) return;
        primary = dx;
        cross = Math.abs(dy);
        aligned = r.top < cur.bottom && r.bottom > cur.top;
        break;
      default:
        if (dx >= -1) return;
        primary = -dx;
        cross = Math.abs(dy);
        aligned = r.top < cur.bottom && r.bottom > cur.top;
        break;
    }

    // Aligned: rank by travel distance with a light cross tiebreak. Misaligned:
    // only reachable when no aligned candidate exists, ranked like before.
    const score = aligned ? primary + cross * 0.25 : OFF_BAND + primary + cross * 2;
    if (score < bestScore) {
      bestScore = score;
      best = i;
    }
  });

  return best;
}

export function moveFocus(
  direction: FocusDirection,
  container?: HTMLElement | null
): void {
  const current = document.activeElement as HTMLElement;

  // Index-driven widgets (e.g. the mod coverflow) opt out of spatial nav: when
  // focus is inside a [data-nav-intercept] container, hand it the direction. If
  // it consumes the move (preventDefault) we stop; otherwise (e.g. up/down to
  // leave the widget) we fall through to normal spatial navigation. All input
  // sources — d-pad, stick, keyboard — funnel through here, so one hook covers
  // them all.
  const intercept = current?.closest?.<HTMLElement>("[data-nav-intercept]");
  if (intercept) {
    const ev = new CustomEvent("nd-nav", {
      detail: { direction },
      cancelable: true,
      bubbles: false,
    });
    intercept.dispatchEvent(ev);
    if (ev.defaultPrevented) return;
  }
  // Scope, in priority order: explicit container, a focus group, an open modal
  // dialog (so D-pad can't escape to the background behind an installer), else
  // the whole page.
  const group = current?.closest<HTMLElement>("[data-focus-group]");
  const dialog = current?.closest<HTMLElement>('[role="dialog"]');
  const pane = current?.closest<HTMLElement>("[data-scroll-pane]");
  const root = container ?? group ?? dialog ?? pane ?? defaultFocusContainer();
  const items = getFocusableElements(root);
  if (items.length === 0) return;

  const idx = items.indexOf(current);
  if (idx === -1) {
    const start = Math.min(focusIndex, items.length - 1);
    focusIndex = start;
    items[start]?.focus();
    return;
  }

  const picked = directionalPick(items, current, direction);
  if (picked !== -1) {
    focusIndex = picked;
    items[picked].focus();
    return;
  }

  // No neighbour that way: wrap in DOM order for left/right so a list still
  // cycles; for up/down stay put (already at the edge of this region).
  if (direction === "next" || direction === "prev") {
    const delta = direction === "next" ? 1 : -1;
    const wrapped = (idx + delta + items.length) % items.length;
    focusIndex = wrapped;
    items[wrapped].focus();
  }
}

/** Reset directional-nav state so the next move starts from the top of the page. */
export function resetFocusIndex(): void {
  focusIndex = 0;
}

/**
 * Focus the first interactive element within `container` (defaults to <main>).
 * A screen can override where controller focus lands by marking an element with
 * `data-focus-start="true"` (e.g. the first mod card, or a wizard step's first
 * option); when present and focusable it wins over the DOM-first element.
 */
export function focusFirst(container?: HTMLElement | null): boolean {
  const root = container ?? document.querySelector<HTMLElement>("main");
  if (!root) return false;
  const items = getFocusableElements(root);
  if (items.length === 0) return false;
  const hinted = root.querySelector<HTMLElement>('[data-focus-start="true"]');
  const hintedIdx = hinted ? items.indexOf(hinted) : -1;
  const idx = hintedIdx >= 0 ? hintedIdx : 0;
  focusIndex = idx;
  items[idx].focus();
  return true;
}

// Cross-source activation lock. A single physical "confirm" can reach us twice:
// once as the polled gamepad button and once as a keyboard/mouse event that Steam
// Input mirrors for the same press. Because the two arrive a few ms apart and the
// second lands on whatever the first just navigated to, it looks like the app
// "enters the game then immediately bounces back out". Collapse activations that
// fall inside this window into one.
let lastActivateAt = 0;
const ACTIVATE_LOCK_MS = 220;

export function activateFocused(): void {
  const now = performance.now();
  if (now - lastActivateAt < ACTIVATE_LOCK_MS) return;
  const el = document.activeElement as HTMLElement;
  if (!el || el.dataset.gamepadSkip === "true") return;
  lastActivateAt = now;
  el.click();
}

export function dispatchQuickLaunch(): void {
  const el = document.activeElement as HTMLElement;
  if (el?.dataset.launchPrimary === "true") {
    el.dispatchEvent(new CustomEvent("nexusdeck-quick-launch"));
    return;
  }
  const launchBtn = document.querySelector<HTMLElement>('[data-launch-primary="true"]');
  launchBtn?.dispatchEvent(new CustomEvent("nexusdeck-quick-launch"));
}

export function scrollFocusedPane(direction: "up" | "down", amount = 120): void {
  const el = document.activeElement;
  const gallery = el?.closest('[data-focus-group="gallery"]');
  if (gallery) {
    window.dispatchEvent(
      new CustomEvent("nexusdeck-gallery-scroll", {
        detail: { direction },
      })
    );
    return;
  }
  const carousel = el?.closest("[data-scroll-carousel]");
  if (carousel) {
    carousel.scrollBy({
      left: direction === "down" ? amount : -amount,
      behavior: "smooth",
    });
    return;
  }
  const scrollParent =
    el?.closest("[data-scroll-pane]") ?? document.querySelector("main");
  scrollParent?.scrollBy({
    top: direction === "down" ? amount : -amount,
    behavior: "smooth",
  });
}

export function cycleTabs(
  tabIds: string[],
  activeTab: string,
  direction: "prev" | "next"
): string | null {
  const idx = tabIds.indexOf(activeTab);
  if (idx === -1) return null;
  if (direction === "prev") {
    return tabIds[(idx - 1 + tabIds.length) % tabIds.length];
  }
  return tabIds[(idx + 1) % tabIds.length];
}
