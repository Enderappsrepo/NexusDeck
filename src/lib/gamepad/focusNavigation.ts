const FOCUSABLE =
  'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"]), [data-focusable="true"]';

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

export function moveFocus(
  direction: "next" | "prev" | "up" | "down",
  container?: HTMLElement | null
): void {
  const current = document.activeElement as HTMLElement;
  const group = current?.closest<HTMLElement>("[data-focus-group]");
  const root = container ?? group ?? document.body;
  const items = getFocusableElements(root);
  if (items.length === 0) return;

  let idx = items.indexOf(current);
  if (idx === -1) idx = focusIndex;

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

  focusIndex = idx;
  items[idx]?.focus();
}

/** Reset directional-nav state so the next move starts from the top of the page. */
export function resetFocusIndex(): void {
  focusIndex = 0;
}

/** Focus the first interactive element within `container` (defaults to <main>). */
export function focusFirst(container?: HTMLElement | null): boolean {
  const root = container ?? document.querySelector<HTMLElement>("main");
  if (!root) return false;
  const items = getFocusableElements(root);
  if (items.length === 0) return false;
  focusIndex = 0;
  items[0].focus();
  return true;
}

export function activateFocused(): void {
  const el = document.activeElement as HTMLElement;
  if (!el) return;
  if (el.dataset.launchPrimary === "true") {
    el.click();
    return;
  }
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
